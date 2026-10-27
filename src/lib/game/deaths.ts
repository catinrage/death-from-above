import { mat4, quat, type Mat4 } from '../engine/math';
import type { MeshName } from '../models';
import type { DamageCause } from './combat';
import type { DebrisPart } from './debris';
import { poseParts, poseScratch, rootMatrix } from './unit-pose';
import type { Owner, Unit } from './types';
import type { World } from './world';

const root = mat4.create();
const body = mat4.create();
const inv = mat4.create();
const CHUNKS: MeshName[] = ['chunk0', 'chunk1', 'chunk2', 'plate', 'beam'];

/** Re-expresses selected posed parts relative to a new rigid body frame. */
function partsRelativeTo(
	u: Unit,
	cx: number,
	cy: number,
	cz: number,
	include: (i: number) => boolean,
	ragdoll = false
): DebrisPart[] {
	rootMatrix(root, u);
	const mats = poseParts(u, root, poseScratch, ragdoll);
	mat4.fromTranslation(body, cx, cy, cz);
	mat4.rotateY(body, body, u.yaw);
	mat4.rotateZ(body, body, u.pitch);
	mat4.invert(inv, body);
	const out: DebrisPart[] = [];
	u.def.parts.forEach((s, i) => {
		if (!include(i)) return;
		const local: Mat4 = mat4.create();
		mat4.multiply(local, inv, mats[i]);
		out.push({ mesh: s.mesh, local });
	});
	return out;
}

function bodyQuat(u: Unit): Float32Array {
	return quat.fromYawPitchRoll(quat.create(), u.yaw, u.pitch, 0);
}

function scatterChunks(
	w: World,
	u: Unit,
	n: number,
	power: number,
	tint: [number, number, number]
): void {
	const ident = mat4.create();
	for (let i = 0; i < n; i++) {
		w.debris.spawn({
			x: u.x + w.rng.gauss(u.def.half[0] * 0.5),
			y: u.y + u.def.half[1] * 1.5,
			z: u.z + w.rng.gauss(u.def.half[2] * 0.4),
			vx: w.rng.gauss(power * 0.6),
			vy: w.rng.range(0.6, 1.3) * power,
			vz: w.rng.gauss(power * 0.25),
			half: [0.45, 0.3, 0.35],
			parts: [{ mesh: w.rng.pick(CHUNKS), local: ident }],
			mass: 0.8,
			spin: 9,
			tint,
			char: 0.6,
			burn: w.rng.chance(0.4) ? w.rng.range(1, 3) : 0,
			life: w.rng.range(5, 10),
			scale: w.rng.range(0.6, 1.2)
		});
	}
}

export function killUnit(w: World, u: Unit, fromX: number, cause: DamageCause, by: Owner): void {
	if (!u.alive) return;
	u.alive = false;
	u.hp = 0;
	u.deadTime = 0;
	u.speed = 0;
	u.lamp?.release();
	u.lamp = null;
	w.events.kill(u.def.name, u.def.score, u.x, u.y + u.def.half[1] * 2 + 3, by);
	if (u.def.supply) w.events.supply(u.x, u.y + 6);
	const dir = Math.sign(u.x - fromX) || (w.rng.chance(0.5) ? 1 : -1);
	switch (u.def.death) {
		case 'ragdoll':
			return ragdoll(w, u, dir, cause);
		case 'flip':
			return flip(w, u, dir);
		case 'turretPop':
			return turretPop(w, u, dir);
		case 'blast':
			return blast(w, u);
		case 'collapse':
			return collapse(w, u);
	}
}

/** A unit whose footing gave way: it tumbles off whole instead of exploding. */
export function dropUnit(w: World, u: Unit, by: Owner): void {
	if (!u.alive) return;
	u.alive = false;
	u.hp = 0;
	u.deadTime = 0;
	u.speed = 0;
	u.lamp?.release();
	u.lamp = null;
	w.events.kill(u.def.name, u.def.score, u.x, u.y + u.def.half[1] * 2 + 3, by);
	const hy = u.def.half[1];
	const cy = u.y + hy;
	const infantry = u.def.category === 'infantry';
	w.debris.spawn({
		x: u.x,
		y: cy,
		z: u.z,
		vx: w.rng.gauss(1.5),
		vy: w.rng.range(-1, 1.5),
		vz: w.rng.gauss(0.8),
		half: infantry ? [0.3, 0.9, 0.3] : [u.def.half[0] * 0.9, hy * 0.85, u.def.half[2] * 0.9],
		parts: partsRelativeTo(u, u.x, cy, u.z, () => true, infantry),
		mass: infantry ? 0.8 : 5,
		spin: infantry ? 4 : 1.2,
		q: bodyQuat(u),
		life: w.rng.range(30, 45)
	});
	u.remove = true;
}

export function ragdoll(w: World, u: Unit, dir: number, cause: DamageCause): void {
	const cy = u.y + 0.9;
	const parts = partsRelativeTo(u, u.x, cy, u.z, () => true, true);
	const power = cause === 'blast' ? w.rng.range(9, 17) : w.rng.range(1.5, 4);
	w.debris.spawn({
		x: u.x,
		y: cy,
		z: u.z,
		vx: dir * power * w.rng.range(0.5, 1),
		vy: power * w.rng.range(0.6, 1.1),
		vz: w.rng.gauss(1.5),
		half: [0.3, 0.9, 0.3],
		parts,
		mass: 0.8,
		spin: cause === 'blast' ? 8 : 2.5,
		q: bodyQuat(u),
		life: w.rng.range(5, 9),
		char: cause === 'fire' ? 0.9 : cause === 'blast' ? 0.35 : 0,
		burn: cause === 'fire' ? 2 : 0
	});
	u.remove = true;
	if (cause === 'bullet') w.fx.impact(u.x, u.y + 1, u.z, 'soft');
}

function flip(w: World, u: Unit, dir: number): void {
	const hy = u.def.half[1];
	const cy = u.y + hy;
	w.fx.explosion(u.x, u.y + 1, u.z, u.def.boom, true);
	w.sound.boom(u.def.boom, u.x, u.y);
	const parts = partsRelativeTo(u, u.x, cy, u.z, () => true);
	w.debris.spawn({
		x: u.x,
		y: cy,
		z: u.z,
		vx: dir * w.rng.range(3, 8),
		vy: w.rng.range(8, 14),
		vz: w.rng.gauss(2),
		half: [u.def.half[0] * 0.9, hy * 0.85, u.def.half[2] * 0.9],
		parts,
		mass: 5,
		spin: 3.5,
		q: bodyQuat(u),
		life: w.rng.range(28, 40),
		burn: 5,
		smoke: 22,
		char: 0.85
	});
	scatterChunks(w, u, 4, 12, [0.6, 0.62, 0.5]);
	w.fires.add(u.x, u.y + 0.5, u.z, 1, w.rng.range(10, 18), { radius: 1.2 });
	u.remove = true;
}

function turretPop(w: World, u: Unit, dir: number): void {
	const hy = u.def.half[1];
	w.fx.explosion(u.x, u.y + hy * 1.5, u.z, u.def.boom, true);
	// Ammunition cooking off: the vehicle's own blast on top of whatever killed it.
	w.sound.boom(u.def.boom * 0.9, u.x, u.y);
	const detach = new Set<number>();
	u.def.parts.forEach((s, i) => {
		if (s.detach || (s.parent !== undefined && detach.has(s.parent))) detach.add(i);
	});
	const first = u.def.parts.findIndex((s) => s.detach);
	if (first >= 0) {
		const at = u.def.parts[first].at;
		const cx = u.x + Math.cos(u.yaw) * at[0],
			cy = u.y + at[1] + 0.5,
			cz = u.z - Math.sin(u.yaw) * at[0];
		const parts = partsRelativeTo(u, cx, cy, cz, (i) => detach.has(i));
		w.debris.spawn({
			x: cx,
			y: cy,
			z: cz,
			vx: dir * w.rng.range(2, 6),
			vy: w.rng.range(15, 24),
			vz: w.rng.gauss(2),
			half: [1.5, 0.5, 1.2],
			parts,
			mass: 3,
			spin: 5,
			q: bodyQuat(u),
			life: w.rng.range(25, 35),
			burn: 4,
			smoke: 10,
			char: 0.9
		});
	}
	u.turretGone = true;
	u.char = 1;
	u.fire = w.fires.add(u.x, u.y + hy * 1.6, u.z, 1.5, w.rng.range(25, 45), { radius: 1.3 });
	scatterChunks(w, u, 3, 10, [0.6, 0.62, 0.5]);
}

/** How far a big structure's fireball reaches its neighbours, and how hard it hits them. */
export const CHAIN_REACH = 34;
export const CHAIN_DAMAGE = 90;

function blast(w: World, u: Unit): void {
	const big = u.def.boom > 2;
	const hy = u.def.half[1];
	w.fx.explosion(u.x, u.y + 1, u.z, u.def.boom, true);
	w.sound.boom(u.def.boom, u.x, u.y);
	w.terrain.crater(u.x, u.z, 3 + u.def.boom * 2.5, 0.6 + u.def.boom * 0.5, 1, 1);
	u.char = 1;
	u.turretGone = true;
	if (big) {
		w.events.slowmo(0.35, 0.7);
		for (let i = 0; i < 3; i++) {
			const ox = w.rng.range(-8, 8);
			w.fx.explosion(u.x + ox, u.y + 4 + i * 5, u.z, 1.4, false);
		}
		w.fx.flash(1.2);
		w.fires.add(u.x, u.y + 1, u.z, 3, w.rng.range(50, 70), { radius: 7, dps: 25 });
		// The fireball reaches neighbours — chain reactions.
		for (const o of w.units) {
			if (o === u || !o.alive) continue;
			if (Math.abs(o.x - u.x) < CHAIN_REACH) o.hp -= CHAIN_DAMAGE * (1 - o.def.armor * 0.7);
			if (o.hp <= 0) killUnit(w, o, u.x, 'blast', u.lastHitBy);
		}
	} else {
		u.fire = w.fires.add(u.x, u.y + hy * 1.4, u.z, 1.6, w.rng.range(25, 40), { radius: 1.6 });
	}
	scatterChunks(w, u, big ? 14 : 6, big ? 22 : 13, big ? [1.3, 1.25, 1.15] : [0.6, 0.62, 0.5]);
}

function collapse(w: World, u: Unit): void {
	w.fx.explosion(u.x, u.y + 1.5, u.z, u.def.boom, true);
	w.fx.dustRing(u.x, u.y, u.z, 1.5);
	w.sound.boom(u.def.boom * 0.8, u.x, u.y);
	u.char = 0.9;
	u.turretGone = true;
	scatterChunks(w, u, 10, 11, [1.25, 1.2, 1.1]);
	if (u.def.kind !== 'searchlight') {
		u.fire = w.fires.add(u.x, u.y + 1, u.z, 1, w.rng.range(15, 25), { radius: 2 });
	}
}
