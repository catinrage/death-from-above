import { damp, dampAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { inBattlePlane, segmentVsUnit } from './combat';
import { WORLD } from './constants';
import { killUnit } from './deaths';
import { UNITS } from './defs-units';
import type { AirUnit } from './enemy-air';
import { launchMissile, spawnBullet } from './projectiles';
import type { Unit, UnitDef } from './types';
import { aimAt, lobShell, wreck, type Lob } from './unit-ai';
import { muzzlePoint } from './unit-pose';
import { MARCH } from './war';
import type { World } from './world';

/** Troops and vehicles our side can send up the road. */
export type AllyKind =
	| 'rifleman'
	| 'manpads'
	| 'sniper'
	| 'atTrooper'
	| 'mortar'
	| 'medic'
	| 'jeep'
	| 'truck'
	| 'tank'
	| 'lightTank'
	| 'apc'
	| 'spaag'
	| 'rocketTruck';
export const ALLY_KINDS: readonly AllyKind[] = [
	'rifleman',
	'manpads',
	'sniper',
	'atTrooper',
	'mortar',
	'medic',
	'jeep',
	'truck',
	'tank',
	'lightTank',
	'apc',
	'spaag',
	'rocketTruck'
];

/** How hard enemy small arms hit a friendly unit (their rounds are tuned against aircraft). */
export const ALLY_BULLET_K = 8;
/** Damage a direct hit from an enemy tank gun deals to a friendly unit. */
const TANK_ROUND = 55;
/** Speed vehicles drive at when the road is clear. */
const CRUISE = 11;
/** Distance ahead at which a unit halts to fight whatever blocks the road. */
const HOLD = 230;
/** Inside the hold distance, armed units still close in at this share of their speed down to CLOSE. */
export const CREEP = 0.35;
export const CLOSE = 120;
/** Unarmed (or sky-watching) units keep further back from a fight. */
const HOLD_UNARMED = 320;
/** A medic patches up hurt infantry within this many metres, at this many hit points a second. */
const HEAL_RADIUS = 16;
const HEAL_RATE = 3;
/** Indirect fire holds off a target with our own troops this close to it. */
const DANGER_CLOSE = 25;
/** Gap the column keeps between vehicles, and between soldiers. */
const SPACING = 7;
const SPACING_INFANTRY = 1.4;

interface AllyGun {
	range: number;
	interval: number;
	burst: number;
	gap: number;
	damage: number;
	pierce: number;
	speed: number;
	/** Fires shells that burst on impact (tank guns). */
	shell?: boolean;
	/** Only engages aircraft. */
	air?: boolean;
	/** Heat-seeking missiles at aircraft. */
	missile?: boolean;
	/** Goes for vehicles before troops. */
	antiArmor?: boolean;
	/** Indirect fire, lobbed from behind the line. */
	lob?: Lob;
}

const GUNS: Partial<Record<AllyKind, AllyGun>> = {
	tank: {
		range: 420,
		interval: 4.2,
		burst: 1,
		gap: 0,
		damage: 60,
		pierce: 0.7,
		speed: 420,
		shell: true
	},
	apc: { range: 380, interval: 2.4, burst: 6, gap: 0.09, damage: 7, pierce: 0.35, speed: 800 },
	jeep: { range: 340, interval: 2, burst: 6, gap: 0.1, damage: 4, pierce: 0.1, speed: 600 },
	lightTank: {
		range: 380,
		interval: 3,
		burst: 1,
		gap: 0,
		damage: 32,
		pierce: 0.6,
		speed: 420,
		shell: true
	},
	rifleman: { range: 280, interval: 1.8, burst: 3, gap: 0.16, damage: 2.6, pierce: 0, speed: 520 },
	sniper: { range: 440, interval: 4, burst: 1, gap: 0, damage: 16, pierce: 0.1, speed: 900 },
	atTrooper: {
		range: 300,
		interval: 6,
		burst: 1,
		gap: 0,
		damage: 80,
		pierce: 0.9,
		speed: 170,
		shell: true,
		antiArmor: true
	},
	mortar: {
		range: 480,
		interval: 5,
		burst: 1,
		gap: 0,
		damage: 0,
		pierce: 0,
		speed: 0,
		lob: { range: 480, theta: 1.15, scatter: 9 }
	},
	rocketTruck: {
		range: 950,
		interval: 14,
		burst: 6,
		gap: 0.2,
		damage: 0,
		pierce: 0,
		speed: 0,
		lob: { range: 950, theta: 0.75, scatter: 22 }
	},
	spaag: {
		range: 620,
		interval: 2,
		burst: 8,
		gap: 0.07,
		damage: 4,
		pierce: 0.2,
		speed: 800,
		air: true
	},
	manpads: {
		range: 520,
		interval: 8,
		burst: 1,
		gap: 0,
		damage: 22,
		pierce: 0,
		speed: 0,
		air: true,
		missile: true
	}
};

/** Our infantry is better equipped than the enemy's: it takes a few more rounds to drop. */
const HP: Partial<Record<AllyKind, number>> = {
	rifleman: 20,
	manpads: 20,
	sniper: 16,
	atTrooper: 20,
	mortar: 20,
	medic: 18
};

const DEFS = {} as Record<AllyKind, UnitDef>;
for (const kind of ALLY_KINDS) {
	const d = UNITS[kind];
	DEFS[kind] = {
		...d,
		name: `Friendly ${d.name.toLowerCase()}`,
		hp: HP[kind] ?? d.hp,
		score: 0,
		supply: false
	};
}

export function allyDef(kind: AllyKind): UnitDef {
	return DEFS[kind];
}

const m3: [number, number, number] = [0, 0, 0];

/** A medic patches up the most badly hurt soldier near them, on either side. */
export function tend(medic: Unit, list: readonly Unit[], dt: number): void {
	let patient: Unit | null = null;
	let worst = 1;
	for (const u of list) {
		if (u === medic || !u.alive || u.def.category !== 'infantry') continue;
		if (Math.abs(u.x - medic.x) > HEAL_RADIUS) continue;
		const left = u.hp / u.def.hp;
		if (left < worst) {
			worst = left;
			patient = u;
		}
	}
	if (patient) patient.hp = Math.min(patient.def.hp, patient.hp + HEAL_RATE * dt);
}

/**
 * Our own army pushing up the road toward the enemy HQ. Units halt to trade
 * fire with whatever blocks the way, stop on checkpoints the enemy holds until
 * they have taken them, and shell the HQ once they reach its wire.
 */
export class Allies {
	readonly list: Unit[] = [];
	/** Units destroyed this game. */
	lost = 0;
	/** Units sent out this game. */
	deployed = 0;

	/**
	 * Sends a group up the road from `from` (the airfield by default), lead
	 * unit first. Infantry spreads across the road; vehicles keep to two lanes.
	 */
	deploy(w: World, kinds: readonly AllyKind[], from?: number, note?: string): void {
		let x = from ?? WORLD.baseMaxX + 70;
		kinds.forEach((kind, i) => {
			const infantry = DEFS[kind].category === 'infantry';
			const z = infantry ? rnd.range(-3.2, 3.2) : i % 2 ? -1.1 : 1.1;
			const u = w.makeUnit(kind, x, z, 1);
			u.def = DEFS[kind];
			u.hp = u.def.hp;
			u.cooldown = rnd.range(0.5, 2);
			this.list.push(u);
			x -= infantry ? 3 : 16;
		});
		this.deployed += kinds.length;
		w.events.message(
			'REINFORCEMENTS',
			note ?? 'Our troops are moving up the road. Clear their path',
			'info'
		);
	}

	/** Friendly units still fighting. */
	alive(): number {
		let n = 0;
		for (const u of this.list) if (u.alive) n++;
		return n;
	}

	/** The friendly unit furthest up the road (what enemy gunships go for), or null. */
	spearhead(): Unit | null {
		let best: Unit | null = null;
		for (const u of this.list) if (u.alive && (!best || u.x > best.x)) best = u;
		return best;
	}

	/**
	 * Nearest live friendly unit to (x, y) within `range`, for enemy gunners.
	 * `armourFirst` passes over troops for any vehicle up to twice as far.
	 */
	nearest(x: number, y: number, range: number, armourFirst = false): Unit | null {
		let best: Unit | null = null;
		let bestD = range;
		for (const u of this.list) {
			if (!u.alive) continue;
			const d = Math.hypot(u.x - x, u.y - y);
			if (d > range) continue;
			if (armourFirst && u.def.category === 'infantry') {
				if (d * 2 < bestD) {
					bestD = d * 2;
					best = u;
				}
				continue;
			}
			if (d < bestD) {
				bestD = d;
				best = u;
			}
		}
		return best;
	}

	/** Closest friendly unit on the airfield side of x, within `range`. */
	ahead(x: number, range: number): Unit | null {
		let best: Unit | null = null;
		let bestD = range;
		for (const u of this.list) {
			if (!u.alive) continue;
			const d = x - u.x;
			if (d > 0 && d < bestD) {
				bestD = d;
				best = u;
			}
		}
		return best;
	}

	hit(u: Unit, amount: number, pierce: number): void {
		if (!u.alive || amount <= 0) return;
		u.hp -= amount * (1 - u.def.armor * (1 - Math.min(pierce, 1)));
		u.flash = Math.min(1, u.flash + 0.6);
	}

	/** Enemy fire striking a friendly unit; returns the unit it hit. */
	bulletHit(x0: number, y0: number, x1: number, y1: number, damage: number): Unit | null {
		for (const u of this.list) {
			if (!u.alive || segmentVsUnit(u, x0, y0, x1, y1) < 0) continue;
			this.hit(u, damage, 0);
			return u;
		}
		return null;
	}

	/** An enemy tank round (or anti-tank rocket) reaching a friendly unit. */
	shellHit(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		punch = TANK_ROUND,
		pierce = 0.7
	): Unit | null {
		for (const u of this.list) {
			if (!u.alive || segmentVsUnit(u, x0, y0, x1, y1, 0.3) < 0) continue;
			this.hit(u, punch, pierce);
			return u;
		}
		return null;
	}

	/** Blast damage, your own bombs included. */
	blast(x: number, y: number, radius: number, damage: number, pierce: number): void {
		for (const u of this.list) {
			if (!u.alive || Math.abs(u.x - x) > radius + u.def.half[0]) continue;
			const d = Math.max(0, Math.hypot(u.x - x, u.y + u.def.half[1] - y) - u.def.half[0]);
			if (d < radius) {
				const k = 1 - d / radius;
				this.hit(u, damage * (0.15 + 0.85 * k * k), pierce);
			}
		}
	}

	update(w: World, dt: number): void {
		const hq = w.war.active && !w.war.hq.destroyed ? w.war.hq : null;
		for (let i = this.list.length - 1; i >= 0; i--) {
			const u = this.list[i];
			u.flash = Math.max(0, u.flash - dt * 4);
			if (u.alive && u.hp <= 0) {
				// Kills by the enemy score nothing; the wreck behaves like any other.
				killUnit(w, u, u.x + 10, 'blast', 'enemy');
				this.lost++;
				if (u.def.category !== 'infantry') w.events.message('', `${u.def.name} destroyed`, 'warn');
			}
			if (!u.alive) {
				wreck(w, u, dt);
				if (u.remove) this.list.splice(i, 1);
				continue;
			}
			u.stateTime += dt;
			this.drive(w, u, dt);
			if (u.def.kind === 'medic') tend(u, this.list, dt);
			else this.engage(w, u, dt);
			if (hq && u.state === 'siege') hq.damage(w, u.def.siege * dt);
		}
	}

	/** Nearest enemy ground unit in front of `u` (or just behind it, overrun). */
	private blocker(w: World, u: Unit): { foe: Unit; dist: number } | null {
		let foe: Unit | null = null;
		let best = Infinity;
		for (const o of w.units) {
			// The cruiser lies off the road and never stands in the column's way.
			if (!o.alive || o.def.kind === 'cruiser') continue;
			const d = o.x - u.x;
			if (d > -15 && d < best) {
				best = d;
				foe = o;
			}
		}
		return foe ? { foe, dist: Math.max(0, best) } : null;
	}

	private drive(w: World, u: Unit, dt: number): void {
		const def = u.def;
		const infantry = def.category === 'infantry';
		const gun = GUNS[def.kind as AllyKind];
		let want = infantry ? def.speed * MARCH : CRUISE;
		const b = this.blocker(w, u);
		// Direct-fire units creep in to close range; medics keep up with the riflemen they look after.
		const close = gun && !gun.air && !gun.lob ? CLOSE : def.kind === 'medic' ? CLOSE + 15 : 0;
		// Indirect fire halts as soon as the enemy is in reach.
		const hold = gun?.lob
			? gun.lob.range * 0.8
			: close
				? Math.min(HOLD, (gun?.range ?? HOLD) * 0.8)
				: HOLD_UNARMED;
		// Armed units keep creeping in under fire until the range is short, then stand and fight.
		if (b && b.dist < hold) want = close && b.dist > close ? want * CREEP : 0;
		const gap = infantry ? SPACING_INFANTRY : SPACING;
		for (const o of this.list) {
			if (o === u || !o.alive || Math.abs(o.z - u.z) > 2.6) continue;
			const ahead = o.x - u.x;
			if (ahead > 0 && ahead < o.def.half[0] + def.half[0] + gap)
				want = Math.min(want, Math.abs(o.speed) * 0.8);
		}
		// Stand on a checkpoint until it is ours.
		if (w.war.holdingAt(u.x, 'player')) want = 0;
		// At the HQ's wire: dig in and shell it.
		const siege = u.x >= w.war.siegeLine(def);
		if (siege) want = 0;
		const stop = w.bridge?.stopLine(u.x, 1, def.half[0]);
		if (stop != null) {
			const room = stop - u.x;
			if (room < 6) want = Math.min(want, Math.max(0, room) * 0.6);
		}
		u.state = siege ? 'siege' : want === 0 ? 'hold' : 'advance';
		u.speed = damp(u.speed, want, infantry ? 6 : 1.6, dt);
		u.x += u.speed * dt;
		if (stop != null && u.x > stop) {
			u.x = stop;
			u.speed = 0;
		}
		u.y = w.surface.support(u.x, u.y + 1, u.z);
		u.yaw = dampAngle(u.yaw, 0, 3, dt);
		const slope = Math.atan2(
			w.surface.support(u.x + 2, u.y + 1, u.z) - w.surface.support(u.x - 2, u.y + 1, u.z),
			4
		);
		u.pitch = damp(u.pitch, slope, 8, dt);
		u.anim += (u.speed * dt) / (infantry ? 0.3 : 0.5);
		u.spin += dt * 2.6;
	}

	private engage(w: World, u: Unit, dt: number): void {
		const gun = GUNS[u.def.kind as AllyKind];
		if (!gun) return;
		u.cooldown -= dt;
		if (gun.air) return this.antiAir(w, u, gun, dt);
		let foe: Unit | null = null;
		let best = gun.range;
		for (const o of w.units) {
			if (!o.alive || !inBattlePlane(o)) continue;
			// Facing the enemy: things already behind count for more distance.
			let d = Math.abs(o.x - u.x) * (o.x < u.x ? 1.6 : 1);
			if (gun.antiArmor && o.def.category === 'infantry') d *= 2;
			if (d < best) {
				best = d;
				foe = o;
			}
		}
		const ox = u.x,
			oy = u.y + u.def.half[1] * 2;
		let tx: number, ty: number;
		if (foe) {
			tx = foe.x;
			ty = foe.y + foe.def.half[1];
		} else if (u.state === 'siege' && w.war.active && !w.war.hq.destroyed) {
			// Nothing else to shoot at: pour fire into the compound.
			tx = w.war.hq.x0 + rnd.range(10, 80);
			ty = w.ground(tx) + 3;
		} else {
			u.aimYaw = damp(u.aimYaw, 0, 1, dt);
			u.aimPitch = damp(u.aimPitch, 0.05, 1, dt);
			return;
		}
		if (gun.lob) return this.bombard(w, u, gun, gun.lob, tx, dt);
		const dx = Math.abs(tx - ox);
		const g = gun.shell ? WORLD.gravity : 4;
		const tof = dx / gun.speed;
		const aimY = ty + 0.5 * g * tof * tof;
		if (!aimAt(u, dt, tx, aimY, ox, oy)) return;
		if (!this.trigger(u, gun, dt)) return;
		const m = muzzlePoint(u, m3);
		const a = Math.atan2(aimY - m[1], tx - m[0]) + rnd.gauss(gun.shell ? 0.006 : 0.02);
		const cx = Math.cos(a),
			cy = Math.sin(a);
		if (gun.shell) {
			w.shells.push({
				kind: 'tank',
				x: m[0],
				y: m[1],
				z: m[2],
				vx: cx * gun.speed,
				vy: cy * gun.speed,
				age: 0,
				fuse: Infinity,
				damage: gun.damage,
				radius: 6,
				owner: 'player',
				trail: 0,
				aimX: tx
			});
			w.fx.muzzleFlash(m[0], m[1], m[2], cx, cy, 3, [12, 6, 2]);
			w.fx.gunSmoke(m[0], m[1], m[2], 3.5);
			w.sound.play('tankGun', m[0], m[1], 0.6);
			return;
		}
		const kind = u.def.kind;
		spawnBullet(w, {
			x: m[0],
			y: m[1],
			z: m[2],
			vx: cx * gun.speed,
			vy: cy * gun.speed,
			life: 1.4,
			damage: gun.damage,
			pierce: gun.pierce,
			owner: 'player',
			tracer: true,
			color: [4, 9, 14],
			size: kind === 'apc' ? 0.24 : kind === 'rifleman' || kind === 'sniper' ? 0.1 : 0.16,
			explosive: 0,
			aimX: tx
		});
		const smallArms = kind === 'rifleman' || kind === 'sniper';
		if (!smallArms || rnd.chance(0.5))
			w.fx.muzzleFlash(m[0], m[1], m[2], cx, cy, kind === 'apc' ? 1.2 : 0.7, [8, 9, 12]);
		w.sound.play(kind === 'apc' ? 'aaGun' : smallArms ? 'rifle' : 'mg', m[0], m[1], 0.35);
	}

	/** Mortars and rocket artillery drop rounds on the enemy from behind our own line. */
	private bombard(w: World, u: Unit, gun: AllyGun, lob: Lob, tx: number, dt: number): void {
		aimAt(u, dt, tx, u.y + 400, u.x, u.y);
		u.aimPitch = damp(u.aimPitch, lob.theta, 2, dt);
		// Hold off rather than drop it on our own troops.
		for (const o of this.list) if (o.alive && Math.abs(o.x - tx) < DANGER_CLOSE) return;
		if (!this.trigger(u, gun, dt)) return;
		const m = muzzlePoint(u, m3);
		lobShell(w, m[0], m[1], m[2], tx + rnd.gauss(lob.scatter), lob.theta, 0, 'player');
		w.sound.play(u.def.kind === 'rocketTruck' ? 'artillery' : 'tankGun', m[0], m[1], 0.45);
	}

	/** Mobile AA and missile troopers keep the sky over the column clear. */
	private antiAir(w: World, u: Unit, gun: AllyGun, dt: number): void {
		let target: AirUnit | null = null;
		let best = gun.range;
		const ox = u.x,
			oy = u.y + u.def.half[1] * 2;
		for (const a of w.air) {
			if (!a.alive || a.dying) continue;
			const d = Math.hypot(a.x - ox, a.y - oy);
			if (d < best && a.y > oy + 15) {
				best = d;
				target = a;
			}
		}
		if (!target) {
			u.aimPitch = damp(u.aimPitch, 0.5, 1, dt);
			return;
		}
		const t = gun.missile ? 0 : best / gun.speed;
		const tx = target.x + target.vx * t,
			ty = target.y + target.vy * t;
		if (!aimAt(u, dt, tx, ty, ox, oy) || !this.trigger(u, gun, dt)) return;
		const m = muzzlePoint(u, m3);
		const a = Math.atan2(ty - m[1], tx - m[0]);
		if (gun.missile) {
			launchMissile(w, {
				kind: 'manpads',
				x: m[0],
				y: m[1],
				z: m[2],
				angle: a,
				speed: 28,
				maxSpeed: 205,
				accel: 270,
				turnRate: 2.8,
				target,
				burn: 2.3,
				life: 5.5,
				damage: gun.damage,
				owner: 'player',
				seeker: 'heat'
			});
			w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(a), Math.sin(a), 2, [8, 9, 12]);
			return;
		}
		const aa = a + rnd.gauss(0.02);
		spawnBullet(w, {
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(aa) * gun.speed,
			vy: Math.sin(aa) * gun.speed,
			life: 1.6,
			damage: gun.damage,
			pierce: gun.pierce,
			owner: 'player',
			tracer: true,
			color: [4, 9, 14],
			size: 0.24,
			explosive: 0
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(aa), Math.sin(aa), 1.3, [8, 9, 12]);
		w.sound.play('aaGun', m[0], m[1], 0.35);
	}

	/** Burst timing: true when the next round should leave the barrel. */
	private trigger(u: Unit, gun: AllyGun, dt: number): boolean {
		if (u.burst > 0) {
			u.gap -= dt;
			if (u.gap > 0) return false;
			u.gap = gun.gap;
			u.burst--;
			return true;
		}
		if (u.cooldown > 0) return false;
		u.cooldown = gun.interval * rnd.range(0.85, 1.2);
		u.burst = gun.burst - 1;
		u.gap = gun.gap;
		return true;
	}

	clear(): void {
		this.list.length = 0;
		this.lost = 0;
		this.deployed = 0;
	}
}
