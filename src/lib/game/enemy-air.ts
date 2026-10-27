import { angleDiff, clamp, damp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode } from './combat';
import { WORLD } from './constants';
import type { BlastSpec } from './defs-bombs';
import { launchMissile, spawnBullet } from './projectiles';
import type { Owner, Trackable } from './types';
import { nearestFriendly } from './wingman';
import type { World } from './world';

export type AirKind = 'fighter' | 'heli';

const CRASH: BlastSpec = {
	radius: 14,
	damage: 140,
	pierce: 0.6,
	crater: [5, 1.5],
	size: 1.3,
	shake: 0.4
};

/** Enemy aircraft: interceptors that dogfight the player and gunship helicopters. */
export class AirUnit implements Trackable {
	readonly id: number;
	readonly kind: AirKind;
	x: number;
	y: number;
	z = 0;
	vx = 0;
	vy = 0;
	angle: number;
	roll = 0;
	rotor = 0;
	tilt = 0;
	alive = true;
	dying = false;
	dead = false;
	hp: number;
	readonly maxHp: number;
	readonly radius: number;
	readonly score: number;
	heat = 1.6;
	flash = 0;
	private state: 'attack' | 'extend' = 'attack';
	private stateTime = 0;
	private gunCd = 1;
	private burst = 0;
	private missileCd: number;
	private trail = 0;
	private spinRate = 0;
	private rocketCd = 3;

	constructor(id: number, kind: AirKind, x: number, y: number) {
		this.id = id;
		this.kind = kind;
		this.x = x;
		this.y = y;
		this.angle = Math.PI;
		this.hp = this.maxHp = kind === 'fighter' ? 70 : 95;
		this.radius = kind === 'fighter' ? 6 : 5.5;
		this.score = kind === 'fighter' ? 300 : 220;
		this.missileCd = rnd.range(8, 14);
		const sp = kind === 'fighter' ? 85 : 22;
		this.vx = -sp;
		this.roll = Math.PI;
	}

	damage(w: World, amount: number, by: Owner): void {
		if (!this.alive || this.dying) return;
		this.hp -= amount;
		this.flash = 1;
		if (this.hp > 0) return;
		this.dying = true;
		this.spinRate = rnd.sign() * rnd.range(2, 4);
		w.fx.explosion(this.x, this.y, this.z, 0.6, false);
		w.sound.boom(0.75, this.x, this.y, true);
		w.events.kill(
			this.kind === 'fighter' ? 'Interceptor' : 'Gunship',
			this.score,
			this.x,
			this.y + 6,
			by
		);
	}

	update(w: World, dt: number): void {
		this.flash = Math.max(0, this.flash - dt * 4);
		this.rotor += dt * 32;
		if (this.dying) return this.fall(w, dt);
		if (this.kind === 'fighter') this.fly(w, dt);
		else this.hover(w, dt);
	}

	private fly(w: World, dt: number): void {
		const p = nearestFriendly(w, this.x, this.y);
		this.stateTime += dt;
		this.gunCd -= dt;
		this.missileCd -= dt;
		let target = this.angle;
		const ground = w.surface.clearance(this.x);
		if (p) {
			const dx = p.x - this.x,
				dy = p.y - this.y;
			const dist = Math.hypot(dx, dy);
			const t = dist / 600;
			const aim = Math.atan2(p.y + p.vy * t - this.y, p.x + p.vx * t - this.x);
			if (this.state === 'attack') {
				target = aim;
				const err = Math.abs(angleDiff(this.angle, aim));
				if (err < 0.13 && dist < 430) this.guns(w);
				if (err < 0.45 && dist > 260 && dist < 720 * w.weather.irScale() && this.missileCd <= 0) {
					this.missileCd = rnd.range(11, 16);
					launchMissile(w, {
						kind: 'air',
						x: this.x,
						y: this.y - 1,
						z: 0,
						angle: this.angle,
						speed: 90,
						maxSpeed: 230,
						accel: 200,
						turnRate: 2.4,
						target: p,
						burn: 2.6,
						life: 6,
						damage: 30,
						owner: 'enemy',
						seeker: 'heat'
					});
					if (p !== w.wingman) w.events.message('MISSILE LAUNCH', '', 'warn');
				}
				if (dist < 110) {
					this.state = 'extend';
					this.stateTime = 0;
				}
			} else {
				target = this.angle + angleDiff(this.angle, Math.atan2(-dy, -dx)) * 0.4;
				if (this.stateTime > rnd.range(2.2, 3.4)) this.state = 'attack';
			}
		} else {
			target = this.x > 1200 ? Math.PI : 0;
		}
		if (this.y - ground < 70)
			target =
				0.9 * (Math.cos(this.angle) >= 0 ? 1 : -1) + (Math.cos(this.angle) >= 0 ? 0 : Math.PI);
		if (this.y > WORLD.ceiling - 40) target = Math.cos(this.angle) >= 0 ? -0.4 : Math.PI + 0.4;
		if (this.x < WORLD.arenaMinX + 80) target = 0.3;
		if (this.x > WORLD.arenaMaxX + 80) target = Math.PI - 0.3;
		this.angle = wrapAngle(this.angle + clamp(angleDiff(this.angle, target), -1.7 * dt, 1.7 * dt));
		const speed = 88;
		this.vx = Math.cos(this.angle) * speed;
		this.vy = Math.sin(this.angle) * speed;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		const c = Math.cos(this.angle);
		this.roll = moveToward(this.roll, c > 0.15 ? 0 : c < -0.15 ? Math.PI : this.roll, dt * 3.5);
		this.trail += dt;
		if (this.trail > 0.03) {
			this.trail = 0;
			w.fx.exhaust(
				this.x - c * 6,
				this.y - Math.sin(this.angle) * 6,
				0,
				c,
				Math.sin(this.angle),
				0.4,
				this.vx,
				this.vy
			);
			if (this.hp < this.maxHp * 0.5) w.fx.trail(this.x, this.y, 0, 1, 0.08, 0.7, 2, 0.2);
		}
	}

	private guns(w: World): void {
		if (this.gunCd > 0) return;
		if (this.burst <= 0) {
			this.burst = 8;
		}
		this.burst--;
		this.gunCd = this.burst > 0 ? 0.07 : rnd.range(0.8, 1.4);
		const a = this.angle + rnd.gauss(0.03);
		const mx = this.x + Math.cos(this.angle) * 5,
			my = this.y + Math.sin(this.angle) * 5;
		spawnBullet(w, {
			x: mx,
			y: my,
			z: 0,
			vx: Math.cos(a) * 640 + this.vx,
			vy: Math.sin(a) * 640 + this.vy,
			life: 1.2,
			damage: 3.2,
			pierce: 0,
			owner: 'enemy',
			tracer: true,
			color: [12, 3, 1.5],
			size: 0.2,
			explosive: 0
		});
		w.fx.muzzleFlash(mx, my, 0, Math.cos(a), Math.sin(a), 0.9, [12, 5, 2]);
		w.sound.play('mg', mx, my, 0.4, 1.3);
	}

	private hover(w: World, dt: number): void {
		const p = nearestFriendly(w, this.x, this.y);
		this.gunCd -= dt;
		this.rocketCd -= dt;
		const ground = w.surface.clearance(this.x);
		const near = p ? Math.hypot(p.x - this.x, p.y - this.y) : Infinity;
		const atBase = this.x < WORLD.baseMaxX + 520;
		let wantVx = atBase ? 0 : -24;
		if (near < 420) wantVx *= 0.3;
		this.vx = damp(this.vx, wantVx, 0.8, dt);
		const wantY = ground + 46 + Math.sin(w.time * 0.7 + this.id) * 8;
		this.vy = damp(this.vy, (wantY - this.y) * 0.8, 1.5, dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.tilt = damp(this.tilt, this.vx * 0.012, 2, dt);
		if (p && near < 380 && this.gunCd <= 0) {
			this.gunCd = this.burst > 0 ? 0.09 : rnd.range(1.4, 2.2);
			this.burst = this.burst > 0 ? this.burst - 1 : 6;
			const t = near / 520;
			const a = Math.atan2(p.y + p.vy * t - this.y, p.x + p.vx * t - this.x) + rnd.gauss(0.04);
			spawnBullet(w, {
				x: this.x + 2.5,
				y: this.y + 1.2,
				z: 0,
				vx: Math.cos(a) * 520,
				vy: Math.sin(a) * 520,
				life: 1.4,
				damage: 2.4,
				pierce: 0,
				owner: 'enemy',
				tracer: true,
				color: [12, 4, 1.4],
				size: 0.18,
				explosive: 0
			});
			w.fx.muzzleFlash(this.x + 2.8, this.y + 1.2, 0, Math.cos(a), Math.sin(a), 0.8, [12, 5, 2]);
			w.sound.play('mg', this.x, this.y, 0.4, 1.1);
		}
		if (atBase && this.rocketCd <= 0) {
			this.rocketCd = rnd.range(2.5, 4);
			const tx = rnd.range(WORLD.baseMinX + 40, WORLD.baseMaxX - 20);
			const a = Math.atan2(w.surface.clearance(tx) - this.y, tx - this.x);
			w.shells.push({
				kind: 'rocket',
				x: this.x,
				y: this.y + 1,
				z: 1.6,
				vx: Math.cos(a) * 160,
				vy: Math.sin(a) * 160,
				age: 0,
				fuse: Infinity,
				damage: 12,
				radius: 6,
				owner: 'enemy',
				trail: 0
			});
			w.base.damage(w, 6);
			w.sound.play('missileLaunch', this.x, this.y, 0.5, 1.6);
		}
		if (this.hp < this.maxHp * 0.5 && rnd.chance(dt * 15))
			w.fx.trail(this.x, this.y + 2.5, 0, 1, 0.07, 0.7, 2.5, 0.5);
	}

	private fall(w: World, dt: number): void {
		this.vy -= 14 * dt;
		this.vx *= Math.exp(-0.3 * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.kind === 'fighter') {
			this.angle += this.spinRate * 0.3 * dt;
			this.roll += this.spinRate * dt;
		} else {
			this.rotor += this.spinRate * dt;
			this.tilt += this.spinRate * 0.15 * dt;
		}
		this.trail += dt;
		if (this.trail > 0.025) {
			this.trail = 0;
			w.fx.trail(this.x, this.y, 0, 1.8, 0.03, 0.85, 4, 0.3);
			w.fx.flame(this.x, this.y, 0, 1.3, 1.1);
		}
		const g = w.surface.clearance(this.x);
		if (this.y > g + 1) return;
		this.alive = false;
		this.dead = true;
		explode(w, this.x, g, 0, CRASH, 'player', { playerScale: 0.5 });
		w.fires.add(this.x, g, 0, 1.6, 16, { radius: 2.5 });
	}
}

export function updateAir(w: World, dt: number): void {
	for (const a of w.air) a.update(w, dt);
	for (let i = w.air.length - 1; i >= 0; i--) if (w.air[i].dead) w.air.splice(i, 1);
}
