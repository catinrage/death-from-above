import { mat4, quat, type Mat4, type Quat } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { MeshName } from '../models';
import { WORLD } from './constants';
import type { Effects } from './effects';
import type { Terrain } from './terrain';

export interface DebrisPart {
	mesh: MeshName;
	local: Mat4;
}

export interface DebrisOptions {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	half: [number, number, number];
	parts: DebrisPart[];
	mass?: number;
	spin?: number;
	life?: number;
	burn?: number;
	smoke?: number;
	tint?: [number, number, number];
	char?: number;
	scale?: number;
	q?: Quat;
}

export class Debris {
	x = 0;
	y = 0;
	z = 0;
	vx = 0;
	vy = 0;
	vz = 0;
	wx = 0;
	wy = 0;
	wz = 0;
	readonly q: Quat = quat.create();
	half: [number, number, number] = [0.5, 0.5, 0.5];
	invMass = 1;
	invI: [number, number, number] = [1, 1, 1];
	parts: DebrisPart[] = [];
	tint: [number, number, number] = [1, 1, 1];
	char = 0;
	scale = 1;
	age = 0;
	life = 8;
	burn = 0;
	smoke = 0;
	rest = 0;
	sleeping = false;
	dead = false;
	grounded = false;
	/** Never retired to make room (bridge wreckage). */
	persistent = false;
	/** Currently under water. */
	wet = false;
}

/** What wreckage rests on and swims in. */
export interface DebrisGround {
	/** Height of whatever a point at (x, y, z) would rest on. */
	support(x: number, y: number, z: number): number;
	/** Water surface at (x, z), or -Infinity where dry. */
	water(x: number, z: number): number;
}

/** Bare terrain: no water, nothing built on it. */
export function terrainGround(t: Terrain): DebrisGround {
	return { support: (x, _y, z) => t.heightAtXZ(x, z), water: () => -Infinity };
}

const RESTITUTION = 0.22;
const FRICTION = 0.65;
const tmpQ = quat.create();
const v3 = new Float32Array(3);
const contactR = new Float32Array(24);

/** Small rigid-body simulator for wreckage: oriented boxes against the heightfield. */
export class DebrisSystem {
	readonly list: Debris[] = [];
	max = 260;

	spawn(o: DebrisOptions): Debris {
		if (this.list.length >= this.max) {
			// Retire the oldest settled piece first.
			let idx = this.list.findIndex((d) => d.sleeping && !d.persistent);
			if (idx < 0) idx = this.list.findIndex((d) => !d.persistent);
			if (idx < 0) idx = 0;
			this.list.splice(idx, 1);
		}
		const d = new Debris();
		d.x = o.x;
		d.y = o.y;
		d.z = o.z;
		d.vx = o.vx;
		d.vy = o.vy;
		d.vz = o.vz;
		d.half = o.half;
		const mass = o.mass ?? 1;
		d.invMass = 1 / mass;
		const [hx, hy, hz] = o.half;
		// Solid box inertia, I = m/3 * (b² + c²) for half extents.
		d.invI = [
			3 / (mass * (hy * hy + hz * hz)),
			3 / (mass * (hx * hx + hz * hz)),
			3 / (mass * (hx * hx + hy * hy))
		];
		const spin = o.spin ?? 6;
		d.wx = rnd.gauss(spin);
		d.wy = rnd.gauss(spin * 0.6);
		d.wz = rnd.gauss(spin);
		if (o.q) d.q.set(o.q);
		else quat.fromYawPitchRoll(d.q, rnd.range(0, 6.28), rnd.range(-1, 1), rnd.range(-1, 1));
		d.parts = o.parts;
		d.life = o.life ?? rnd.range(7, 12);
		d.burn = o.burn ?? 0;
		d.smoke = o.smoke ?? 0;
		d.tint = o.tint ?? [1, 1, 1];
		d.char = o.char ?? 0;
		d.scale = o.scale ?? 1;
		this.list.push(d);
		return d;
	}

	/** Radial push from an explosion; wakes sleeping pieces. */
	impulse(x: number, y: number, z: number, radius: number, strength: number): void {
		for (const d of this.list) {
			const dx = d.x - x,
				dy = d.y - y,
				dz = d.z - z;
			const dist = Math.hypot(dx, dy, dz);
			if (dist > radius) continue;
			const k = (strength * (1 - dist / radius)) / Math.max(dist, 1);
			d.vx += dx * k;
			d.vy += Math.abs(dy) * k + strength * 0.25 * (1 - dist / radius);
			d.vz += dz * k * 0.4;
			d.wx += rnd.gauss(4);
			d.wz += rnd.gauss(4);
			d.sleeping = false;
			d.rest = 0;
		}
	}

	remove(d: Debris): void {
		const i = this.list.indexOf(d);
		if (i >= 0) this.list.splice(i, 1);
	}

	update(dt: number, ground: DebrisGround, fx: Effects): void {
		for (let i = this.list.length - 1; i >= 0; i--) {
			const d = this.list[i];
			d.age += dt;
			if (d.burn > 0) {
				d.burn -= dt;
				if (rnd.chance(dt * 18)) fx.ember(d.x, d.y + d.half[1], d.z);
			}
			if (d.smoke > 0) {
				d.smoke -= dt;
				if (rnd.chance(dt * 6))
					fx.trail(d.x, d.y + d.half[1], d.z, 1.2 * d.scale, 0.05, 0.7, 3, 1.5);
			}
			if (d.age > d.life) {
				d.y -= dt * 0.6;
				if (d.age > d.life + 3) {
					this.list.splice(i, 1);
					continue;
				}
				continue;
			}
			if (!d.sleeping) this.step(d, dt, ground, fx);
		}
	}

	private step(d: Debris, dt: number, ground: DebrisGround, fx: Effects): void {
		const level = ground.water(d.x, d.z);
		const wet = d.y < level;
		if (wet !== d.wet) {
			d.wet = wet;
			if (wet) {
				// Splash scaled by how much is hitting the water and how fast.
				const mass = 1 / d.invMass;
				fx.water.splash(
					d.x,
					level,
					d.z,
					Math.min(3, 0.25 + Math.sqrt(mass) * 0.12 * Math.abs(d.vy) * 0.15)
				);
				d.burn = 0;
				d.smoke = 0;
			}
		}
		// Under water: buoyancy leaves a slow sink and the water drags everything down.
		d.vy -= WORLD.gravity * dt * (wet ? 0.25 : 1);
		const air = Math.exp(-(wet ? 2.2 : 0.05) * dt);
		if (wet) {
			const spin = Math.exp(-2 * dt);
			d.wx *= spin;
			d.wy *= spin;
			d.wz *= spin;
		}
		d.vx *= air;
		d.vy *= air;
		d.vz *= air;
		d.x += d.vx * dt;
		d.y += d.vy * dt;
		d.z += d.vz * dt;
		if (Math.abs(d.z) > 30) d.vz -= Math.sign(d.z) * 20 * dt;
		quat.integrate(d.q, d.wx, d.wy, d.wz, dt);

		const [hx, hy, hz] = d.half;
		const s = d.scale;
		let contacts = 0;
		let maxPen = 0;
		for (let c = 0; c < 8; c++) {
			const lx = (c & 1 ? hx : -hx) * s,
				ly = (c & 2 ? hy : -hy) * s,
				lz = (c & 4 ? hz : -hz) * s;
			quat.rotate(v3, d.q, lx, ly, lz);
			const pen = ground.support(d.x + v3[0], d.y + v3[1], d.z + v3[2]) - (d.y + v3[1]);
			if (pen <= 0) continue;
			contactR[contacts * 3] = v3[0];
			contactR[contacts * 3 + 1] = v3[1];
			contactR[contacts * 3 + 2] = v3[2];
			contacts++;
			maxPen = Math.max(maxPen, pen);
		}
		// A few sequential-impulse sweeps so multi-point contacts converge instead of rocking.
		for (let iter = 0; iter < 4 && contacts > 0; iter++) {
			for (let c = 0; c < contacts; c++) {
				const rx = contactR[c * 3],
					ry = contactR[c * 3 + 1],
					rz = contactR[c * 3 + 2];
				// Contact velocity v + w × r (normal is world up).
				const vcx = d.vx + (d.wy * rz - d.wz * ry);
				const vcy = d.vy + (d.wz * rx - d.wx * rz);
				const vcz = d.vz + (d.wx * ry - d.wy * rx);
				if (vcy >= 0) continue;
				// r × n with n = (0, 1, 0) is (-rz, 0, rx).
				this.applyInvInertia(d, -rz, 0, rx);
				const iwx = v3[0],
					iwy = v3[1],
					iwz = v3[2];
				const k = d.invMass + (iwz * rx - iwx * rz);
				// Resting contacts get no bounce, otherwise gravity re-injects jitter every frame.
				const e = iter === 0 && vcy < -1.5 ? RESTITUTION : 0;
				const j = (-(1 + e) * vcy) / Math.max(k, 1e-4);
				d.vy += j * d.invMass;
				d.wx += iwx * j;
				d.wy += iwy * j;
				d.wz += iwz * j;
				// Coulomb friction along the sliding direction.
				const vt = Math.hypot(vcx, vcz);
				if (vt > 1e-4) {
					const tx = -vcx / vt,
						tz = -vcz / vt;
					// r × t with t = (tx, 0, tz)
					this.applyInvInertia(d, ry * tz, rz * tx - rx * tz, -ry * tx);
					const kt = d.invMass + (tx * (v3[1] * rz - v3[2] * ry) + tz * (v3[0] * ry - v3[1] * rx));
					const jt = Math.min(vt / Math.max(kt, 1e-4), FRICTION * j);
					d.vx += tx * jt * d.invMass;
					d.vz += tz * jt * d.invMass;
					d.wx += v3[0] * jt;
					d.wy += v3[1] * jt;
					d.wz += v3[2] * jt;
				}
			}
		}
		d.grounded = contacts > 0;
		if (contacts > 0) {
			d.y += maxPen * 0.8;
			let speed = Math.hypot(d.vx, d.vy, d.vz) + Math.hypot(d.wx, d.wy, d.wz);
			// Rolling resistance: bleed energy hard once a piece is nearly settled.
			const damp = Math.exp(-(speed < 2.5 ? 6 : 1.5) * dt);
			d.wx *= damp;
			d.wy *= damp;
			d.wz *= damp;
			if (speed < 2.5) {
				d.vx *= damp;
				d.vz *= damp;
			}
			speed = Math.hypot(d.vx, d.vy, d.vz) + Math.hypot(d.wx, d.wy, d.wz);
			d.rest = speed < 0.6 ? d.rest + dt : 0;
			if (d.rest > 0.6) {
				d.sleeping = true;
				d.vx = d.vy = d.vz = d.wx = d.wy = d.wz = 0;
			}
		}
	}

	/** v3 = I_world⁻¹ · (x, y, z) using the body orientation. */
	private applyInvInertia(d: Debris, x: number, y: number, z: number): void {
		tmpQ[0] = -d.q[0];
		tmpQ[1] = -d.q[1];
		tmpQ[2] = -d.q[2];
		tmpQ[3] = d.q[3];
		quat.rotate(v3, tmpQ, x, y, z);
		const bx = v3[0] * d.invI[0],
			by = v3[1] * d.invI[1],
			bz = v3[2] * d.invI[2];
		quat.rotate(v3, d.q, bx, by, bz);
	}

	clear(): void {
		this.list.length = 0;
	}
}

/** Model matrix for a debris body (before the part's local transform). */
export function debrisMatrix(out: Mat4, d: Debris): Mat4 {
	mat4.fromQuatTranslation(out, d.q, d.x, d.y, d.z);
	if (d.scale !== 1) mat4.scale(out, out, d.scale, d.scale, d.scale);
	return out;
}
