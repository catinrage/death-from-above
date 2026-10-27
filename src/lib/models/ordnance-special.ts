import { MeshBuilder, mat, type Material } from '../engine/mesh-builder';
import { P } from './palette';

const NUKE = mat(0xc8c4b4, 0.45, 0.35);
const CHEM = mat(0x5c6b3a, 0.7, 0.1);
const CHEM_BAND = mat(0x9ad14a, 0.5, 0, 0.6);
const EMP = mat(0x2f3a4a, 0.4, 0.6);
const EMP_GLOW = mat(0x7fd8ff, 0.3, 0, 2.2);
const CRUISE = mat(0x9ea4a8, 0.45, 0.4);
const CANOPY = mat(0x6f7a52, 0.95, 0);
const CORD = mat(0x2a2a24, 0.9, 0);

function fins(b: MeshBuilder, x: number, len: number, span: number, m: Material): void {
	b.box(len, 0.03, span, m, x, 0, 0);
	b.box(len, span, 0.03, m, x, 0, 0);
}

/** Tactical nuclear bomb: fat, pale, ringed with warning stripes. Nose +X. */
export function bombNuke(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.9],
			[0.28, -1.8],
			[0.5, -1.0],
			[0.55, 0.7],
			[0.4, 1.5],
			[0.0, 1.85]
		],
		16,
		NUKE,
		{ axis: 'x' }
	);
	for (const x of [-0.6, 0.2])
		b.push().translate(x, 0, 0).cylinder(0.56, 0.56, 0.12, 16, P.bombYellow, { axis: 'x' }).pop();
	b.push().translate(-0.2, 0, 0).cylinder(0.565, 0.565, 0.14, 16, P.red, { axis: 'x' }).pop();
	fins(b, -1.6, 0.7, 1.4, NUKE);
	return b.build();
}

/** Chemical canister bomb with a sickly green band. */
export function bombChem(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.1],
			[0.15, -1.05],
			[0.22, -0.6],
			[0.22, 0.6],
			[0.12, 0.95],
			[0.0, 1.05]
		],
		12,
		CHEM,
		{ axis: 'x' }
	);
	b.push().translate(0.1, 0, 0).cylinder(0.225, 0.225, 0.22, 12, CHEM_BAND, { axis: 'x' }).pop();
	fins(b, -0.9, 0.45, 0.62, CHEM);
	return b.build();
}

/** EMP device: dark casing with glowing coils. */
export function bombEmp(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.0],
			[0.16, -0.95],
			[0.22, -0.4],
			[0.22, 0.5],
			[0.1, 0.95],
			[0.0, 1.0]
		],
		12,
		EMP,
		{ axis: 'x' }
	);
	for (const x of [-0.3, 0.0, 0.3])
		b.push().translate(x, 0, 0).cylinder(0.235, 0.235, 0.06, 12, EMP_GLOW, { axis: 'x' }).pop();
	fins(b, -0.85, 0.4, 0.6, EMP);
	return b.build();
}

/** Cruise missile: long body, pop-out wings, belly intake. */
export function cruiseMissile(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -2.6],
			[0.2, -2.5],
			[0.26, -1.8],
			[0.26, 1.8],
			[0.16, 2.4],
			[0.0, 2.6]
		],
		12,
		CRUISE,
		{ axis: 'x' }
	);
	b.box(0.9, 0.04, 2.6, CRUISE, 0.1, 0.05, 0);
	b.box(0.7, 0.5, 0.04, CRUISE, -2.2, 0.25, 0);
	b.box(0.6, 0.04, 0.9, CRUISE, -2.25, 0, 0);
	b.box(0.7, 0.16, 0.22, P.nozzle, -1.0, -0.3, 0);
	return b.build();
}

/** Ballistic missile re-entry vehicle: a long cone falling point-first. */
export function ballisticWarhead(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -3.0],
			[0.55, -2.9],
			[0.6, -2.2],
			[0.42, 0.8],
			[0.12, 2.8],
			[0.0, 3.0]
		],
		14,
		mat(0x3a3a3c, 0.4, 0.5),
		{ axis: 'x' }
	);
	fins(b, -2.4, 0.9, 1.8, mat(0x2c2c2e, 0.5, 0.5));
	return b.build();
}

/** Round military parachute canopy with its lines; origin where the lines meet. */
export function parachute(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 6.2, 0).scale(1, 0.45, 1);
	b.lathe(
		[
			[0.0, 1.0],
			[1.6, 0.9],
			[2.7, 0.5],
			[3.2, -0.1]
		],
		14,
		CANOPY
	);
	b.pop();
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		const tx = Math.cos(a) * 3.1,
			tz = Math.sin(a) * 3.1;
		const len = Math.hypot(tx, 6.1, tz);
		b.push()
			.translate(tx / 2, 3.05, tz / 2)
			.rotateY(-Math.atan2(tz, tx))
			.rotateZ(Math.atan2(6.1, Math.hypot(tx, tz)) - Math.PI / 2);
		b.box(0.03, len, 0.03, CORD);
		b.pop();
	}
	return b.build();
}
