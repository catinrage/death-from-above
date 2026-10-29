import { MeshBuilder, mat, type Material, type P2 } from '../engine/mesh-builder';
import { body, canopy, fin, navLights, nozzle, wingPair } from './aircraft-real';
import { P } from './palette';

const RAPTOR = mat(0x7b8189, 0.42, 0.4);
const RAPTOR_DARK = mat(0x656b73, 0.46, 0.4);
const LIGHTNING = mat(0x5a6168, 0.4, 0.35);
const LIGHTNING_DARK = mat(0x484e55, 0.44, 0.35);
const FENCER = mat(0x8f979a, 0.6, 0.2);
const FENCER_DARK = mat(0x687174, 0.62, 0.2);
const FLANKER = mat(0xa6b6c3, 0.5, 0.25);
const FLANKER_DARK = mat(0x75899a, 0.52, 0.25);
/** Dielectric radomes: the Soviet jets wear them in a pale or dark grey. */
const RADOME_PALE = mat(0xc4c8c3, 0.55, 0.1);
const RADOME_DARK = mat(0x3a3f44, 0.5, 0.15);
/** Stealth coatings keep the nozzles dull rather than bare metal. */
const COATED_NOZZLE = mat(0x3b3f44, 0.55, 0.45);

/** A pair of fins canted outward by `cant`, at ±z. */
function canted(
	b: MeshBuilder,
	profile: readonly P2[],
	z: number,
	t: number,
	m: Material,
	cant: number
): void {
	for (const s of [1, -1]) fin(b, profile, z * s, t, m, cant * s);
}

/**
 * A pair of side intakes with dark mouths. `rake` pushes the bottom of the lip
 * forward of the top, as on the stealth jets' swept intakes.
 */
function intake(
	b: MeshBuilder,
	x: number,
	y: number,
	z: number,
	len: number,
	h: number,
	w: number,
	m: Material,
	rake = 0
): void {
	const x0 = x - len / 2,
		top = x + len / 2,
		bot = top + rake,
		y0 = y - h / 2,
		y1 = y + h / 2;
	for (const s of [1, -1]) {
		const z0 = z * s - w / 2,
			z1 = z * s + w / 2;
		b.hexahedron(
			[
				[x0, y0, z0],
				[bot, y0, z0],
				[bot, y0, z1],
				[x0, y0, z1],
				[x0, y1, z0],
				[top, y1, z0],
				[top, y1, z1],
				[x0, y1, z1]
			],
			m
		);
		const iy0 = y0 + h * 0.1,
			iy1 = y1 - h * 0.1,
			iz0 = z0 + w * 0.12,
			iz1 = z1 - w * 0.12,
			at = (yy: number): number => top + (rake * (y1 - yy)) / h + 0.03;
		b.hexahedron(
			[
				[at(iy0) - 0.12, iy0, iz0],
				[at(iy0), iy0, iz0],
				[at(iy0), iy0, iz1],
				[at(iy0) - 0.12, iy0, iz1],
				[at(iy1) - 0.12, iy1, iz0],
				[at(iy1), iy1, iz0],
				[at(iy1), iy1, iz1],
				[at(iy1) - 0.12, iy1, iz1]
			],
			P.slit
		);
	}
}

/** F-22A Raptor: diamond wings, flat body, square intakes, canted twin fins and 2D nozzles. */
export function f22(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.75, -8.0],
			[0.95, -6.0],
			[1.05, -2.0],
			[1.0, 2.0],
			[0.75, 4.6],
			[0.4, 6.9],
			[0.0, 8.6]
		],
		RAPTOR,
		0.72,
		1.3
	);
	// Raked, caret-like intakes either side of the cockpit.
	intake(b, 2.1, 0.0, 1.2, 3.4, 0.95, 0.7, RAPTOR, 0.7);
	canopy(b, 4.4, 0.52, 2.1, 0.48, 0.48);
	wingPair(
		b,
		[
			[1.6, 1.0],
			[-3.4, 6.7],
			[-4.4, 6.7],
			[-6.1, 1.0]
		],
		-0.05,
		0.16,
		RAPTOR
	);
	wingPair(
		b,
		[
			[-5.9, 1.1],
			[-7.7, 3.9],
			[-8.6, 3.9],
			[-8.8, 1.1]
		],
		-0.05,
		0.1,
		RAPTOR_DARK
	);
	canted(
		b,
		[
			[-4.4, 0.3],
			[-7.7, 0.3],
			[-7.5, 3.3],
			[-6.5, 3.3]
		],
		1.25,
		0.12,
		RAPTOR_DARK,
		0.45
	);
	// Two-dimensional thrust-vectoring nozzles: flat boxes, not cones.
	for (const s of [1, -1]) {
		b.box(1.1, 0.5, 0.9, COATED_NOZZLE, -8.4, 0, 0.55 * s);
		b.box(0.06, 0.34, 0.74, P.nozzleHot, -8.96, 0, 0.55 * s);
	}
	navLights(b, -4.3, -0.05, 6.7);
	return b.build();
}

/** F-35A Lightning II: a bulky single-engine body, trapezoid wings, canted fins, one round nozzle. */
export function f35(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.7, -7.0],
			[1.0, -5.6],
			[1.2, -2.0],
			[1.18, 1.5],
			[0.9, 4.0],
			[0.45, 6.4],
			[0.0, 7.8]
		],
		LIGHTNING,
		0.95,
		1.22
	);
	// The chunky diverterless intakes and the hump behind the canopy that hides the bay doors.
	intake(b, 2.0, 0.2, 1.15, 3.0, 0.85, 0.6, LIGHTNING, 0.5);
	b.push().translate(0.4, 0.72, 0).scale(4.0, 0.55, 0.8).sphere(1, 14, 8, LIGHTNING).pop();
	canopy(b, 3.8, 0.95, 1.8, 0.52, 0.5);
	wingPair(
		b,
		[
			[1.0, 1.1],
			[-3.0, 5.4],
			[-4.2, 5.4],
			[-4.6, 1.1]
		],
		-0.05,
		0.18,
		LIGHTNING
	);
	wingPair(
		b,
		[
			[-5.0, 1.0],
			[-6.6, 3.3],
			[-7.4, 3.3],
			[-7.5, 1.0]
		],
		0.05,
		0.1,
		LIGHTNING_DARK
	);
	canted(
		b,
		[
			[-4.0, 0.5],
			[-6.5, 0.5],
			[-6.9, 2.9],
			[-6.0, 2.9]
		],
		1.0,
		0.12,
		LIGHTNING_DARK,
		0.45
	);
	b.push().translate(-7.4, 0, 0).cylinder(0.55, 0.66, 0.8, 14, COATED_NOZZLE, { axis: 'x' }).pop();
	b.push().translate(-7.82, 0, 0).cylinder(0.45, 0.45, 0.04, 14, P.nozzleHot, { axis: 'x' }).pop();
	navLights(b, -4.1, -0.05, 5.4);
	return b.build();
}

/** Su-24M Fencer: shoulder swing wings, a wide side-by-side cockpit, twin engines and one tall fin. */
export function su24(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.6, -10.0],
			[0.95, -8.5],
			[1.2, -4.0],
			[1.25, 1.0],
			[1.18, 4.5],
			[0.95, 7.5],
			[0.55, 9.6],
			[0.0, 10.4]
		],
		FENCER,
		0.9,
		1.2
	);
	b.push().translate(9.7, -0.05, 0).scale(1.2, 0.62, 0.68).sphere(1, 14, 8, RADOME_PALE).pop();
	b.push().translate(11.2, 0, 0).cylinder(0.05, 0.05, 1.4, 6, P.gunMetal, { axis: 'x' }).pop();
	// Side by side seats: a short, broad canopy.
	canopy(b, 5.8, 0.92, 1.7, 0.5, 0.82);
	intake(b, 2.6, 0.0, 1.35, 3.6, 1.15, 0.8, FENCER);
	for (const s of [1, -1]) {
		b.push()
			.translate(-6.2, -0.15, 0.72 * s)
			.cylinder(0.68, 0.62, 7.4, 14, FENCER, { axis: 'x' })
			.pop();
		nozzle(b, -10.2, -0.15, 0.72 * s, 0.52);
	}
	// The fixed glove the outer panels pivot from, then the panels at mid sweep.
	wingPair(
		b,
		[
			[3.2, 1.1],
			[-1.2, 3.0],
			[-3.6, 3.0],
			[-3.6, 1.1]
		],
		0.88,
		0.3,
		FENCER_DARK
	);
	wingPair(
		b,
		[
			[-0.8, 2.8],
			[-5.6, 7.8],
			[-6.8, 7.8],
			[-4.2, 2.8]
		],
		0.86,
		0.18,
		FENCER,
		-0.03
	);
	wingPair(
		b,
		[
			[-7.3, 1.0],
			[-9.4, 4.3],
			[-10.4, 4.3],
			[-10.1, 1.0]
		],
		0.05,
		0.12,
		FENCER_DARK,
		-0.1
	);
	fin(
		b,
		[
			[-4.6, 0.9],
			[-9.4, 0.9],
			[-10.2, 5.2],
			[-8.5, 5.2]
		],
		0,
		0.18,
		FENCER_DARK
	);
	canted(
		b,
		[
			[-7.4, -0.5],
			[-9.0, -0.5],
			[-9.3, -1.4],
			[-8.5, -1.4]
		],
		0.65,
		0.08,
		FENCER_DARK,
		0.3
	);
	navLights(b, -6.7, 0.86, 7.8);
	return b.build();
}

/** Su-27 Flanker: long drooped nose, LERX-blended wings, podded twin engines and a sting between wide tails. */
export function su27(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.4, -11.2],
			[0.6, -9.0],
			[0.85, -5.0],
			[0.95, -1.0],
			[0.9, 2.5],
			[0.72, 5.0],
			[0.5, 7.8],
			[0.25, 9.8],
			[0.0, 10.6]
		],
		FLANKER,
		0.95,
		1.0
	);
	b.push().translate(9.6, -0.02, 0).scale(1.3, 0.42, 0.42).sphere(1, 14, 8, RADOME_DARK).pop();
	// The humped back that runs from behind the canopy down to the tail sting.
	b.push().translate(1.4, 0.5, 0).scale(5.8, 0.58, 0.8).sphere(1, 14, 8, FLANKER).pop();
	canopy(b, 5.7, 0.76, 2.0, 0.55, 0.48);
	// The IRST ball ahead of the windscreen.
	b.push().translate(7.4, 0.62, 0.15).sphere(0.16, 10, 6, P.canopy).pop();
	// LERX blending into the wings.
	wingPair(
		b,
		[
			[6.2, 0.6],
			[1.5, 2.1],
			[-1.0, 2.7],
			[-1.0, 0.6]
		],
		0.05,
		0.16,
		FLANKER
	);
	wingPair(
		b,
		[
			[0.0, 2.2],
			[-4.6, 7.4],
			[-6.0, 7.4],
			[-5.8, 2.2]
		],
		0.0,
		0.16,
		FLANKER
	);
	// Wingtip launch rails.
	for (const s of [1, -1]) b.box(2.6, 0.14, 0.14, FLANKER_DARK, -5.0, 0, 7.45 * s);
	// Engines in separate nacelles under the body, fed by square intakes beneath the LERX.
	for (const s of [1, -1]) {
		b.box(3.6, 1.0, 0.95, FLANKER_DARK, 1.9, -0.6, 1.15 * s);
		b.box(0.08, 0.8, 0.75, P.slit, 3.72, -0.6, 1.15 * s);
		b.push()
			.translate(-4.4, -0.5, 1.15 * s)
			.cylinder(0.68, 0.62, 8.8, 14, FLANKER, { axis: 'x' })
			.pop();
		nozzle(b, -9.2, -0.5, 1.15 * s, 0.56);
		// Tail booms outboard of the nacelles carry the fins and tailplanes.
		b.box(4.6, 0.3, 0.5, FLANKER, -6.8, -0.2, 2.1 * s);
	}
	canted(
		b,
		[
			[-5.0, -0.05],
			[-8.4, -0.05],
			[-9.4, 4.0],
			[-8.2, 4.0]
		],
		2.1,
		0.14,
		FLANKER_DARK,
		0.06
	);
	canted(
		b,
		[
			[-6.4, -0.3],
			[-8.0, -0.3],
			[-8.4, -1.3],
			[-7.6, -1.3]
		],
		2.0,
		0.08,
		FLANKER_DARK,
		0.2
	);
	wingPair(
		b,
		[
			[-7.6, 2.0],
			[-9.4, 5.0],
			[-10.4, 5.0],
			[-10.2, 2.0]
		],
		-0.25,
		0.1,
		FLANKER
	);
	navLights(b, -5.0, 0.05, 7.6);
	return b.build();
}
