import { angleDiff, clamp, dampAngle, lerp, mat4, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { WORLD } from './constants';
import { ENEMY_WEAPONS, UNITS } from './defs-units';
import { launchMissile, spawnBullet } from './projectiles';
import type { River } from './river';
import type { AuxMount, Unit, UnitKind } from './types';
import { poseParts, rootMatrix } from './unit-pose';
import type { World } from './world';

/**
 * Where the cruiser drops anchor across the channel: just below the bridge, on
 * the camera side, so nothing on the crossing hides it.
 */
export const CRUISER_STATION = -16;
/** It swings broadside, bow toward the airfield, over its last stretch of river. */
const SWING = 22;
const BROADSIDE = Math.PI;
/** Where it comes up the river into view. */
export const CRUISER_ENTRY = -75;

const AUX_RATE = 2.4;
const AUX_ELEVATE = 1.8;
const SAM_LOCK = 2.4;
const SAM_RELOAD = 13;

const root = mat4.create();
const mats = Array.from({ length: 16 }, () => mat4.create());
const tip: [number, number, number] = [0, 0, 0];

export function isBoss(u: Unit): boolean {
	return !!u.def.boss;
}

/** A point on the river's centre line `s` metres upstream of the bridge, and the downstream heading as a yaw. */
export function riverPoint(r: River, s: number): { x: number; z: number; yaw: number } {
	const P = r.path;
	const f = clamp((s - P[0].s) / (P[1].s - P[0].s), 0, P.length - 1.001);
	const i = Math.floor(f);
	const a = P[i],
		b = P[i + 1];
	const t = f - i;
	// Downstream runs toward lower s; a unit's +X turns to (cos yaw, -sin yaw) in XZ.
	const dx = a.x - b.x,
		dz = a.z - b.z;
	return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: Math.atan2(-dz, dx) };
}

function mount(): AuxMount {
	return {
		yaw: 0,
		pitch: 0.3,
		cooldown: 2,
		burst: 0,
		gap: 0,
		second: 1.3,
		lock: 0,
		salvo: 6,
		route: 0
	};
}

/**
 * Brings a boss onto the field: the super-heavy tank rolls in from the enemy
 * end of the road, the cruiser steams up the river toward the bridge.
 */
export function spawnBoss(w: World, kind: UnitKind): Unit {
	let u: Unit;
	if (kind === 'cruiser' && w.river) {
		const at = riverPoint(w.river, CRUISER_ENTRY);
		u = w.spawnUnit('cruiser', at.x, at.z, -1);
		u.y = w.river.level;
		u.aux = mount();
		u.aux.route = CRUISER_ENTRY;
		u.yaw = at.yaw + Math.PI;
		w.events.message('RIVER CRUISER', 'Heavy flak and SAMs coming up the river', 'warn');
	} else {
		u = w.spawnUnit('superTank', WORLD.enemySpawnX + 20, 0, -1);
		u.aux = mount();
		w.events.message('BEHEMOTH', 'Super-heavy tank on the road. Bring heavy bombs', 'warn');
	}
	w.sound.play('siren', w.camera.x, w.camera.y, 0.8);
	return u;
}

/** The living boss with the most health left, for the HUD bar. */
export function bossStatus(w: World): { name: string; frac: number } | null {
	let best: Unit | null = null;
	for (const u of w.units) if (u.alive && u.def.boss && (!best || u.hp > best.hp)) best = u;
	return best ? { name: best.def.name, frac: clamp(best.hp / best.def.hp, 0, 1) } : null;
}

/**
 * Moves the cruiser up the river to its anchorage. Returns true once it is
 * there and fighting; on the way in it holds fire and can't be reached.
 */
export function steamCruiser(w: World, u: Unit, dt: number): boolean {
	const r = w.river;
	const a = u.aux;
	if (!r || !a) return true;
	const left = CRUISER_STATION - a.route;
	if (left > 0) a.route += u.def.speed * clamp(left / 30, 0.12, 1) * dt;
	a.route = Math.min(a.route, CRUISER_STATION);
	const at = riverPoint(r, a.route);
	u.x = at.x;
	u.z = at.z;
	const swing = left < SWING;
	u.yaw = dampAngle(u.yaw, swing ? BROADSIDE : at.yaw + Math.PI, swing ? 0.9 : 1.5, dt);
	// Riding the current: a slow bob and pitch.
	u.y = r.level + Math.sin(w.time * 0.9 + u.id) * 0.12;
	u.pitch = Math.sin(w.time * 0.6 + u.id) * 0.008;
	u.speed = 0;
	return a.route >= CRUISER_STATION - 0.5 && Math.abs(angleDiff(u.yaw, BROADSIDE)) < 0.1;
}

/** World position `len` metres along the X axis of part `i`. */
function partTip(u: Unit, i: number, len: number, lift = 0): [number, number, number] {
	rootMatrix(root, u);
	const m = poseParts(u, root, mats)[i];
	tip[0] = m[12] + m[0] * len + m[4] * lift;
	tip[1] = m[13] + m[1] * len + m[5] * lift;
	tip[2] = m[14] + m[2] * len + m[6] * lift;
	return tip;
}

function partIndex(u: Unit, drive: 'auxPitch' | 'auxYaw' | 'pitch', nth = 0): number {
	let n = 0;
	for (let i = 0; i < u.def.parts.length; i++) {
		if (u.def.parts[i].drive !== drive) continue;
		if (n++ === nth) return i;
	}
	return -1;
}

function aimAux(u: Unit, a: AuxMount, dt: number, tx: number, ty: number): boolean {
	const worldYaw = tx >= u.x ? 0 : Math.PI;
	const rel = wrapAngle(worldYaw - u.yaw);
	a.yaw += clamp(angleDiff(a.yaw, rel), -AUX_RATE * dt, AUX_RATE * dt);
	const pitch = clamp(Math.atan2(ty - (u.y + u.def.half[1] * 2), Math.abs(tx - u.x)), -0.05, 1.45);
	a.pitch = moveToward(a.pitch, pitch, AUX_ELEVATE * dt);
	return Math.abs(angleDiff(a.yaw, rel)) < 0.15 && Math.abs(a.pitch - pitch) < 0.12;
}

/** Secondary weapons that a boss fights with on top of its main gun. */
export function bossWeapons(w: World, u: Unit, dt: number): void {
	const a = u.aux;
	if (!a) return;
	a.cooldown -= dt;
	a.second -= dt;
	a.salvo -= dt;
	const p = w.player;
	const ox = u.x,
		oy = u.y + u.def.half[1] * 2;
	const live = p && p.alive && !w.godMode && !p.landed;
	const dist = live ? Math.hypot(p.x - ox, p.y - oy) : Infinity;
	const elev = live ? Math.atan2(p.y - oy, Math.abs(p.x - ox)) : 0;
	if (!p || !live || elev < 0.08) {
		a.lock = Math.max(0, a.lock - dt);
		a.yaw = moveToward(a.yaw, 0, dt * 0.6);
		a.pitch = moveToward(a.pitch, 0.4, dt * 0.4);
		return;
	}
	const cruiser = u.def.kind === 'cruiser';
	const gunRange = cruiser ? 760 : 680;
	if (dist < gunRange) {
		const spec = ENEMY_WEAPONS.autocannon;
		const t = dist / spec.speed;
		const tx = p.x + p.vx * t * 0.85,
			ty = p.y + p.vy * t * 0.85 + t * t;
		if (aimAux(u, a, dt, tx, ty)) autocannon(w, u, a, dt, tx, ty);
	} else {
		aimAux(u, a, dt, p.x, p.y);
	}
	if (!cruiser) return;
	// The fore flak mount, firing between the aft one's rounds once the gunners have the range.
	const flak = ENEMY_WEAPONS.flak;
	if (dist < u.def.range && u.lock > 1.1 && a.second <= 0) {
		a.second = flak.interval * rnd.range(0.8, 1.25);
		const t = dist / flak.speed;
		const tx = p.x + p.vx * t * 0.9,
			ty = p.y + p.vy * t * 0.9 + 2 * t * t;
		const m = partTip(u, partIndex(u, 'pitch', 0), 5.4);
		const ang = Math.atan2(ty - m[1], tx - m[0]) + rnd.gauss(flak.spread);
		w.shells.push({
			kind: 'flak',
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(ang) * flak.speed,
			vy: Math.sin(ang) * flak.speed,
			age: 0,
			fuse: t * rnd.range(0.94, 1.08),
			damage: flak.damage,
			radius: 16,
			owner: 'enemy',
			trail: 0
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(ang), Math.sin(ang), 2.4, [12, 6, 2]);
		w.fx.gunSmoke(m[0], m[1], m[2], 2.5);
		w.sound.play('flak', m[0], m[1], 0.7);
	}
	samBattery(w, u, a, dt, dist);
}

function autocannon(w: World, u: Unit, a: AuxMount, dt: number, tx: number, ty: number): void {
	const spec = ENEMY_WEAPONS.autocannon;
	if (a.burst > 0) {
		a.gap -= dt;
		if (a.gap > 0) return;
		a.gap = spec.burstGap;
		a.burst--;
	} else {
		if (a.cooldown > 0) return;
		a.cooldown = spec.interval * rnd.range(0.7, 1.1);
		a.burst = spec.burst + 3;
		a.gap = spec.burstGap;
	}
	const m = partTip(u, partIndex(u, 'auxPitch'), 2.6);
	const spread = spec.spread * (1.5 - Math.min(w.wave, 10) * 0.07) * (w.spotted ? 0.55 : 1);
	const ang = Math.atan2(ty - m[1], tx - m[0]) + rnd.gauss(spread);
	spawnBullet(w, {
		x: m[0],
		y: m[1],
		z: m[2],
		vx: Math.cos(ang) * spec.speed,
		vy: Math.sin(ang) * spec.speed,
		life: 2.4,
		damage: spec.damage,
		pierce: 0,
		owner: 'enemy',
		tracer: true,
		color: spec.tracer,
		size: 0.26,
		explosive: 0
	});
	w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(ang), Math.sin(ang), 1.3, spec.tracer);
	w.sound.play('aaGun', m[0], m[1], 0.45);
}

/** The cruiser's radar SAMs: a lock the player can see building, then a pair of missiles. */
function samBattery(w: World, u: Unit, a: AuxMount, dt: number, dist: number): void {
	const p = w.player;
	if (!p) return;
	if (dist > 1300) {
		a.lock = Math.max(0, a.lock - dt);
		return;
	}
	const lockTime = SAM_LOCK * p.def.stealth * (w.radarCoverage ? 0.75 : 1);
	if (a.salvo > 0) {
		a.lock = 0;
		return;
	}
	a.lock += dt;
	const progress = Math.min(1, a.lock / lockTime);
	p.lockedBy++;
	p.lockProgress = Math.max(p.lockProgress, progress);
	p.lockers.push({ x: u.x, y: u.y + u.def.half[1], progress });
	if (a.lock < lockTime) return;
	a.lock = 0;
	a.salvo = SAM_RELOAD * rnd.range(0.9, 1.15);
	const launcher = partIndex(u, 'auxYaw', 1);
	for (const side of [-1, 1]) {
		const m = partTip(u, launcher, 0, 3.2);
		const toward = p.x >= u.x ? 1 : -1;
		const angle = toward > 0 ? 1.05 + side * 0.12 : Math.PI - 1.05 + side * 0.12;
		launchMissile(w, {
			kind: 'sam',
			x: m[0],
			y: m[1],
			z: m[2] + side * 0.7,
			angle,
			speed: 30,
			maxSpeed: 270,
			accel: 230,
			turnRate: 2.3,
			target: p,
			burn: 3.4,
			life: 9,
			damage: ENEMY_WEAPONS.sam.damage,
			owner: 'enemy',
			seeker: 'radar'
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(angle), Math.sin(angle), 2.5, [12, 7, 3]);
		for (let i = 0; i < 6; i++) w.fx.trail(m[0], m[1], m[2], 2.2, 0.55, 0.7, 3, 0.4);
	}
	w.events.message('MISSILE LAUNCH', 'Cruiser SAM salvo', 'warn');
}

/** Big wrecks keep cooking off for a few seconds after they die. */
export function bossWreck(w: World, u: Unit, dt: number): void {
	if (u.deadTime > 5 || !rnd.chance(dt * 3)) return;
	const along = rnd.range(-0.8, 0.8);
	const len = u.def.half[0];
	const x = u.x + Math.cos(u.yaw) * along * len,
		z = u.z - Math.sin(u.yaw) * along * len;
	w.fx.explosion(x, u.y + u.def.half[1] * rnd.range(0.8, 1.8), z, rnd.range(0.6, 1.2), false);
	w.sound.boom(0.8, x, u.y);
}

/**
 * A sunk cruiser settles onto the river bed, listing, with its upperworks
 * still above the water, and finally slips under.
 */
export function sinkWreck(w: World, u: Unit, dt: number): void {
	u.deadTime += dt;
	bossWreck(w, u, dt);
	const r = w.river;
	const level = r ? r.level : u.y;
	const bed = r ? level - r.depth - 0.5 : u.y;
	const settle = u.deadTime < 60 ? bed + 2.2 : bed - 12;
	const rate = u.deadTime < 60 ? 0.9 : 0.35;
	if (u.y > settle) {
		const wasDry = u.y > level - 1;
		u.y = Math.max(settle, u.y - rate * dt);
		if (wasDry && rnd.chance(dt * 6)) {
			w.fx.water.splash(u.x + rnd.gauss(u.def.half[0] * 0.6), level, u.z + rnd.gauss(3), 1.2);
		}
	}
	u.pitch = moveToward(u.pitch, -0.07, dt * 0.02);
	if (u.deadTime > 75) u.remove = true;
}

/** Is this kind a boss? Bosses come from the act's script, never from the wave budget. */
export function isBossKind(kind: string): kind is UnitKind {
	return kind in UNITS && !!UNITS[kind as UnitKind].boss;
}
