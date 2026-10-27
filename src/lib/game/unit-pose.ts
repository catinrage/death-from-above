import { mat4, type Mat4 } from '../engine/math';
import type { PartDrive, Unit } from './types';

const MAX_PARTS = 16;
/** Scratch matrices for posing a single unit; reuse, do not keep references. */
export const poseScratch: Mat4[] = Array.from({ length: MAX_PARTS }, () => mat4.create());
const muzzleRoot = mat4.create();
const muzzleParts: Mat4[] = Array.from({ length: MAX_PARTS }, () => mat4.create());

export function rootMatrix(out: Mat4, u: Unit): Mat4 {
	mat4.fromTranslation(out, u.x, u.y, u.z);
	mat4.rotateY(out, out, u.yaw);
	mat4.rotateZ(out, out, u.pitch);
	return out;
}

function drive(m: Mat4, u: Unit, d: PartDrive | undefined, ragdoll: boolean): void {
	if (!d) return;
	const walk = u.def.speed > 0 ? Math.min(1, Math.abs(u.speed) / u.def.speed) : 0;
	const aiming = u.state === 'hold' || u.state === 'siege';
	switch (d) {
		case 'yaw':
			mat4.rotateY(m, m, u.aimYaw);
			break;
		case 'pitch':
		case 'rack':
			mat4.rotateZ(m, m, u.aimPitch);
			break;
		case 'aim':
			mat4.rotateY(m, m, u.aimYaw);
			mat4.rotateZ(m, m, u.aimPitch);
			break;
		case 'wheel':
			mat4.rotateZ(m, m, -u.anim);
			break;
		case 'spin':
			mat4.rotateY(m, m, u.spin);
			break;
		case 'legL':
		case 'legR': {
			const s = d === 'legL' ? 1 : -1;
			if (ragdoll) {
				mat4.rotateX(m, m, 0.35 * s);
				mat4.rotateZ(m, m, 0.4 * s);
			} else {
				mat4.rotateZ(m, m, Math.sin(u.anim) * 0.7 * walk * s);
			}
			break;
		}
		case 'armL':
		case 'armR': {
			const s = d === 'armL' ? 1 : -1;
			if (ragdoll) {
				mat4.rotateX(m, m, 0.5 * s);
				mat4.rotateZ(m, m, 2.5);
			} else if (aiming) {
				mat4.rotateZ(m, m, 1.25 + 0.1 * s);
			} else {
				mat4.rotateZ(m, m, -Math.sin(u.anim) * 0.55 * walk * s + 0.25);
			}
			break;
		}
	}
}

/** World matrices for every part of `u` into `out` (parent before child). */
export function poseParts(u: Unit, root: Mat4, out: Mat4[] = poseScratch, ragdoll = false): Mat4[] {
	const parts = u.def.parts;
	for (let i = 0; i < parts.length; i++) {
		const s = parts[i];
		const parent = s.parent !== undefined ? out[s.parent] : root;
		const m = out[i];
		mat4.translate(m, parent, s.at[0], s.at[1], s.at[2]);
		drive(m, u, s.drive, ragdoll);
	}
	return out;
}

/** World-space muzzle position for a unit's weapon (tip of the aimed barrel). */
export function muzzlePoint(u: Unit, out: [number, number, number]): [number, number, number] {
	const parts = u.def.parts;
	let idx = -1;
	for (let i = parts.length - 1; i >= 0; i--) {
		const d = parts[i].drive;
		if (d === 'pitch' || d === 'aim' || d === 'rack') {
			idx = i;
			break;
		}
	}
	if (idx < 0) {
		out[0] = u.x;
		out[1] = u.y + u.def.half[1] * 1.6;
		out[2] = u.z;
		return out;
	}
	const root = rootMatrix(muzzleRoot, u);
	const mats = poseParts(u, root, muzzleParts);
	const len =
		u.def.kind === 'tank' ? 5.4 : u.def.kind === 'flak' ? 6.2 : u.def.kind === 'sam' ? 5.2 : 2.5;
	const m = mats[idx];
	out[0] = m[12] + m[0] * len;
	out[1] = m[13] + m[1] * len + (u.def.kind === 'sam' ? m[5] * 0.8 : 0);
	out[2] = m[14] + m[2] * len;
	return out;
}
