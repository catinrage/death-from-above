import { MeshBuilder, mat, type Material } from '../engine/mesh-builder';
import { P } from './palette';

const BALLAST = mat(0x6d665c, 0.97, 0);
const SLEEPER = mat(0x3d3127, 0.92, 0);
const RAIL = mat(0x8a8780, 0.35, 0.85);
const STEEL = mat(0x4b4f4a, 0.55, 0.6);
const RIVETED = mat(0x3a3d39, 0.6, 0.55);
const SOOT = mat(0x1f201e, 0.85, 0.2);

/** Rail gauge (centre to centre of the rails) and rail top above the formation; RAIL_TOP in game/rail.ts. */
const GAUGE = 1.44;
const TOP = 0.6;

function rails(b: MeshBuilder, len: number, y0: number): void {
	for (const s of [-1, 1]) b.box(len, 0.16, 0.1, RAIL, 0, y0 + TOP - 0.08, (GAUGE / 2) * s);
}

function sleepers(b: MeshBuilder, len: number, y0: number): void {
	for (let x = -len / 2 + 0.35; x < len / 2; x += 0.7)
		b.box(0.26, 0.16, 2.5, SLEEPER, x, y0 + 0.36, 0);
}

/** A 4 m length of plain track: ballast shoulder, sleepers, two rails. Origin on the formation. */
export function railTrack(len = 4): Float32Array {
	const b = new MeshBuilder();
	const h = 0.3;
	b.hexahedron(
		[
			[-len / 2, -0.25, -2.4],
			[len / 2, -0.25, -2.4],
			[len / 2, -0.25, 2.4],
			[-len / 2, -0.25, 2.4],
			[-len / 2, h, -1.6],
			[len / 2, h, -1.6],
			[len / 2, h, 1.6],
			[-len / 2, h, 1.6]
		],
		BALLAST
	);
	sleepers(b, len, 0);
	rails(b, len, 0);
	return b.build();
}

/** A twisted length of rail torn out by a bomb. */
export function railPiece(): Float32Array {
	const b = new MeshBuilder();
	b.push().rotateZ(0.18);
	b.box(1.7, 0.16, 0.1, RAIL, -0.8, 0, 0);
	b.pop();
	b.push().rotateZ(-0.25);
	b.box(1.6, 0.16, 0.1, RAIL, 0.75, 0.05, 0);
	b.pop();
	return b.build();
}

/** Flanged rail wheel, axle along Z, centred on the origin. */
export function railWheel(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0, -0.07).cylinder(0.45, 0.45, 0.14, 12, STEEL, { axis: 'z' }).pop();
	b.push().translate(0, 0, -0.11).cylinder(0.52, 0.52, 0.04, 12, STEEL, { axis: 'z' }).pop();
	b.box(0.9, 0.1, 0.06, P.red, 0, 0, 0.09);
	return b.build();
}

/** Underframe and buffers shared by every car. Origin on the rail top at the car's centre. */
function underframe(b: MeshBuilder, len: number, m: Material): void {
	b.box(len - 0.6, 0.45, 2.7, RIVETED, 0, 1.12, 0);
	// Armoured skirts hang over the wheels, leaving the bottom of them showing.
	for (const s of [-1, 1]) b.box(len - 1.4, 0.55, 0.1, m, 0, 0.95, 1.42 * s);
	for (const e of [-1, 1]) {
		b.box(0.3, 0.3, 2.4, RIVETED, e * (len / 2 - 0.2), 1.05, 0);
		for (const s of [-1, 1]) {
			b.push()
				.translate(e * (len / 2 - 0.05), 1.05, 0.85 * s)
				.cylinder(0.18, 0.18, 0.45, 8, STEEL, { axis: 'x' });
			b.pop();
		}
	}
}

/** Riveted plate armour with sloped faces, along X and centred on z = 0. */
function armouredHull(b: MeshBuilder, len: number, y0: number, h: number, m: Material): void {
	const l = len / 2;
	b.extrude(
		[
			[-l, y0],
			[l, y0],
			[l, y0 + h * 0.75],
			[l - 0.5, y0 + h],
			[-l + 0.5, y0 + h],
			[-l, y0 + h * 0.75]
		],
		3.0,
		m,
		0.12
	);
	// Plate seams.
	for (let x = -l + 1.6; x < l - 0.5; x += 2.2)
		b.box(0.08, h * 0.7, 3.04, P.armyDark, x, y0 + h * 0.42, 0);
}

/** Armoured locomotive: long sloped engine casing, raised cab at the back, gun ports. */
export function locoBody(): Float32Array {
	const b = new MeshBuilder();
	underframe(b, 12.4, P.armyDark);
	armouredHull(b, 12.4, 1.35, 1.9, P.army);
	// Engine casing tapering toward the nose, cab behind it.
	b.push().translate(1.0, 3.25, 0);
	b.taper(7.6, 2.4, 6.6, 1.7, 0.75, P.armyLight);
	b.pop();
	b.box(3.4, 1.4, 2.9, P.army, -3.9, 3.95, 0);
	b.push().translate(-3.9, 4.65, 0);
	b.taper(3.5, 3.0, 3.0, 2.4, 0.25, P.armyDark);
	b.pop();
	for (const s of [-1, 1]) {
		b.box(1.4, 0.22, 0.04, P.slit, -3.9, 4.15, 1.46 * s);
		for (const x of [-1.8, 0.6, 3.0]) b.box(0.5, 0.16, 0.04, P.slit, x, 2.65, 1.51 * s);
	}
	b.box(0.05, 0.22, 2.0, P.slit, -2.18, 4.15, 0);
	// Stubby armoured exhaust and the headlamp.
	b.push().translate(3.4, 4.0, 0).cylinder(0.32, 0.28, 0.55, 8, SOOT);
	b.pop();
	b.box(0.25, 0.3, 0.3, P.lamp, 6.25, 2.6, 0);
	b.box(0.6, 0.12, 2.6, P.red, 5.9, 1.55, 0);
	return b.build();
}

/** Armoured flat wagon carrying a turret (gun or flak). Turret ring at y = 2.85. */
export function wagonBody(): Float32Array {
	const b = new MeshBuilder();
	underframe(b, 10.4, P.armyDark);
	armouredHull(b, 10.4, 1.35, 1.5, P.army);
	b.push().translate(0.3, 2.85, 0).cylinder(1.35, 1.35, 0.1, 14, P.armyDark);
	b.pop();
	for (const s of [-1, 1])
		for (const x of [-3.6, 3.6]) b.box(0.5, 0.16, 0.04, P.slit, x, 2.3, 1.51 * s);
	return b.build();
}

/** Closed supply wagon with sliding doors and a curved roof. */
export function boxcarBody(): Float32Array {
	const b = new MeshBuilder();
	underframe(b, 10.4, P.armyDark);
	b.box(10.2, 2.6, 2.9, P.wood, 0, 2.65, 0);
	for (let x = -4.6; x <= 4.7; x += 0.92) b.box(0.08, 2.6, 2.96, P.armyDark, x, 2.65, 0);
	b.push().translate(0, 3.95, 0);
	b.taper(10.3, 3.0, 10.0, 1.8, 0.4, P.roofGrey);
	b.pop();
	for (const s of [-1, 1]) {
		b.box(2.2, 2.2, 0.08, P.armyLight, 0, 2.55, 1.49 * s);
		b.box(2.6, 0.12, 0.12, RIVETED, 0, 3.7, 1.52 * s);
		b.box(1.6, 0.5, 0.04, P.canvas, 3.2, 3.2, 1.5 * s);
	}
	return b.build();
}

/** One 30 m deck-girder span of the rail viaduct. Origin on the formation at its centre. */
export function railSpan(len = 30): Float32Array {
	const b = new MeshBuilder();
	b.box(len, 0.5, 5.0, P.concreteDark, 0, -0.25, 0);
	railDeck(b, len, 0);
	return b.build();
}

/** Girders, bracing, walkway, ballast and track; `y0` is the formation. */
function railDeck(b: MeshBuilder, len: number, y0: number): void {
	for (const s of [-1, 1]) {
		// Deep plate girders under each rail, stiffened every couple of metres.
		b.box(len, 2.1, 0.28, STEEL, 0, y0 - 1.55, 1.25 * s);
		b.box(len, 0.16, 0.9, STEEL, 0, y0 - 2.55, 1.25 * s);
		for (let x = -len / 2 + 1; x < len / 2; x += 2)
			b.box(0.12, 2.0, 0.5, RIVETED, x, y0 - 1.55, 1.25 * s);
		// Walkway handrail.
		b.box(len, 0.07, 0.07, STEEL, 0, y0 + 1.2, 2.35 * s);
		for (let x = -len / 2 + 1; x < len / 2; x += 3)
			b.box(0.07, 1.2, 0.07, STEEL, x, y0 + 0.6, 2.35 * s);
	}
	for (let x = -len / 2 + 2.5; x < len / 2; x += 5) b.box(0.18, 1.6, 2.4, RIVETED, x, y0 - 1.5, 0);
	b.box(len, 0.3, 3.2, BALLAST, 0, y0 + 0.15, 0);
	sleepers(b, len, y0);
	rails(b, len, y0);
}

/** Tall concrete pier from the girders down into the riverbed. Origin at its top. */
export function railPier(): Float32Array {
	const b = new MeshBuilder();
	b.box(3.6, 1.0, 5.6, P.concrete, 0, -0.5, 0);
	b.push().translate(0, -34, 0);
	b.taper(4.2, 6.0, 2.8, 4.4, 33, P.concrete);
	b.pop();
	for (const s of [-1, 1]) {
		b.push()
			.translate(0, -34, 2.9 * s)
			.rotateY(Math.PI / 4);
		b.box(2.4, 14, 2.4, P.concreteDark, 0, 7, 0);
		b.pop();
	}
	return b.build();
}

/** Abutment the embankment runs onto. Origin on the formation. */
export function railAbutment(): Float32Array {
	const b = new MeshBuilder();
	b.box(6, 24, 6.4, P.concrete, 0, -12.2, 0);
	for (const s of [-1, 1]) b.box(10, 1.0, 0.6, P.concreteDark, 0, -0.1, 3.0 * s);
	return b.build();
}

/** Half a viaduct span, for wreckage. Centred on its own middle. */
export function railDeckHalf(): Float32Array {
	const b = new MeshBuilder();
	railDeck(b, 15, 1.3);
	return b.build();
}

/** Buffer stop at the railhead. Origin on the formation. */
export function bufferStop(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.6, 1.4, 3.2, P.concrete, -0.8, 0.7, 0);
	b.box(0.4, 0.5, 2.8, P.red, 0.15, 1.3, 0);
	for (const s of [-1, 1]) {
		b.push()
			.translate(0.35, 1.3, 0.85 * s)
			.cylinder(0.2, 0.2, 0.5, 8, STEEL, { axis: 'x' });
		b.pop();
	}
	b.box(2.0, 0.16, 0.1, RAIL, 1.0, TOP - 0.08, GAUGE / 2);
	b.box(2.0, 0.16, 0.1, RAIL, 1.0, TOP - 0.08, -GAUGE / 2);
	return b.build();
}
