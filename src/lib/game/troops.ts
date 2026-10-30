import { damp, dampAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { segmentVsUnit } from './combat';
import { ragdoll } from './deaths';
import { UNITS } from './defs-units';
import { spawnBullet } from './projectiles';
import type { Unit, UnitDef } from './types';
import type { World } from './world';

/** A friendly paratrooper: a rifleman body with its own jump and fight logic. */
export type Trooper = Unit & {
	vx: number;
	vy: number;
	/** Canopy deployment 0..1 (0 in freefall or after landing). */
	chute: number;
	landed: boolean;
	burstLeft: number;
};

const PARA_DEF: UnitDef = { ...UNITS.rifleman, name: 'Paratrooper', hp: 34, speed: 2.8, score: 0 };
/** Static-line delay, and the low altitude a free-falling jumper opens at. */
const FREEFALL = 4;
const OPEN_ALT = 55;
const CHUTE_SINK = 5.5;
const RANGE = 110;

/** Friendly airborne infantry: drop, drift down, then advance and fight. */
export class Troops {
	readonly list: Trooper[] = [];

	drop(w: World, x: number, y: number, vx: number, count: number): void {
		for (let i = 0; i < count; i++) {
			const u = w.makeUnit('rifleman', x - i * 2.2, rnd.range(-3, 3), 1) as Trooper;
			u.def = PARA_DEF;
			u.hp = PARA_DEF.hp;
			u.y = y + rnd.range(-1, 1);
			u.vx = vx * 0.8 + rnd.gauss(2);
			u.vy = rnd.range(-2, 0);
			u.chute = 0;
			u.landed = false;
			u.burstLeft = 0;
			u.stateTime = -i * 0.18;
			this.list.push(u);
		}
	}

	/** Nearest live trooper to (x, y) within `range`, for enemy riflemen to shoot at. */
	nearest(
		x: number,
		y: number,
		range: number,
		known: (t: Trooper) => boolean = () => true
	): Trooper | null {
		let best: Trooper | null = null;
		let bestD = range;
		for (const t of this.list) {
			if (!known(t)) continue;
			if (!t.alive || !t.landed) continue;
			const d = Math.hypot(t.x - x, t.y - y);
			if (d < bestD) {
				bestD = d;
				best = t;
			}
		}
		return best;
	}

	/** Enemy fire striking a trooper (returns true if the round was stopped). */
	bulletHit(x0: number, y0: number, x1: number, y1: number, damage: number): boolean {
		for (const t of this.list) {
			if (!t.alive || segmentVsUnit(t, x0, y0, x1, y1, 0.2) < 0) continue;
			t.hp -= damage;
			t.flash = 1;
			return true;
		}
		return false;
	}

	/** Blast damage (friendly fire included). */
	blast(x: number, y: number, radius: number, damage: number): void {
		for (const t of this.list) {
			if (!t.alive) continue;
			const d = Math.hypot(t.x - x, t.y + 1 - y);
			if (d < radius) t.hp -= damage * (1 - d / radius);
		}
	}

	update(w: World, dt: number): void {
		for (let i = this.list.length - 1; i >= 0; i--) {
			const t = this.list[i];
			t.stateTime += dt;
			t.flash = Math.max(0, t.flash - dt * 4);
			if (t.alive && t.hp <= 0) {
				t.alive = false;
				ragdoll(w, t, -1, 'bullet');
				w.events.message('', 'Paratrooper down', 'warn');
			}
			if (t.remove || !t.alive) {
				this.list.splice(i, 1);
				continue;
			}
			if (!t.landed) this.fall(w, t, dt);
			else this.fight(w, t, dt);
		}
	}

	private fall(w: World, t: Trooper, dt: number): void {
		const alt = t.y - w.surface.support(t.x, t.y, t.z);
		if (t.stateTime > FREEFALL || alt < OPEN_ALT) t.chute = Math.min(1, t.chute + dt * 1.6);
		const sink = t.chute > 0 ? CHUTE_SINK + (1 - t.chute) * 14 : 30;
		t.vy = damp(t.vy, -sink, t.chute > 0 ? 3 : 0.8, dt);
		t.vx = damp(t.vx, w.particles.windX * 0.8, t.chute > 0 ? 1.2 : 0.2, dt);
		t.x += t.vx * dt;
		t.y += t.vy * dt;
		t.anim += dt * 2;
		const ground = w.surface.support(t.x, t.y, t.z);
		const water = w.surface.water(t.x, t.z);
		if (t.y <= Math.max(ground, water)) {
			if (water > ground) {
				// Dragged under by the kit.
				w.fx.water.splash(t.x, water, t.z, 0.8);
				t.alive = false;
				t.remove = true;
				return;
			}
			t.y = ground;
			t.landed = true;
			t.chute = 0;
			t.stateTime = 0;
			w.fx.dustRing(t.x, ground, t.z, 0.3);
		}
	}

	private fight(w: World, t: Trooper, dt: number): void {
		let foe: Unit | null = null;
		let best = RANGE;
		for (const u of w.units) {
			if (!u.alive) continue;
			const d = Math.abs(u.x - t.x);
			if (d < best) {
				best = d;
				foe = u;
			}
		}
		const want = foe ? 0 : t.def.speed;
		t.dir = foe ? (foe.x > t.x ? 1 : -1) : 1;
		t.speed = damp(t.speed, want, 6, dt);
		t.x += t.speed * t.dir * dt;
		t.y = w.surface.support(t.x, t.y + 1, t.z);
		t.yaw = dampAngle(t.yaw, t.dir < 0 ? Math.PI : 0, 6, dt);
		t.anim += (t.speed * dt) / 0.3;
		t.cooldown -= dt;
		if (!foe || t.cooldown > 0) return;
		const ox = t.x + t.dir * 0.6,
			oy = t.y + 1.45;
		const tx = foe.x,
			ty = foe.y + foe.def.half[1];
		const a = Math.atan2(ty - oy, tx - ox) + rnd.gauss(0.02);
		spawnBullet(w, {
			x: ox,
			y: oy,
			z: t.z,
			vx: Math.cos(a) * 520,
			vy: Math.sin(a) * 520,
			life: 1.2,
			damage: 7,
			pierce: 0.05,
			owner: 'player',
			tracer: rnd.chance(0.5),
			color: [6, 9, 4],
			size: 0.1,
			explosive: 0
		});
		w.fx.muzzleFlash(ox, oy, t.z, Math.cos(a), Math.sin(a), 0.5, [8, 6, 3]);
		if (rnd.chance(0.3)) w.sound.play('rifle', ox, oy, 0.4);
		t.burstLeft--;
		if (t.burstLeft <= 0) {
			t.burstLeft = 3 + Math.floor(rnd.range(0, 3));
			t.cooldown = rnd.range(0.8, 1.5);
		} else {
			t.cooldown = 0.11;
		}
	}

	clear(): void {
		this.list.length = 0;
	}
}
