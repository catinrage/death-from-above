import { damp, dampAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { inBattlePlane, segmentVsUnit } from './combat';
import { WORLD } from './constants';
import { killUnit } from './deaths';
import { UNITS } from './defs-units';
import { spawnBullet } from './projectiles';
import type { Unit, UnitDef } from './types';
import { aimAt, wreck } from './unit-ai';
import { muzzlePoint } from './unit-pose';
import type { World } from './world';

/** Vehicles that can roll out in a friendly column. */
export type AllyKind = 'tank' | 'apc' | 'jeep' | 'truck';

/** How hard enemy small arms hit a friendly vehicle (their rounds are tuned against aircraft). */
export const ALLY_BULLET_K = 6;
/** Damage a direct hit from an enemy tank gun deals to a friendly vehicle. */
const TANK_ROUND = 55;
/** Speed the column drives at when the road is clear. */
const CRUISE = 11;
/** Distance ahead at which the column halts to fight whatever blocks the road. */
const HOLD = 230;
/** Unarmed trucks keep further back from a fight. */
const HOLD_UNARMED = 320;
/** Gap the column keeps between vehicles. */
const SPACING = 7;

interface AllyGun {
	range: number;
	interval: number;
	burst: number;
	gap: number;
	damage: number;
	pierce: number;
	speed: number;
}

const GUNS: Partial<Record<AllyKind, AllyGun>> = {
	tank: { range: 420, interval: 4.2, burst: 1, gap: 0, damage: 60, pierce: 0.7, speed: 420 },
	apc: { range: 380, interval: 2.4, burst: 6, gap: 0.09, damage: 7, pierce: 0.35, speed: 800 },
	jeep: { range: 340, interval: 2, burst: 6, gap: 0.1, damage: 4, pierce: 0.1, speed: 600 }
};

const DEFS = {} as Record<AllyKind, UnitDef>;
for (const kind of ['tank', 'apc', 'jeep', 'truck'] as AllyKind[]) {
	const d = UNITS[kind];
	DEFS[kind] = {
		...d,
		name: `Friendly ${d.name.toLowerCase()}`,
		score: 0,
		siege: 0,
		supply: false
	};
}

export function allyDef(kind: AllyKind): UnitDef {
	return DEFS[kind];
}

const m3: [number, number, number] = [0, 0, 0];

/**
 * Your own armour pushing up the road toward the enemy. It halts to trade fire
 * with whatever blocks the way, waits at a fallen bridge span, and counts as
 * through once it reaches the rally point on the far bank.
 */
export class Allies {
	readonly list: Unit[] = [];
	/** Vehicles that reached the rally point this game. */
	arrived = 0;
	/** Vehicles destroyed this game. */
	lost = 0;
	/** Vehicles sent out this game. */
	deployed = 0;

	/** Where the column is headed: the far side of the bridge, or deep in enemy ground. */
	goal(w: World): number {
		const r = w.river;
		return r ? r.x0 + r.bridgeHalf + 140 : WORLD.enemySpawnX - 700;
	}

	/** Rolls a column out from the airfield, lead vehicle first. */
	deploy(w: World, kinds: readonly AllyKind[]): void {
		const start = WORLD.baseMaxX + 70;
		kinds.forEach((kind, i) => {
			const u = w.makeUnit(kind, start - i * 16, i % 2 ? -1.1 : 1.1, 1);
			u.def = DEFS[kind];
			u.hp = u.def.hp;
			u.cooldown = rnd.range(0.5, 2);
			this.list.push(u);
		});
		this.deployed += kinds.length;
		w.events.message('FRIENDLY COLUMN', 'Armour moving up the road. Clear its path', 'info');
	}

	/** Friendly vehicles still on the road. */
	alive(): number {
		let n = 0;
		for (const u of this.list) if (u.alive) n++;
		return n;
	}

	/** Lead vehicle's distance to the rally point, or null with no column out. */
	distanceToGo(w: World): number | null {
		let lead = -Infinity;
		for (const u of this.list) if (u.alive) lead = Math.max(lead, u.x);
		return lead === -Infinity ? null : Math.max(0, this.goal(w) - lead);
	}

	/** Nearest live friendly vehicle to (x, y) within `range`, for enemy gunners. */
	nearest(x: number, y: number, range: number): Unit | null {
		let best: Unit | null = null;
		let bestD = range;
		for (const u of this.list) {
			if (!u.alive) continue;
			const d = Math.hypot(u.x - x, u.y - y);
			if (d < bestD) {
				bestD = d;
				best = u;
			}
		}
		return best;
	}

	/** Closest friendly vehicle on the airfield side of x, within `range`. */
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

	/** Enemy fire striking a friendly vehicle; returns the vehicle it hit. */
	bulletHit(x0: number, y0: number, x1: number, y1: number, damage: number): Unit | null {
		for (const u of this.list) {
			if (!u.alive || segmentVsUnit(u, x0, y0, x1, y1) < 0) continue;
			this.hit(u, damage, 0);
			return u;
		}
		return null;
	}

	/** An enemy tank round reaching a friendly vehicle. */
	shellHit(x0: number, y0: number, x1: number, y1: number): Unit | null {
		for (const u of this.list) {
			if (!u.alive || segmentVsUnit(u, x0, y0, x1, y1, 0.3) < 0) continue;
			this.hit(u, TANK_ROUND, 0.7);
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
		const goal = this.goal(w);
		for (let i = this.list.length - 1; i >= 0; i--) {
			const u = this.list[i];
			u.flash = Math.max(0, u.flash - dt * 4);
			if (u.alive && u.hp <= 0) {
				// Kills by the enemy score nothing; the wreck behaves like any other.
				killUnit(w, u, u.x + 10, 'blast', 'enemy');
				this.lost++;
				w.events.message('', `${u.def.name} destroyed`, 'warn');
			}
			if (!u.alive) {
				wreck(w, u, dt);
				if (u.remove) this.list.splice(i, 1);
				continue;
			}
			u.stateTime += dt;
			if (u.x >= goal) {
				this.arrived++;
				this.list.splice(i, 1);
				w.events.message('', `${u.def.name} reached the rally point`, 'good');
				continue;
			}
			this.drive(w, u, dt);
			this.engage(w, u, dt);
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
		let want = CRUISE;
		const b = this.blocker(w, u);
		if (b && b.dist < (def.weapon ? HOLD : HOLD_UNARMED)) want = 0;
		for (const o of this.list) {
			if (o === u || !o.alive) continue;
			const ahead = o.x - u.x;
			if (ahead > 0 && ahead < o.def.half[0] + def.half[0] + SPACING)
				want = Math.min(want, Math.abs(o.speed) * 0.8);
		}
		const stop = w.bridge?.stopLine(u.x, 1, def.half[0]);
		if (stop != null) {
			const room = stop - u.x;
			if (room < 6) want = Math.min(want, Math.max(0, room) * 0.6);
		}
		u.state = want === 0 ? 'hold' : 'advance';
		u.speed = damp(u.speed, want, 1.6, dt);
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
		u.anim += (u.speed * dt) / 0.5;
		u.spin += dt * 2.6;
	}

	private engage(w: World, u: Unit, dt: number): void {
		const gun = GUNS[u.def.kind as AllyKind];
		if (!gun) return;
		u.cooldown -= dt;
		let foe: Unit | null = null;
		let best = gun.range;
		for (const o of w.units) {
			if (!o.alive || !inBattlePlane(o)) continue;
			// Facing the enemy: things already behind count for more distance.
			const d = Math.abs(o.x - u.x) * (o.x < u.x ? 1.6 : 1);
			if (d < best) {
				best = d;
				foe = o;
			}
		}
		const ox = u.x,
			oy = u.y + u.def.half[1] * 2;
		if (!foe) {
			u.aimYaw = damp(u.aimYaw, 0, 1, dt);
			u.aimPitch = damp(u.aimPitch, 0.05, 1, dt);
			return;
		}
		const tx = foe.x,
			ty = foe.y + foe.def.half[1];
		const dx = Math.abs(tx - ox);
		const g = gun.burst === 1 ? WORLD.gravity : 4;
		const tof = dx / gun.speed;
		const aimY = ty + 0.5 * g * tof * tof;
		if (!aimAt(u, dt, tx, aimY, ox, oy)) return;
		if (u.burst > 0) {
			u.gap -= dt;
			if (u.gap > 0) return;
			u.gap = gun.gap;
			u.burst--;
		} else {
			if (u.cooldown > 0) return;
			u.cooldown = gun.interval * rnd.range(0.85, 1.2);
			u.burst = gun.burst - 1;
			u.gap = gun.gap;
		}
		const m = muzzlePoint(u, m3);
		const a = Math.atan2(aimY - m[1], tx - m[0]) + rnd.gauss(gun.burst === 1 ? 0.006 : 0.02);
		const cx = Math.cos(a),
			cy = Math.sin(a);
		if (gun.burst === 1) {
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
			size: u.def.kind === 'apc' ? 0.24 : 0.16,
			explosive: 0,
			aimX: tx
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], cx, cy, u.def.kind === 'apc' ? 1.2 : 0.7, [8, 9, 12]);
		w.sound.play(u.def.kind === 'apc' ? 'aaGun' : 'mg', m[0], m[1], 0.35);
	}

	clear(): void {
		this.list.length = 0;
		this.arrived = 0;
		this.lost = 0;
		this.deployed = 0;
	}
}

/** Endless mode sends a column every third wave, a little heavier each time. */
export function endlessColumn(wave: number): AllyKind[] {
	if (wave < 3 || wave % 3 !== 0) return [];
	const out: AllyKind[] = ['tank', 'apc', 'truck', 'jeep'];
	const extra = Math.min(Math.floor(wave / 6), 3);
	for (let i = 0; i < extra; i++) out.splice(1, 0, i % 2 ? 'apc' : 'tank');
	return out;
}
