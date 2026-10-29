import { angleDiff, clamp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode, inBattlePlane } from './combat';
import { WORLD } from './constants';
import type { BlastSpec } from './defs-bombs';
import type { AirUnit } from './enemy-air';
import type { Player } from './player';
import { launchMissile, spawnBullet, type Flare } from './projectiles';
import { trackUnit } from './targeting';
import type { AircraftId, Trackable, Unit, UnitKind } from './types';
import type { World } from './world';

/** What the pilot last told the wingman to do. */
export type WingOrder = 'cover' | 'attack' | 'sams' | 'rearm';

/** Who the wingman is fighting: one ground unit or one aircraft. */
export interface WingTarget {
	unit: Unit | null;
	air: AirUnit | null;
}

const CALLSIGN = 'TWO';
export const WING_HP = 90;
export const WING_MISSILES = 4;
/** Per-round gun damage (a little lighter than the player's guns). */
export const WING_GUN_DAMAGE = 4;
/** Air-to-air missile hit. */
export const WING_AAM_DAMAGE = 25;
/** Seconds over the runway to repair fully and refill every missile. */
export const WING_REARM_TIME = 4;
/** Seconds to regain one missile. */
const MISSILE_RELOAD = 9;
/** Enemy aircraft this close to the player are engaged while covering. */
const COVER_RADIUS = 650;
/** Formation slot behind and above the leader. */
const SLOT_BACK = 38;
const SLOT_UP = 14;
const CRUISE = 105;
const TURN_RATE = 1.9;
/** How far from the leader the wingman looks for targets of his own. */
const HUNT_RADIUS = 1400;
/** Seconds between looks for a better target while hunting freely. */
const RESCAN = 1.2;
/** Lining up this far beyond the runway end before the low pass. */
const RTB_LINEUP = 130;
/** Height and speed of the slow rearm pass over the runway. */
const PASS_ALT = 12;
const PASS_SPEED = 62;

/** Air defences the wingman hunts on a "hit the SAMs" order, most dangerous first. */
const AIR_DEFENCE: Partial<Record<UnitKind, number>> = {
	sam: 0.45,
	cruiser: 0.5,
	radar: 0.6,
	spaag: 0.75,
	flak: 0.8,
	manpads: 1
};

export const AGM_BLAST: BlastSpec = {
	radius: 9,
	damage: 185,
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
 * A friendly AI fighter that flies with the player. By default it is on the
 * attack, picking the most dangerous target near the leader by itself; the
 * pilot can point it at a target (T), call it back to cover (G), send it after
 * the air defences (H) or home to repair and rearm (Y). Its kills count as the
 * player's. Shot down, it stays down until the next wave, when a replacement
 * climbs out from the airfield.
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
	order: WingOrder = 'attack';
	target: WingTarget | null = null;
	/** True when the pilot picked the target; otherwise the wingman chose it. */
	assigned = false;
	missiles = WING_MISSILES;
	/** Orders carried out so far (lets the tutorial notice a repeated order). */
	commands = 0;
	/** Replacements that have joined since the start (the radio announces each). */
	rejoins = 0;
	/** A replacement is due as soon as the falling wreck hits the ground. */
	private rejoinPending = false;
	/** Return to base: flying to the runway, or on the slow pass along it. */
	private rtb: 'inbound' | 'final' = 'inbound';
	/** Direction of the runway pass (+1 east, -1 west). */
	private passDir = -1;
	/** Down low over the runway: the usual ground-clearance floor is relaxed. */
	private lowPass = false;
	private rearmClock = 0;
	private scan = 0;
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
	/** Airframe it is drawn as. */
	readonly aircraft: AircraftId;
	/** Radio name for its calls; null keeps it off the radio (the commander's air units). */
	readonly callsign: string | null;
	/**
	 * With no leader to fly with: where along the road it hunts and orbits
	 * (null: over the airfield).
	 */
	patrol: number | null = null;

	constructor(
		x: number,
		y: number,
		opts: { aircraft?: AircraftId; callsign?: string | null } = {}
	) {
		this.x = x;
		this.y = y;
		this.aircraft = opts.aircraft ?? 'f16';
		this.callsign = opts.callsign === undefined ? CALLSIGN : opts.callsign;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
	}

	/** A radio call, unless this aircraft keeps quiet. */
	private say(w: World, text: string, sub: string, tone: 'info' | 'warn' | 'good'): void {
		if (this.callsign) w.events.message(`${this.callsign}${text}`, sub, tone);
	}

	/** Airborne and fighting (not falling, not waiting for a replacement). */
	get active(): boolean {
		return this.alive && !this.dying;
	}

	/**
	 * Gives the wingman an order. `target` is the pilot's current pick for
	 * "attack my target"; without one the wingman picks its own. Returns false
	 * when the order can't be carried out (the wingman is down).
	 */
	command(w: World, order: WingOrder, target: WingTarget | null = null): boolean {
		if (!this.active) {
			this.say(w, ' IS DOWN', 'A replacement joins next wave', 'warn');
			return false;
		}
		this.commands++;
		this.setPhase('attack');
		this.assigned = false;
		this.target = null;
		this.lowPass = false;
		if (order === 'rearm') {
			this.order = 'rearm';
			this.rtb = 'inbound';
			this.say(w, ': RTB', 'Heading home to repair and rearm', 'info');
			return true;
		}
		if (order === 'attack') {
			this.order = 'attack';
			if (!isLiveTarget(target)) {
				this.scan = 0;
				this.say(w, ': WEAPONS FREE', 'Picking his own targets', 'info');
				return true;
			}
			this.target = target;
			this.assigned = true;
			const name = target.unit ? target.unit.def.name : 'bandit';
			this.say(w, ': ENGAGING', `Going after the ${name.toLowerCase()}`, 'info');
			return true;
		}
		if (order === 'sams') {
			const next = this.nextAirDefence(w);
			if (!next) {
				this.order = 'attack';
				this.say(w, ': NO AIR DEFENCES', 'Weapons free', 'info');
				return true;
			}
			this.order = 'sams';
			this.target = { unit: next, air: null };
			this.say(w, ': HUNTING SAMS', `Rolling in on the ${next.def.name.toLowerCase()}`, 'info');
			return true;
		}
		this.order = 'cover';
		this.say(w, ': ON YOUR WING', 'Covering you', 'info');
		return true;
	}

	/**
	 * A new wave: if the wingman is down, a replacement climbs out from the
	 * airfield (once the wreck of the last one is on the ground). Returns true
	 * when one is on its way.
	 */
	reinforce(w: World): boolean {
		if (this.active) return false;
		if (this.dying) this.rejoinPending = true;
		else this.relaunch(w);
		return true;
	}

	/** Nearest air defence site, weighted so SAMs and radars come first. */
	nextAirDefence(w: World): Unit | null {
		let best: Unit | null = null;
		let bestScore = Infinity;
		for (const u of w.units) {
			const weight = AIR_DEFENCE[u.def.kind];
			if (!u.alive || weight === undefined || !inBattlePlane(u)) continue;
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
		this.target = null;
		this.lowPass = false;
		this.say(w, ' IS DOWN', 'Mayday · a replacement joins next wave', 'warn');
	}

	update(w: World, dt: number): void {
		this.flash = Math.max(0, this.flash - dt * 4);
		if (!this.alive) return;
		if (this.dying) return this.fall(w, dt);
		this.gunCd -= dt;
		this.missileCd -= dt;
		this.flareCd -= dt;
		if (this.missiles < WING_MISSILES && this.order !== 'rearm') {
			this.reload += dt;
			if (this.reload >= MISSILE_RELOAD) {
				this.reload = 0;
				this.missiles++;
			}
		}
		this.retarget(w, dt);
		const desired = this.steer(w, dt);
		this.fly(w, dt, desired);
		this.countermeasures(w);
	}

	/** Keeps the order's target fresh: reports kills and moves on to the next job. */
	private retarget(w: World, dt: number): void {
		if (this.order === 'rearm') {
			// Heading home: no fights picked on the way.
			this.target = null;
			return;
		}
		if (this.target && !isLiveTarget(this.target)) {
			this.target = null;
			if (this.order === 'sams') {
				const next = this.nextAirDefence(w);
				if (next) {
					this.target = { unit: next, air: null };
					this.say(w, ': SITE DOWN', `Next: the ${next.def.name.toLowerCase()}`, 'good');
				} else {
					this.order = 'attack';
					this.say(w, ': AIR DEFENCES CLEAR', 'Weapons free', 'good');
				}
			} else if (this.order === 'attack' && this.assigned) {
				this.say(w, ': TARGET DESTROYED', 'Picking the next one', 'good');
			}
			this.assigned = false;
			this.scan = 0;
			this.phase = 'attack';
		}
		if (this.order === 'cover') {
			// Bandits near the leader get chased; a dogfight already running keeps going.
			if (this.target?.air) return;
			const threat = this.coverThreat(w);
			this.target = threat ? { unit: null, air: threat } : null;
			return;
		}
		if (this.order !== 'attack' || this.assigned || this.target?.air) return;
		// Hunting freely: bandits after the leader come first, then the worst thing on the ground.
		this.scan -= dt;
		if (this.scan > 0) return;
		this.scan = RESCAN;
		const threat = this.coverThreat(w);
		if (threat) {
			this.target = { unit: null, air: threat };
			this.setPhase('attack');
			return;
		}
		if (this.target) return;
		this.target = this.autoTarget(w);
	}

	/**
	 * The target the wingman picks for itself: the closest enemy near the
	 * leader, weighted so air defences, aircraft and siege units come first.
	 */
	autoTarget(w: World): WingTarget | null {
		const p = w.player;
		const cx = p && p.alive && !p.landed ? p.x : (this.patrol ?? this.x);
		let best: WingTarget | null = null;
		let bestScore = Infinity;
		for (const a of w.air) {
			if (!a.alive || a.dying || Math.abs(a.x - cx) > HUNT_RADIUS) continue;
			const score = Math.hypot(a.x - this.x, a.y - this.y) * 0.5;
			if (score < bestScore) {
				bestScore = score;
				best = { unit: null, air: a };
			}
		}
		for (const u of w.units) {
			if (!u.alive || !inBattlePlane(u) || Math.abs(u.x - cx) > HUNT_RADIUS) continue;
			if (u.x < WORLD.arenaMinX || u.x > WORLD.arenaMaxX) continue;
			const danger =
				AIR_DEFENCE[u.def.kind] ??
				(u.def.boss || u.def.siege > 0 ? 0.8 : u.def.category === 'infantry' ? 1.6 : 1);
			const score = (Math.abs(u.x - this.x) * danger) / (1 + u.def.score / 500);
			if (score < bestScore) {
				bestScore = score;
				best = { unit: u, air: null };
			}
		}
		return best;
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
		if (this.order === 'rearm') return this.returnToBase(w, dt);
		this.lowPass = false;
		const t = this.target;
		if (t?.air) return this.dogfight(w, dt, t.air);
		if (t?.unit) return this.groundAttack(w, dt, t.unit);
		return this.formation(w, dt);
	}

	private formation(w: World, dt: number): number {
		const p = w.player;
		if (!p || !p.alive || p.landed) {
			// Leader is down or parked (or there is none): orbit over the patrol line or the airfield.
			const cx = this.patrol ?? (WORLD.runwayMinX + WORLD.runwayMaxX) / 2;
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

	/**
	 * Flies home, lines up beyond the nearer end of the runway and makes a
	 * low, slow pass along it, repairing and rearming while over the tarmac.
	 * Passes again until topped up, then goes back on the attack.
	 */
	private returnToBase(w: World, dt: number): number {
		const lo = WORLD.runwayMinX,
			hi = WORLD.runwayMaxX;
		if (this.rtb === 'inbound') {
			this.lowPass = false;
			const fromEast = this.x > (lo + hi) / 2;
			const ex = fromEast ? hi + RTB_LINEUP : lo - RTB_LINEUP;
			const ey = w.ground(ex) + 35;
			this.speed = moveToward(this.speed, CRUISE, 60 * dt);
			if (Math.abs(this.x - ex) < 30) {
				this.rtb = 'final';
				this.passDir = fromEast ? -1 : 1;
			}
			return Math.atan2(ey - this.y, ex - this.x);
		}
		this.lowPass = true;
		this.speed = moveToward(this.speed, PASS_SPEED, 50 * dt);
		const over = this.x >= lo && this.x <= hi;
		if (over && this.y - w.ground(this.x) < 30) this.service(dt);
		if (this.hp >= WING_HP && this.missiles >= WING_MISSILES) {
			this.lowPass = false;
			this.order = 'attack';
			this.scan = 0;
			this.setPhase('attack');
			this.say(w, ': REARMED', 'Back in the fight', 'good');
			return this.passDir > 0 ? 0.5 : Math.PI - 0.5;
		}
		const past = this.passDir < 0 ? this.x < lo : this.x > hi;
		if (past && Math.cos(this.angle) * this.passDir > 0) {
			// Overshot before topping up: go round for another pass.
			this.rtb = 'inbound';
			this.lowPass = false;
		}
		const endX = this.passDir < 0 ? lo - 20 : hi + 20;
		const ty = w.ground(clamp(this.x, lo, hi)) + PASS_ALT;
		return Math.atan2(ty - this.y, endX - this.x);
	}

	/** Repairs and reloads while over the runway. */
	private service(dt: number): void {
		this.hp = Math.min(WING_HP, this.hp + (WING_HP / WING_REARM_TIME) * dt);
		if (this.missiles >= WING_MISSILES) return;
		this.rearmClock += dt;
		if (this.rearmClock >= WING_REARM_TIME / WING_MISSILES) {
			this.rearmClock = 0;
			this.missiles++;
		}
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
		if (this.y - ground < (this.lowPass ? 6 : 45)) target = right ? 0.8 : Math.PI - 0.8;
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
			damage: WING_GUN_DAMAGE,
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
			damage: kind === 'air' ? WING_AAM_DAMAGE : 0,
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
		explode(w, this.x, g, 0, CRASH, 'player', { playerScale: 0 });
		w.fires.add(this.x, g, 0, 1.4, 14, { radius: 2.2 });
		if (this.rejoinPending) this.relaunch(w);
	}

	/** A fresh aircraft, already airborne off the end of the runway and climbing out. */
	private relaunch(w: World): void {
		this.rejoinPending = false;
		this.rejoins++;
		this.x = WORLD.runwayMaxX;
		this.y = w.ground(this.x) + 30;
		this.angle = 0.22;
		this.roll = 0;
		this.speed = CRUISE;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.hp = WING_HP;
		this.alive = true;
		this.dying = false;
		this.flash = 0;
		this.missiles = WING_MISSILES;
		this.order = 'attack';
		this.target = null;
		this.assigned = false;
		this.lowPass = false;
		this.scan = 0;
		this.setPhase('attack');
		this.say(w, ': BACK ON STATION', 'A replacement climbs out to join you', 'good');
	}
}

/**
 * The friendly aircraft an enemy at (x, y) should shoot at: the player (or in
 * co-op, player two) or the wingman, whichever is closer (the player when both are equally placed).
 */
export function nearestFriendly(w: World, x: number, y: number): Player | Wingman | null {
	if (w.godMode) return null;
	// In co-op, the closer of the two human pilots.
	const p = w.nearestPilot(x, y);
	let wing: Wingman | null = null;
	let dw = Infinity;
	for (const j of w.jets()) {
		if (!j.active) continue;
		const d = Math.hypot(j.x - x, j.y - y);
		if (d < dw) {
			dw = d;
			wing = j;
		}
	}
	if (!wing) return p;
	if (!p) return wing;
	const dp = Math.hypot(p.x - x, p.y - y);
	return dw < dp * 0.85 ? wing : p;
}

export function updateWingman(w: World, dt: number): void {
	w.wingman?.update(w, dt);
	for (let i = w.escorts.length - 1; i >= 0; i--) {
		const e = w.escorts[i];
		e.update(w, dt);
		// A commander's air unit that went down is gone for good.
		if (!e.alive) w.escorts.splice(i, 1);
	}
}
