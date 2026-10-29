import { angleDiff, clamp, moveToward } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { MeshName } from '../models';
import { WORLD } from './constants';
import type { FireSource } from './fires';
import type { Owner } from './types';
import { spawnBullet } from './projectiles';
import type { World } from './world';

export interface BaseStructure {
	mesh: MeshName;
	glow: MeshName | null;
	x: number;
	z: number;
	yaw: number;
	scale: number;
	fire: FireSource | null;
}

export interface BaseGun {
	x: number;
	z: number;
	yaw: number;
	pitch: number;
	cooldown: number;
}

const LAYOUT: Omit<BaseStructure, 'fire'>[] = [
	{
		mesh: 'runway',
		glow: null,
		x: (WORLD.runwayMinX + WORLD.runwayMaxX) / 2,
		z: 0,
		yaw: 0,
		scale: 1
	},
	{ mesh: 'hangar', glow: 'hangarGlow', x: 105, z: -46, yaw: 0, scale: 1 },
	{ mesh: 'hangar', glow: 'hangarGlow', x: 192, z: -50, yaw: 0, scale: 1 },
	{ mesh: 'tower', glow: 'towerGlow', x: 307.5, z: -34, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: 393, z: -42, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: 420, z: -50, yaw: 0.2, scale: 1 },
	{ mesh: 'windsock', glow: null, x: 468, z: 17, yaw: 0, scale: 1 },
	{ mesh: 'flagpole', glow: null, x: 33, z: -22, yaw: 0, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: 507, z: 9, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: 507, z: -10, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'crates', glow: null, x: 240, z: -28, yaw: 0.4, scale: 1 },
	{ mesh: 'crates', glow: null, x: 60, z: -30, yaw: -0.3, scale: 1 },
	{ mesh: 'kestrel', glow: null, x: 105, z: -27, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'grizzly', glow: null, x: 192, z: -30, yaw: Math.PI / 2 + 0.2, scale: 1 }
];

/** Reach of an airfield's flak guns. */
const GUN_RANGE = 750;

/** The friendly airfield: rearm point, objective to defend, and its AA cover. */
export class AirBase {
	hp = 1000;
	readonly maxHp = 1000;
	readonly minX = WORLD.baseMinX;
	readonly maxX = WORLD.baseMaxX;
	readonly structures: BaseStructure[] = LAYOUT.map((s) => ({ ...s, fire: null }));
	readonly guns: BaseGun[] = [
		{ x: -6, z: -16, yaw: 0, pitch: 0.6, cooldown: 1 },
		{ x: 515, z: -20, yaw: 0, pitch: 0.6, cooldown: 2 }
	];
	underAttack = 0;
	private fireStage = 0;

	damage(w: World, amount: number): void {
		if (this.hp <= 0) return;
		this.hp = Math.max(0, this.hp - amount);
		this.underAttack = 3;
		const stage = Math.floor((1 - this.hp / this.maxHp) * 5);
		while (this.fireStage < stage) {
			this.fireStage++;
			const s = rnd.pick(this.structures.filter((b) => !b.fire && b.mesh !== 'runway'));
			if (s) {
				const y = w.terrain.heightAtXZ(s.x, s.z);
				s.fire = w.fires.add(s.x + rnd.range(-3, 3), y + 2, s.z, 2.2, 1e9, { radius: 3 });
				w.fx.explosion(s.x, y + 2, s.z, 1, true);
			}
		}
	}

	/** An enemy shell landing on the airfield. */
	shellHit(w: World, x: number, dmg: number): void {
		const g = w.ground(x);
		const z = rnd.range(-30, 10);
		w.fx.explosion(x, g, z, 0.55, true);
		w.terrain.crater(x, z, 2.5, 0.6, 1, 0.6);
		w.sound.boom(0.6, x, g);
		this.damage(w, dmg);
	}

	update(w: World, dt: number): void {
		this.underAttack = Math.max(0, this.underAttack - dt);
		// Their troops at the siege line wear down our HQ in command mode, else the airfield.
		const hq = w.war.ourHqUp && !w.war.ourHq.destroyed ? w.war.ourHq : null;
		for (const u of w.units) {
			if (!u.alive || u.state !== 'siege') continue;
			if (hq) hq.damage(w, u.def.siege * dt);
			else this.damage(w, u.def.siege * dt);
		}
		for (const g of this.guns) aimGun(w, g, dt, 'player');
	}

	reset(): void {
		this.hp = this.maxHp;
		this.fireStage = 0;
		for (const s of this.structures) s.fire = null;
	}
}

/** Gun targets for a side's airfield flak: the other side's aircraft. */
function nearestAir(
	w: World,
	g: BaseGun,
	side: Owner
): { target: { x: number; y: number; vx: number; vy: number } | null; dist: number } {
	let target: { x: number; y: number; vx: number; vy: number } | null = null;
	let best = GUN_RANGE;
	const gy = w.ground(g.x);
	const consider = (x: number, y: number, t: { x: number; y: number; vx: number; vy: number }) => {
		const d = Math.hypot(x - g.x, y - gy);
		if (d < best) {
			best = d;
			target = t;
		}
	};
	if (side === 'player') {
		for (const a of w.air) if (a.alive && !a.dying) consider(a.x, a.y, a);
	} else {
		for (const p of w.pilots()) if (p.alive && !p.landed) consider(p.x, p.y, p);
		for (const j of w.jets()) if (j.active) consider(j.x, j.y, j);
	}
	return { target, dist: best };
}

/** Swings an airfield flak gun onto the nearest hostile aircraft and fires once it is on. */
function aimGun(w: World, g: BaseGun, dt: number, side: Owner): void {
	g.cooldown -= dt;
	const { target, dist } = nearestAir(w, g, side);
	const gy = w.ground(g.x) + 2.2;
	if (!target) {
		g.pitch = moveToward(g.pitch, 0.6, dt * 0.4);
		return;
	}
	const t = dist / 700;
	const tx = target.x + target.vx * t,
		ty = target.y + target.vy * t;
	g.yaw = moveToward(g.yaw, tx >= g.x ? 0 : Math.PI, dt * 2);
	const want = clamp(Math.atan2(ty - gy, Math.abs(tx - g.x)), 0, 1.4);
	g.pitch = moveToward(g.pitch, want, dt * 1.5);
	if (g.cooldown > 0 || Math.abs(angleDiff(g.pitch, want)) > 0.1) return;
	g.cooldown = 0.12;
	const a = Math.atan2(ty - gy, tx - g.x) + rnd.gauss(0.03);
	const ours = side === 'player';
	spawnBullet(w, {
		x: g.x + Math.cos(a) * 6,
		y: gy + Math.sin(a) * 6,
		z: g.z,
		vx: Math.cos(a) * 700,
		vy: Math.sin(a) * 700,
		life: 1.4,
		damage: 5,
		pierce: 0.2,
		owner: side,
		tracer: true,
		color: ours ? [6, 9, 4] : [12, 4, 1.5],
		size: 0.2,
		explosive: 0
	});
	w.fx.muzzleFlash(
		g.x + Math.cos(a) * 6,
		gy + Math.sin(a) * 6,
		g.z,
		Math.cos(a),
		Math.sin(a),
		1.2,
		ours ? [8, 10, 5] : [12, 5, 2]
	);
	w.sound.play('aaGun', g.x, gy, 0.3, 1.2);
}

/** Mirrors an x on our airfield onto the enemy's. */
const mirror = (x: number): number => WORLD.enemyBaseMaxX + WORLD.baseMinX - x;

/**
 * Where an airfield's strikes are launched from, between the runway and the
 * buildings at its forward end, where the commander can watch them go: the
 * two guns of the artillery battery, the cruise missile rack and the missile
 * silo. `dir` is the way they face, toward the other side.
 */
export interface StrikeSites {
	battery: readonly number[];
	launcher: number;
	silo: number;
	z: number;
	dir: 1 | -1;
}

export const OUR_SITES: StrikeSites = {
	battery: [345, 368],
	launcher: 418,
	silo: 466,
	z: -21,
	dir: 1
};
export const THEIR_SITES: StrikeSites = {
	battery: OUR_SITES.battery.map(mirror),
	launcher: mirror(OUR_SITES.launcher),
	silo: mirror(OUR_SITES.silo),
	z: OUR_SITES.z,
	dir: -1
};

/** How high a battery gun's barrel stands, and the muzzle's reach from the trunnion. */
export const BATTERY_PITCH = 0.75;
export const BATTERY_REACH = 4.85;
/** The cruise missile rack's elevation. */
export const RACK_PITCH = 0.55;

/** Our airfield's layout mirrored, with the hangars and fuel tanks set back off the railway. */
const ENEMY_LAYOUT: Omit<BaseStructure, 'fire'>[] = [
	{
		mesh: 'runway',
		glow: null,
		x: (WORLD.enemyRunwayMinX + WORLD.enemyRunwayMaxX) / 2,
		z: 0,
		yaw: 0,
		scale: 1
	},
	{ mesh: 'hangar', glow: 'hangarGlow', x: mirror(105), z: -70, yaw: 0, scale: 1 },
	{ mesh: 'hangar', glow: 'hangarGlow', x: mirror(192), z: -74, yaw: 0, scale: 1 },
	{ mesh: 'tower', glow: 'towerGlow', x: mirror(307.5), z: -27, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: mirror(393), z: -66, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: mirror(420), z: -73, yaw: 0.2, scale: 1 },
	{ mesh: 'windsock', glow: null, x: mirror(468), z: 17, yaw: Math.PI, scale: 1 },
	{ mesh: 'flagpole', glow: null, x: mirror(33), z: -22, yaw: Math.PI, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: mirror(507), z: 9, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: mirror(507), z: -10, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'crates', glow: null, x: mirror(240), z: -24, yaw: -0.4, scale: 1 },
	{ mesh: 'crates', glow: null, x: mirror(60), z: -30, yaw: 0.3, scale: 1 },
	{ mesh: 'enemyFighter', glow: null, x: mirror(105), z: -24, yaw: Math.PI, scale: 1 },
	{ mesh: 'enemyFighter', glow: null, x: mirror(192), z: -27, yaw: Math.PI - 0.2, scale: 1 }
];

/**
 * The enemy airfield behind their HQ. Their jets take off from it and their
 * strikes are launched from it. Like their HQ, nothing from the air hurts it.
 */
export class EnemyAirfield {
	readonly minX = WORLD.enemyBaseMinX;
	readonly maxX = WORLD.enemyBaseMaxX;
	readonly structures: BaseStructure[] = ENEMY_LAYOUT.map((s) => ({ ...s, fire: null }));
	readonly guns: BaseGun[] = [
		{ x: mirror(-6), z: -16, yaw: Math.PI, pitch: 0.6, cooldown: 1 },
		{ x: mirror(515), z: -20, yaw: Math.PI, pitch: 0.6, cooldown: 2 }
	];
	/** Its guns are silenced once the HQ falls. */
	silenced = false;

	update(w: World, dt: number): void {
		if (this.silenced) return;
		for (const g of this.guns) aimGun(w, g, dt, 'enemy');
	}

	/** The HQ has fallen: the airfield goes up with it. */
	burn(w: World): void {
		this.silenced = true;
		for (const s of this.structures) {
			if (s.fire || s.mesh === 'runway' || s.mesh === 'windsock' || s.mesh === 'flagpole') continue;
			const y = w.terrain.heightAtXZ(s.x, s.z);
			s.fire = w.fires.add(s.x + rnd.range(-3, 3), y + 2, s.z, 2.2, 1e9, { radius: 3 });
			w.fx.explosion(s.x, y + 2, s.z, 1, true);
		}
	}

	reset(): void {
		this.silenced = false;
		for (const s of this.structures) s.fire = null;
	}
}
