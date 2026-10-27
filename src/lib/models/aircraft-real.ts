import { MeshBuilder, mat, type Material, type P2 } from '../engine/mesh-builder';
import { P } from './palette';

const A10_GREY = mat(0x6d7378, 0.6, 0.25);
const A10_DARK = mat(0x565c61, 0.62, 0.25);
const VIPER = mat(0x8d949b, 0.45, 0.35);
const VIPER_DARK = mat(0x6f767d, 0.5, 0.35);
const FROG = mat(0x7d6c48, 0.7, 0.15);
const FROG_GREEN = mat(0x56603e, 0.72, 0.15);
const FROG_BELLY = mat(0x8fa3b0, 0.6, 0.15);
const PHANTOM = mat(0x5e6a4b, 0.66, 0.2);
const PHANTOM_TAN = mat(0x8b7a55, 0.66, 0.2);
const LANCER = mat(0x3b3f43, 0.5, 0.35);
const LANCER_DARK = mat(0x2d3034, 0.55, 0.35);
const RADOME = mat(0x2a2c2e, 0.5, 0.2);

const mirror = (pts: readonly P2[]): P2[] => pts.map(([x, z]) => [x, -z] as P2);

/** A wing pair from one planform (XZ), at height y, optionally tilted (dihedral). */
function wingPair(
	b: MeshBuilder,
	planform: readonly P2[],
	y: number,
	t: number,
	m: Material,
	dihedral = 0
): void {
	for (const s of [1, -1]) {
		b.push()
			.translate(0, y, 0)
			.rotateX(dihedral * s);
		b.slab(s > 0 ? planform : mirror(planform), t, m);
		b.pop();
	}
}

/** A vertical fin from a side profile (XY), centred at z. */
function fin(
	b: MeshBuilder,
	profile: readonly P2[],
	z: number,
	t: number,
	m: Material,
	cant = 0
): void {
	b.push().translate(0, 0, z).rotateX(cant);
	b.push().translate(0, 0, -t / 2);
	b.extrude(profile, t, m);
	b.pop();
	b.pop();
}

function body(b: MeshBuilder, profile: readonly P2[], m: Material, sy = 1, sz = 1): void {
	b.push().scale(1, sy, sz);
	b.lathe(profile, 16, m, { axis: 'x' });
	b.pop();
}

function nozzle(b: MeshBuilder, x: number, y: number, z: number, r: number): void {
	b.push()
		.translate(x, y, z)
		.cylinder(r * 0.9, r, 0.8, 12, P.nozzle, { axis: 'x' })
		.pop();
	b.push()
		.translate(x - 0.05, y, z)
		.cylinder(r * 0.75, r * 0.75, 0.04, 12, P.nozzleHot, { axis: 'x' })
		.pop();
}

function canopy(b: MeshBuilder, x: number, y: number, len: number, h: number, w: number): void {
	b.push().translate(x, y, 0).scale(len, h, w).sphere(1, 14, 8, P.canopy).pop();
}

function navLights(b: MeshBuilder, x: number, y: number, z: number): void {
	b.box(0.22, 0.09, 0.12, P.navGreen, x, y, z);
	b.box(0.22, 0.09, 0.12, P.navRed, x, y, -z);
}

/** A-10C Thunderbolt II: straight wings, podded engines, twin tails, a cannon for a nose. */
export function a10(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.35, -7.6],
			[0.7, -6.4],
			[0.95, -3.0],
			[1.0, 1.0],
			[0.85, 4.2],
			[0.55, 6.6],
			[0.25, 7.5],
			[0.0, 7.7]
		],
		A10_GREY,
		1.05,
		0.9
	);
	b.push().translate(7.9, -0.25, 0).cylinder(0.16, 0.16, 1.4, 8, P.gunMetal, { axis: 'x' }).pop();
	canopy(b, 4.9, 0.85, 1.3, 0.55, 0.55);
	wingPair(
		b,
		[
			[1.4, 0.8],
			[0.9, 8.8],
			[-1.0, 8.8],
			[-1.3, 0.8]
		],
		-0.45,
		0.32,
		A10_GREY,
		0.04
	);
	for (const s of [1, -1]) {
		b.push()
			.translate(-3.6, 1.15, 1.25 * s)
			.cylinder(0.72, 0.62, 3.2, 14, A10_DARK, { axis: 'x' })
			.pop();
		b.box(1.6, 0.5, 0.3, A10_DARK, -3.4, 0.6, 0.9 * s);
		nozzle(b, -5.25, 1.15, 1.25 * s, 0.55);
	}
	b.push()
		.translate(-7.0, 0.35, 0)
		.slab(
			[
				[0.6, 0],
				[0.6, 3.0],
				[-1.0, 3.0],
				[-1.0, 0]
			],
			0.18,
			A10_GREY
		)
		.slab(
			mirror([
				[0.6, 0],
				[0.6, 3.0],
				[-1.0, 3.0],
				[-1.0, 0]
			]),
			0.18,
			A10_GREY
		)
		.pop();
	for (const s of [1, -1])
		fin(
			b,
			[
				[-6.3, 0.0],
				[-8.2, 0.0],
				[-8.4, 3.4],
				[-7.0, 3.4]
			],
			3.0 * s,
			0.16,
			A10_DARK
		);
	navLights(b, -0.9, -0.45, 8.8);
	return b.build();
}

/** F-16C Fighting Falcon: belly intake, bubble canopy, cropped delta and one tall fin. */
export function f16(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.5, -7.2],
			[0.72, -5.5],
			[0.82, -1.0],
			[0.78, 2.5],
			[0.55, 4.8],
			[0.25, 6.6],
			[0.0, 7.2]
		],
		VIPER,
		1.0,
		0.95
	);
	b.box(3.2, 0.7, 1.0, VIPER_DARK, 2.0, -0.85, 0);
	b.box(0.1, 0.6, 0.9, P.slit, 3.6, -0.85, 0);
	canopy(b, 3.4, 0.62, 1.7, 0.5, 0.45);
	wingPair(
		b,
		[
			[2.0, 0.7],
			[-2.2, 4.75],
			[-3.4, 4.75],
			[-3.1, 0.7]
		],
		-0.15,
		0.14,
		VIPER
	);
	wingPair(
		b,
		[
			[-4.8, 0.5],
			[-6.1, 2.6],
			[-6.9, 2.6],
			[-6.7, 0.5]
		],
		-0.05,
		0.1,
		VIPER_DARK,
		-0.05
	);
	fin(
		b,
		[
			[-3.4, 0.55],
			[-6.6, 0.55],
			[-7.0, 3.9],
			[-6.0, 3.9]
		],
		0,
		0.14,
		VIPER_DARK
	);
	nozzle(b, -7.5, 0, 0, 0.5);
	navLights(b, -3.3, -0.15, 4.75);
	return b.build();
}

/** Su-25 Frogfoot: armoured shoulder-wing jet with podded twin engines. */
export function su25(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.4, -7.4],
			[0.72, -6.0],
			[0.95, -2.5],
			[1.0, 1.5],
			[0.8, 4.5],
			[0.4, 6.8],
			[0.0, 7.5]
		],
		FROG,
		1.0,
		0.85
	);
	b.box(9.0, 0.3, 1.4, FROG_BELLY, 0.5, -0.82, 0);
	canopy(b, 4.4, 0.78, 1.4, 0.5, 0.5);
	wingPair(
		b,
		[
			[1.2, 0.9],
			[-0.6, 7.2],
			[-2.0, 7.2],
			[-1.8, 0.9]
		],
		0.35,
		0.26,
		FROG_GREEN,
		-0.04
	);
	for (const s of [1, -1]) {
		b.push()
			.translate(-1.8, -0.05, 1.15 * s)
			.cylinder(0.6, 0.55, 5.0, 14, FROG, { axis: 'x' })
			.pop();
		nozzle(b, -4.6, -0.05, 1.15 * s, 0.45);
	}
	wingPair(
		b,
		[
			[-5.2, 0.4],
			[-6.4, 2.6],
			[-7.2, 2.6],
			[-7.0, 0.4]
		],
		0.5,
		0.12,
		FROG_GREEN
	);
	fin(
		b,
		[
			[-3.8, 0.6],
			[-7.2, 0.6],
			[-7.6, 4.0],
			[-6.2, 4.0]
		],
		0,
		0.16,
		FROG_GREEN
	);
	navLights(b, -1.4, 0.35, 7.2);
	return b.build();
}

/** F-4E Phantom II: big nose, upturned outer wings, drooping tailplanes, two smoky J79s. */
export function f4(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.62, -8.8],
			[0.9, -6.8],
			[1.15, -2.0],
			[1.1, 2.5],
			[0.85, 5.6],
			[0.45, 8.0],
			[0.0, 9.0]
		],
		PHANTOM,
		0.95,
		1.05
	);
	b.push().translate(8.4, -0.1, 0).scale(1, 0.85, 0.85).sphere(0.62, 12, 8, RADOME).pop();
	canopy(b, 4.6, 0.72, 2.6, 0.55, 0.5);
	for (const s of [1, -1]) b.box(3.2, 0.9, 0.55, PHANTOM_TAN, 2.8, -0.1, 1.05 * s);
	wingPair(
		b,
		[
			[1.6, 0.9],
			[-2.0, 4.4],
			[-3.6, 4.4],
			[-3.4, 0.9]
		],
		-0.45,
		0.2,
		PHANTOM
	);
	for (const s of [1, -1]) {
		b.push()
			.translate(-2.6, -0.45, 4.4 * s)
			.rotateX(-0.21 * s);
		b.slab(
			s > 0
				? [
						[0.6, 0],
						[-0.4, 1.6],
						[-1.3, 1.6],
						[-1.0, 0]
					]
				: mirror([
						[0.6, 0],
						[-0.4, 1.6],
						[-1.3, 1.6],
						[-1.0, 0]
					]),
			0.16,
			PHANTOM_TAN
		);
		b.pop();
	}
	wingPair(
		b,
		[
			[-6.6, 0.4],
			[-8.0, 2.6],
			[-9.0, 2.6],
			[-8.6, 0.4]
		],
		0.6,
		0.12,
		PHANTOM,
		0.4
	);
	fin(
		b,
		[
			[-5.0, 0.7],
			[-8.8, 0.7],
			[-9.2, 3.6],
			[-7.8, 3.6]
		],
		0,
		0.16,
		PHANTOM_TAN
	);
	for (const s of [1, -1]) nozzle(b, -9.1, -0.15, 0.55 * s, 0.48);
	navLights(b, -3.3, -0.4, 6.0);
	return b.build();
}

/** B-1B Lancer: blended swing-wing bomber with four afterburning engines (scaled for the arena). */
export function b1(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.6, -14.0],
			[1.2, -11.0],
			[1.55, -5.0],
			[1.5, 3.0],
			[1.2, 8.0],
			[0.7, 12.0],
			[0.25, 14.2],
			[0.0, 14.6]
		],
		LANCER,
		0.9,
		1.0
	);
	canopy(b, 10.6, 0.75, 2.1, 0.5, 0.75);
	wingPair(
		b,
		[
			[4.5, 1.2],
			[-1.0, 6.0],
			[-3.0, 6.0],
			[-4.0, 1.2]
		],
		-0.1,
		0.4,
		LANCER_DARK
	);
	wingPair(
		b,
		[
			[-1.5, 5.6],
			[-8.5, 15.5],
			[-10.0, 15.5],
			[-4.0, 5.6]
		],
		-0.05,
		0.22,
		LANCER
	);
	for (const s of [1, -1]) {
		b.push()
			.translate(-6.0, -1.3, 2.4 * s)
			.scale(1, 0.75, 1)
			.cylinder(0.95, 0.85, 6.0, 14, LANCER_DARK, { axis: 'x' })
			.pop();
		for (const o of [-0.5, 0.5]) nozzle(b, -9.3, -1.3, 2.4 * s + o, 0.42);
	}
	fin(
		b,
		[
			[-8.5, 1.0],
			[-14.0, 1.0],
			[-14.6, 6.5],
			[-12.0, 6.5]
		],
		0,
		0.22,
		LANCER_DARK
	);
	wingPair(
		b,
		[
			[-12.0, 0.3],
			[-13.4, 4.6],
			[-14.6, 4.6],
			[-14.4, 0.3]
		],
		3.4,
		0.14,
		LANCER
	);
	navLights(b, -9.5, -0.05, 15.5);
	return b.build();
}
