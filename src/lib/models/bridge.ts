import { MeshBuilder, mat, type Material } from '../engine/mesh-builder';
import { P } from './palette';

const STEEL = mat(0x55605a, 0.5, 0.6);
const STEEL_DARK = mat(0x3c4440, 0.55, 0.55);
const ASPHALT = mat(0x2b2a2a, 0.88, 0);
const PAINT = mat(0xd8d0b0, 0.7, 0);

/** Truss height above the road; matches TRUSS_H in game/bridge.ts. */
const H = 6.4;
const HALF_Z = 4.8;

/** A straight steel member between two points in the x/y plane. */
function member(
	b: MeshBuilder,
	ax: number,
	ay: number,
	bx: number,
	by: number,
	z: number,
	t: number,
	m: Material
): void {
	const len = Math.hypot(bx - ax, by - ay);
	b.push()
		.translate((ax + bx) / 2, (ay + by) / 2, z)
		.rotateZ(Math.atan2(by - ay, bx - ax));
	b.box(len + t, t, t * 0.8, m);
	b.pop();
}

/** One Warren truss plane `len` long centred on x = 0, bottom chord at `y0`. */
function trussPlane(b: MeshBuilder, len: number, z: number, y0: number): void {
	const panels = Math.max(2, Math.round(len / 6));
	const p = len / panels;
	const x0 = -len / 2;
	member(b, x0, y0 + 0.25, -x0, y0 + 0.25, z, 0.5, STEEL_DARK);
	member(b, x0 + p / 2, y0 + H - 0.25, -x0 - p / 2, y0 + H - 0.25, z, 0.45, STEEL);
	for (let k = 0; k < panels; k++) {
		const bx = x0 + k * p,
			tx = bx + p / 2;
		member(b, bx, y0 + 0.3, tx, y0 + H - 0.3, z, 0.34, STEEL);
		member(b, tx, y0 + H - 0.3, bx + p, y0 + 0.3, z, 0.34, STEEL);
		member(b, tx, y0 + 0.3, tx, y0 + H - 0.3, z, 0.18, STEEL_DARK);
	}
}

function deck(b: MeshBuilder, len: number, y0: number): void {
	b.box(len, 0.7, HALF_Z * 2 + 0.4, P.concreteDark, 0, y0 - 0.35, 0);
	b.box(len, 0.05, 7.2, ASPHALT, 0, y0 + 0.02, 0);
	for (let x = -len / 2 + 2; x < len / 2; x += 4) b.box(1.8, 0.06, 0.16, PAINT, x, y0 + 0.05, 0);
	for (const s of [-1, 1]) {
		b.box(len, 0.55, 0.35, STEEL_DARK, 0, y0 - 0.95, 2.6 * s);
		b.box(len, 0.08, 0.08, STEEL, 0, y0 + 1.05, (HALF_Z - 0.55) * s);
		for (let x = -len / 2 + 1; x < len / 2; x += 2.5)
			b.box(0.08, 1.05, 0.08, STEEL, x, y0 + 0.52, (HALF_Z - 0.55) * s);
	}
}

/** One 30 m span: deck, twin trusses and portal bracing. Origin at the road surface centre. */
export function bridgeSpan(len = 30): Float32Array {
	const b = new MeshBuilder();
	deck(b, len, 0);
	for (const s of [-1, 1]) trussPlane(b, len, HALF_Z * s, 0);
	const panels = Math.max(2, Math.round(len / 6));
	for (let k = 0; k < panels; k++) {
		const x = -len / 2 + (k + 0.5) * (len / panels);
		b.box(0.3, 0.3, HALF_Z * 2, STEEL_DARK, x, H - 0.2, 0);
		if (k < panels - 1) member(b, x, H - 0.3, x + len / panels, H - 0.3, 0, 0.16, STEEL_DARK);
	}
	return b.build();
}

/** Concrete pier hanging from the deck down into the riverbed. Origin at its top. */
export function bridgePier(): Float32Array {
	const b = new MeshBuilder();
	b.box(4.4, 1.1, HALF_Z * 2 + 1.6, P.concrete, 0, -1.5, 0);
	b.box(3.2, 26, HALF_Z * 2 - 0.4, P.concrete, 0, -15, 0);
	// Pointed cutwaters facing the current.
	for (const s of [-1, 1]) {
		b.push()
			.translate(0, -15, (HALF_Z - 0.2) * s)
			.rotateY(Math.PI / 4);
		b.box(2.26, 26, 2.26, P.concreteDark);
		b.pop();
	}
	return b.build();
}

/** Abutment block the road runs onto. Origin at the road surface. */
export function bridgeAbutment(): Float32Array {
	const b = new MeshBuilder();
	b.box(5, 16, HALF_Z * 2 + 2.4, P.concrete, 0, -8.1, 0);
	for (const s of [-1, 1]) b.box(9, 1.2, 0.8, P.concreteDark, 0, 0.5, (HALF_Z + 0.8) * s);
	return b.build();
}

/** Half a deck, for wreckage. Centred on its own middle. */
export function bridgeDeckHalf(): Float32Array {
	const b = new MeshBuilder();
	deck(b, 15, 0.45);
	return b.build();
}

/** Half of one truss plane, for wreckage. Centred on its own middle. */
export function bridgeTrussHalf(): Float32Array {
	const b = new MeshBuilder();
	trussPlane(b, 15, 0, -H / 2);
	return b.build();
}

const PONTOON = mat(0x4c5538, 0.75, 0.15);
const TREAD = mat(0x3a3d3a, 0.6, 0.5);

/** One 5 m treadway section of the engineers' bridge. Origin at the road surface centre. */
export function pontoonSection(len = 5): Float32Array {
	const b = new MeshBuilder();
	for (const s of [-1, 1]) {
		b.box(len, 0.35, 1.6, TREAD, 0, -0.18, 1.7 * s);
		b.box(len, 0.45, 0.25, STEEL_DARK, 0, -0.55, 1.7 * s);
		// Rope rail on short stanchions.
		b.box(len, 0.06, 0.06, PAINT, 0, 0.95, 3.4 * s);
		for (const x of [-len / 2 + 0.3, 0, len / 2 - 0.3])
			b.box(0.08, 0.95, 0.08, STEEL, x, 0.48, 3.4 * s);
	}
	b.box(len, 0.12, 1.8, PONTOON, 0, -0.12, 0);
	for (let x = -len / 2 + 0.6; x < len / 2; x += 1.25)
		b.box(0.16, 0.2, 6.8, STEEL_DARK, x, -0.5, 0);
	return b.build();
}

/** Trestle legs, 1 m tall from y = 0 down to y = -1; scaled to the drop under a section. */
export function pontoonTrestle(): Float32Array {
	const b = new MeshBuilder();
	for (const s of [-1, 1]) b.box(0.3, 1, 0.3, STEEL_DARK, 0, -0.5, 2.4 * s);
	b.box(0.2, 0.08, 5, STEEL, 0, -0.35, 0);
	b.box(0.2, 0.08, 5, STEEL, 0, -0.8, 0);
	return b.build();
}

/** Floating pontoon boat lying across the current. Origin at the waterline. */
export function pontoonBoat(): Float32Array {
	const b = new MeshBuilder();
	b.box(3.2, 1.1, 8.6, PONTOON, 0, 0.15, 0);
	b.box(2.6, 0.06, 8.0, STEEL_DARK, 0, 0.72, 0);
	for (const s of [-1, 1]) {
		b.push()
			.translate(0, 0.15, 4.3 * s)
			.rotateX(0.5 * s);
		b.box(3.2, 0.9, 0.8, PONTOON);
		b.pop();
	}
	return b.build();
}
