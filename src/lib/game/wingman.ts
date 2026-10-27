import { angleDiff, clamp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode } from './combat';
import { WORLD } from './constants';
import type { BlastSpec } from './defs-bombs';
import type { AirUnit } from './enemy-air';
import type { Player } from './player';
import { launchMissile, spawnBullet, type Flare } from './projectiles';
import { trackUnit } from './targeting';
import type { Trackable, Unit, UnitKind } from './types';
import type { World } from './world';

/** What the pilot last told the wingman to do. */
export type WingOrder = 'cover' | 'attack' | 'sams';

/** Who the wingman is fighting: one ground unit or one aircraft. */
export interface WingTarget {
	unit: Unit | null;
	air: AirUnit | null;
}

const CALLSIGN = 'TWO';
export const WING_HP = 90;
/** Seconds after being shot down before a replacement takes off. */
export const WING_RESPAWN = 25;
const MISSILES = 4;
/** Seconds to regain one missile. */
const MISSILE_RELOAD = 9;
/** Enemy aircraft this close to the player are engaged while covering. */
const COVER_RADIUS = 650;
/** Formation slot behind and above the leader. */
const SLOT_BACK = 38;
const SLOT_UP = 14;
const CRUISE = 105;
const TURN_RATE = 1.9;

/** Air defences the wingman hunts on a "hit the SAMs" order, most dangerous first. */
const AIR_DEFENCE: Partial<Record<UnitKind, number>> = {
	sam: 0.45,
	radar: 0.6,
	spaag: 0.75,
	flak: 0.8,
	manpads: 1
};

const AGM_BLAST: BlastSpec = {
	radius: 9,
	damage: 220,
	pierce: 0.85,
	crater: [3, 1],
	size: 0.8,
	shake: 0.2
};

const CRASH: BlastSpec = {
	radius: 12,
	damage: 120,
	pierce: 0.5,
	crater: [4, 1.2],
	size: 1.1,
	shake: 0.3
};

const isLiveTarget = (t: WingTarget | null): t is WingTarget =>
	!!t && (t.unit ? t.unit.alive : !!t.air && t.air.alive && !t.air.dying);

/**
 * A friendly AI fighter that flies on the player's wing and follows three
 * orders: cover me (stay in formation, shoot down interceptors nearby),
 * attack my target (whatever the pilot has locked or under the reticle) and
 * hit the SAMs (hunt the air defences, worst first). Its kills count as the
 * player's. Shot down, it comes back from the airfield after a while.
 */
export class Wingman implements Trackable {
	x: number;
	y: number;
	z = 0;
	vx = 0;
	vy = 0;
	angle = 0.1;
	roll = 0;
	speed = CRUISE;
	hp = WING_HP;
	alive = true;
	dying = false;
	/** Never sits on the runway: lets ground gunners treat it like the player. */
	readonly landed = false;
	heat = 1.4;
	flash = 0;
	order: WingOrder = 'cover';
	target: WingTarget | null = null;
	missiles = MISSILES;
	/** Seconds until a replacement launches (while down). */
	respawn = 0;
	/** Attack run or breaking away after one. */
	private phase: 'attack' | 'extend' = 'attack';
	private phaseTime = 0;
	private gunCd = 0;
	private burst = 0;
	private missileCd = 2;
	private reload = 0;
	private flareCd = 0;
	private spinRate = 0;
	private trail = 0;
	/** One tracking adapter per ground target, so its inbound missiles can be recognised. */
	private tracked: { unit: Unit; track: Trackable } | null = null;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
	}

	/** Airborne and fighting (not falling, not waiting for a replacement). */
	get active(): boolean {
		return this.alive && !this.dying;
	}

	/**
	 * Gives the wingman an order. `target` is the pilot's current pick for
	 * "attack my target". Returns false when the order can't be carried out
	 * (nothing to attack); the wingman then stays on cover.
	 */
	command(w: World, order: WingOrder, target: WingTarget | null = null): boolean {
		if (!this.active) {
			w.events.message(
				`${CALLSIGN} IS DOWN`,
				`Replacement in ${Math.ceil(this.respawn)} s`,
				'warn'
			);
			return false;
		}
		this.phase = 'attack';
		this.phaseTime = 0;
		if (order === 'attack') {
			if (!isLiveTarget(target)) {
				this.order = 'cover';
				this.target = null;
				w.events.message(`${CALLSIGN}: NO TARGET`, 'Lock or point at a target first', 'warn');
				return false;
			}
			this.order = 'attack';
			this.target = target;
			const name = target.unit ? target.unit.def.name : 'bandit';
			w.events.message(`${CALLSIGN}: ENGAGING`, `Going after the ${name.toLowerCase()}`, 'info');
			return true;
		}
		if (order === 'sams') {
			const next = this.nextAirDefence(w);
			if (!next) {
				this.order = 'cover';
				this.target = null;
				w.events.message(`${CALLSIGN}: NO AIR DEFENCES`, 'Staying on your wing', 'info');
				return false;
			}
			this.order = 'sams';
			this.target = { unit: next, air: null };
			w.events.message(
				`${CALLSIGN}: HUNTING SAMS`,
				`Rolling in on the ${next.def.name.toLowerCase()}`,
				'info'
			);
			return true;
		}
		this.order = 'cover';
		this.target = null;
		w.events.message(`${CALLSIGN}: ON YOUR WING`, 'Covering you', 'info');
		return true;
	}

	/** Nearest air defence site, weighted so SAMs and radars come first. */
	nextAirDefence(w: World): Unit | null {
		let best: Unit | null = null;
		let bestScore = Infinity;
		for (const u of w.units) {
			const weight = AIR_DEFENCE[u.def.kind];
			if (!u.alive || weight === undefined) continue;
			if (u.x < WORLD.arenaMinX || u.x > WORLD.arenaMaxX) continue;
			const score = Math.abs(u.x - this.x) * weight;
			if (score < bestScore) {
				bestScore = score;
				best = u;
			}
		}
		return best;
	}

	hit(w: World, amount: number): void {
		if (!this.active || w.godMode) return;
		this.hp -= amount;
		this.flash = 1;
		if (this.hp > 0) return;
		this.dying = true;
		this.spinRate = rnd.sign() * rnd.range(2, 4);
		w.fx.explosion(this.x, this.y, this.z, 0.6, false);
		w.sound.boom(0.75, this.x, this.y, true);
		w.events.message(
			'WINGMAN DOWN',
			`${CALLSIGN} is hit · replacement in ${WING_RESPAWN} s`,
			'warn'
		);
	}

	update(w: World, dt: number): void {
		this.flash = Math.max(0, this.flash - dt * 4);
		if (!this.alive) {
			this.respawn -= dt;
			if (this.respawn <= 0) this.relaunch(w);
			return;
		}
		if (this.dying) return this.fall(w, dt);
		this.gunCd -= dt;
		this.missileCd -= dt;
		this.flareCd -= dt;
		if (this.missiles < MISSILES) {
			this.reload += dt;
			if (this.reload >= MISSILE_RELOAD) {
				this.reload = 0;
				this.missiles++;
			}
		}
		this.retarget(w);
		const desired = this.steer(w, dt);
		this.fly(w, dt, desired);
		this.countermeasures(w);
	}

	/** Keeps the order's target fresh: reports kills and moves on to the next job. */
	private retarget(w: World): void {
		if (this.target && !isLiveTarget(this.target)) {
			this.target = null;
			if (this.order === 'sams') {
				const next = this.nextAirDefence(w);
				if (next) {
					this.target = { unit: next, air: null };
					w.events.message(
						`${CALLSIGN}: SITE DOWN`,
						`Next: the ${next.def.name.toLowerCase()}`,
						'good'
					);
				} else {
					this.order = 'cover';
					w.events.message(`${CALLSIGN}: AIR DEFENCES CLEAR`, 'Rejoining', 'good');
				}
			} else if (this.order === 'attack') {
				this.order = 'cover';
				w.events.message(`${CALLSIGN}: TARGET DESTROYED`, 'Rejoining', 'good');
			}
			this.phase = 'attack';
		}
		if (this.order === 'cover') {
			// Bandits near the leader get chased; a dogfight already running keeps going.
			if (this.target?.air) return;
			const threat = this.coverThreat(w);
			this.target = threat ? { unit: null, air: threat } : null;
		}
	}

	private coverThreat(w: World): AirUnit | null {
		const p = w.player;
		const cx = p && p.alive ? p.x : this.x,
			cy = p && p.alive ? p.y : this.y;
		let best: AirUnit | null = null;
		let bestD = COVER_RADIUS;
		for (const a of w.air) {
			if (!a.alive || a.dying) continue;
			const d = Math.hypot(a.x - cx, a.y - cy);
			if (d < bestD) {
				bestD = d;
				best = a;
			}
		}
		return best;
	}

	/** Heading the wingman wants this step, and the speed it wants to fly at. */
	private steer(w: World, dt: number): number {
		this.phaseTime += dt;
		const t = this.target;
		if (t?.air) return this.dogfight(w, dt, t.air);
		if (t?.unit) return this.groundAttack(w, dt, t.unit);
		return this.formation(w, dt);
	}

	private formation(w: World, dt: number): number {
		const p = w.player;
		if (!p || !p.alive || p.landed) {
			// Leader is down or parked: orbit over the airfield.
			const cx = (WORLD.runwayMinX + WORLD.runwayMaxX) / 2;
			const cy = w.ground(cx) + 130;
			this.speed = moveToward(this.speed, 90, 40 * dt);
			const toward = Math.atan2(cy - this.y, cx - this.x);
			const d = Math.hypot(cx - this.x, cy - this.y);
			return d > 160 ? toward : this.angle + 0.6;
		}
		const sp = Math.max(p.speed, 1);
		const fx = p.vx / sp,
			fy = p.vy / sp;
		const sx = p.x - fx * SLOT_BACK,
			sy = p.y - fy * SLOT_BACK + SLOT_UP;
		// Steer at where the slot will be shortly; set speed by how far off the slot itself is.
		const ex = sx - this.x,
			ey = sy - this.y;
		const along = ex * Math.cos(this.angle) + ey * Math.sin(this.angle);
		const want = clamp(p.speed + along * 0.9, 55, 165);
		this.speed = moveToward(this.speed, want, 90 * dt);
		return Math.atan2(ey + p.vy * 0.6, ex + p.vx * 0.6);
	}

	private dogfight(w: World, dt: number, a: AirUnit): number {
		const dx = a.x - this.x,
			dy = a.y - this.y;
		const dist = Math.hypot(dx, dy);
		this.speed = moveToward(this.speed, 120, 90 * dt);
		if (this.phase === 'extend') {
			if (this.phaseTime > 2.4) this.setPhase('attack');
			return this.angle + angleDiff(this.angle, Math.atan2(-dy, -dx)) * 0.4;
		}
		const lead = dist / 640;
		const aim = Math.atan2(a.y + a.vy * lead - this.y, a.x + a.vx * lead - this.x);
		const err = Math.abs(angleDiff(this.angle, aim));
		if (err < 0.14 && dist < 420) this.guns(w);
		if (err < 0.5 && dist > 200 && dist < 700 && this.missileCd <= 0 && this.missiles > 0) {
			this.fireMissile(w, a, 'air');
		}
		if (dist < 90) this.setPhase('extend');
		return aim;
	}

	private groundAttack(w: World, dt: number, u: Unit): number {
		const ty = u.y + u.def.half[1];
		const dx = u.x - this.x,
			dy = ty - this.y;
		const dist = Math.hypot(dx, dy);
		const agl = this.y - w.surface.clearance(this.x);
		this.speed = moveToward(this.speed, CRUISE, 90 * dt);
		if (this.phase === 'extend') {
			// Climb out ahead, then come around for another pass.
			if (this.phaseTime > 2.6 && agl > 90) this.setPhase('attack');
			return Math.cos(this.angle) >= 0 ? 0.55 : Math.PI - 0.55;
		}
		if (Math.abs(dx) > 420) {
			// Run in at height, then roll in.
			const alt = w.ground(u.x) + 150;
			return Math.atan2(alt - this.y, dx);
		}
		const aim = Math.atan2(dy, dx);
		const err = Math.abs(angleDiff(this.angle, aim));
		const inbound = w.missiles.some((m) => m.owner === 'player' && m.target === this.trackOf(u));
		if (err < 0.45 && dist < 620 && this.missileCd <= 0 && this.missiles > 0 && !inbound) {
			this.fireMissile(w, u, 'agm');
		}
		if (err < 0.1 && dist < 380) this.guns(w);
		if (dist < 110 || agl < 70) this.setPhase('extend');
		return aim;
	}

	private setPhase(phase: 'attack' | 'extend'): void {
		this.phase = phase;
		this.phaseTime = 0;
	}

	/** Stable tracking adapter for the current ground target. */
	private trackOf(u: Unit): Trackable {
		if (this.tracked?.unit === u) return this.tracked.track;
		const track = trackUnit(u);
		this.tracked = { unit: u, track };
		return track;
	}

	private fly(w: World, dt: number, desired: number): void {
		let target = desired;
		const ground = w.surface.clearance(this.x);
		const right = Math.cos(this.angle) >= 0;
		if (this.y - ground < 45) target = right ? 0.8 : Math.PI - 0.8;
		if (this.y > WORLD.ceiling - 40) target = right ? -0.35 : Math.PI + 0.35;
		if (this.x < WORLD.arenaMinX + 60) target = 0.3;
		if (this.x > WORLD.arenaMaxX + 60) target = Math.PI - 0.3;
		const rate = TURN_RATE * (this.speed < 80 ? 1.2 : 1);
		this.angle = wrapAngle(
			this.angle + clamp(angleDiff(this.angle, target), -rate * dt, rate * dt)
		);
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		const c = Math.cos(this.angle);
		this.roll = moveToward(this.roll, c > 0.15 ? 0 : c < -0.15 ? Math.PI : this.roll, dt * 3.5);
		this.trail += dt;
		if (this.trail > 0.04) {
			this.trail = 0;
			if (this.hp < WING_HP * 0.4) w.fx.trail(this.x, this.y, 0, 1, 0.08, 0.7, 2, 0.2);
		}
	}

	private guns(w: World): void {
		if (this.gunCd > 0) return;
		if (this.burst <= 0) this.burst = 10;
		this.burst--;
		this.gunCd = this.burst > 0 ? 0.06 : rnd.range(0.5, 0.9);
		const a = this.angle + rnd.gauss(0.02);
		const mx = this.x + Math.cos(this.angle) * 5,
			my = this.y + Math.sin(this.angle) * 5;
		spawnBullet(w, {
			x: mx,
			y: my,
			z: 0,
			vx: Math.cos(a) * 700 + this.vx,
			vy: Math.sin(a) * 700 + this.vy,
			life: 1.1,
			damage: 5,
			pierce: 0.3,
			owner: 'player',
			tracer: true,
			color: [3, 9, 12],
			size: 0.2,
			explosive: 0
		});
		w.fx.muzzleFlash(mx, my, 0, Math.cos(a), Math.sin(a), 0.9, [8, 10, 12]);
		w.sound.play('gun', mx, my, 0.3, 1.15);
	}

	private fireMissile(w: World, t: Unit | AirUnit, kind: 'air' | 'agm'): void {
		this.missiles--;
		this.missileCd = kind === 'air' ? rnd.range(6, 9) : rnd.range(3, 4.5);
		const track = kind === 'agm' ? this.trackOf(t as Unit) : (t as AirUnit);
		launchMissile(w, {
			kind,
			x: this.x + Math.cos(this.angle) * 2,
			y: this.y - 1,
			z: 0,
			angle: this.angle,
			speed: Math.max(60, this.speed),
			maxSpeed: kind === 'air' ? 240 : 290,
			accel: 230,
			turnRate: kind === 'air' ? 3 : 4,
			target: track,
			burn: 3,
			life: 7,
			damage: kind === 'air' ? 30 : 0,
			owner: 'player',
			seeker: kind === 'air' ? 'heat' : 'radar',
			blast: kind === 'agm' ? AGM_BLAST : undefined
		});
	}

	/** Pops flares when an enemy missile chasing it gets close. */
	private countermeasures(w: World): void {
		if (this.flareCd > 0) return;
		const close = w.missiles.some(
			(m) =>
				m.owner === 'enemy' && m.target === this && Math.hypot(m.x - this.x, m.y - this.y) < 380
		);
		if (!close) return;
		this.flareCd = rnd.range(1.6, 2.4);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		for (let i = 0; i < 4; i++) {
			const side = i % 2 === 0 ? 1 : -1;
			const f: Flare = {
				x: this.x - ca * 2.5,
				y: this.y - sa * 2.5 - 0.8,
				z: 0,
				vx: this.vx * 0.8 - ca * 6,
				vy: this.vy * 0.8 - sa * 6 - 8 - i * 2,
				vz: side * (5 + i * 1.4),
				alive: true,
				heat: 4,
				age: 0,
				life: rnd.range(2.8, 3.6)
			};
			w.flares.push(f);
		}
		w.sound.play('flare', this.x, this.y, 0.5);
	}

	private fall(w: World, dt: number): void {
		this.vy -= 14 * dt;
		this.vx *= Math.exp(-0.3 * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.angle += this.spinRate * 0.3 * dt;
		this.roll += this.spinRate * dt;
		this.trail += dt;
		if (this.trail > 0.025) {
			this.trail = 0;
			w.fx.trail(this.x, this.y, 0, 1.8, 0.03, 0.85, 4, 0.3);
			w.fx.flame(this.x, this.y, 0, 1.3, 1.1);
		}
		const g = w.surface.clearance(this.x);
		if (this.y > g + 1) return;
		this.alive = false;
		this.dying = false;
		this.respawn = WING_RESPAWN;
		explode(w, this.x, g, 0, CRASH, 'player', { playerScale: 0 });
		w.fires.add(this.x, g, 0, 1.4, 14, { radius: 2.2 });
	}

	private relaunch(w: World): void {
		this.x = WORLD.runwayMinX + 60;
		this.y = w.ground(this.x) + 55;
		this.angle = 0.12;
		this.roll = 0;
		this.speed = CRUISE;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.hp = WING_HP;
		this.alive = true;
		this.dying = false;
		this.missiles = MISSILES;
		this.order = 'cover';
		this.target = null;
		this.setPhase('attack');
		w.events.message(`${CALLSIGN}: BACK ON STATION`, 'Joining up', 'good');
	}
}

/**
 * The friendly aircraft an enemy at (x, y) should shoot at: the player or the
 * wingman, whichever is closer (the player when both are equally placed).
 */
export function nearestFriendly(w: World, x: number, y: number): Player | Wingman | null {
	const p = w.player;
	const wing = w.wingman;
	const pOk = !!p && p.alive && !w.godMode;
	const wOk = !!wing && wing.active && !w.godMode;
	if (!wOk) return pOk ? p : null;
	if (!pOk) return wing;
	const dp = Math.hypot(p!.x - x, p!.y - y);
	const dw = Math.hypot(wing!.x - x, wing!.y - y);
	return dw < dp * 0.85 ? wing : p;
}

export function updateWingman(w: World, dt: number): void {
	w.wingman?.update(w, dt);
}
