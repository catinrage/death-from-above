import { MeshBuilder, type Material } from '../engine/mesh-builder';
import { P } from './palette';

function crossFins(b: MeshBuilder, x: number, len: number, span: number, m: Material): void {
	b.box(len, 0.025, span, m, x, 0, 0);
	b.box(len, span, 0.025, m, x, 0, 0);
}

/** General-purpose bomb, nose toward +X, ~2.1 m. */
export function bombGP(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.05],
			[0.1, -1.0],
			[0.17, -0.7],
			[0.18, 0.25],
			[0.14, 0.72],
			[0.06, 0.96],
			[0.0, 1.0]
		],
		10,
		P.bombOlive,
		{ axis: 'x' }
	);
	b.push().translate(0.5, 0, 0).cylinder(0.168, 0.155, 0.12, 10, P.bombYellow, { axis: 'x' }).pop();
	crossFins(b, -0.86, 0.42, 0.58, P.bombOlive);
	return b.build();
}

export function bombCluster(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.2],
			[0.16, -1.15],
			[0.26, -0.8],
			[0.27, 0.6],
			[0.2, 1.05],
			[0.0, 1.25]
		],
		12,
		P.bombGrey,
		{ axis: 'x' }
	);
	for (const x of [-0.3, 0.2])
		b.push().translate(x, 0, 0).cylinder(0.275, 0.275, 0.08, 12, P.bombYellow, { axis: 'x' }).pop();
	crossFins(b, -1.0, 0.5, 0.75, P.bombGrey);
	return b.build();
}

export function bombNapalm(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.15],
			[0.14, -1.05],
			[0.24, -0.7],
			[0.25, 0.5],
			[0.18, 0.95],
			[0.0, 1.1]
		],
		12,
		P.alu,
		{ axis: 'x' }
	);
	b.push().translate(-0.1, 0, 0).cylinder(0.255, 0.255, 0.1, 12, P.red, { axis: 'x' }).pop();
	return b.build();
}

export function bombPenetrator(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -1.6],
			[0.12, -1.55],
			[0.16, -1.2],
			[0.165, 0.9],
			[0.1, 1.45],
			[0.0, 1.75]
		],
		10,
		P.bombDark,
		{ axis: 'x' }
	);
	crossFins(b, -1.35, 0.4, 0.5, P.bombDark);
	b.push().translate(0.6, 0, 0).cylinder(0.17, 0.17, 0.1, 10, P.bombYellow, { axis: 'x' }).pop();
	return b.build();
}

export function bombGuided(): Float32Array {
	const b = new MeshBuilder();
	b.append(
		new MeshBuilder().lathe(
			[
				[0.0, -1.05],
				[0.1, -1.0],
				[0.17, -0.7],
				[0.18, 0.4],
				[0.15, 0.8],
				[0.0, 1.0]
			],
			10,
			P.bombGrey,
			{ axis: 'x' }
		)
	);
	crossFins(b, -0.86, 0.42, 0.62, P.bombGrey);
	crossFins(b, 0.55, 0.2, 0.42, P.bombGrey);
	b.push().translate(1.02, 0, 0).sphere(0.07, 8, 5, P.seeker).pop();
	return b.build();
}

export function bombThunder(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.0, -2.1],
			[0.3, -2.0],
			[0.52, -1.3],
			[0.56, 0.9],
			[0.42, 1.7],
			[0.0, 2.15]
		],
		16,
		P.bombGrey,
		{ axis: 'x' }
	);
	for (const x of [-0.9, -0.5, 0.6]) {
		b.push().translate(x, 0, 0).cylinder(0.565, 0.565, 0.16, 16, P.bombYellow, { axis: 'x' }).pop();
	}
	crossFins(b, -1.8, 0.8, 1.5, P.bombGrey);
	return b.build();
}

export function bomblet(): Float32Array {
	const b = new MeshBuilder();
	b.sphere(0.13, 8, 6, P.bombYellow);
	crossFins(b, -0.14, 0.12, 0.3, P.bombDark);
	return b.build();
}

export function missile(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.09, -1.5],
			[0.12, -1.45],
			[0.12, 1.1],
			[0.08, 1.4],
			[0.0, 1.55]
		],
		10,
		P.missileWhite,
		{ axis: 'x' }
	);
	b.push().translate(0.75, 0, 0).cylinder(0.125, 0.125, 0.15, 10, P.red, { axis: 'x' }).pop();
	crossFins(b, -1.25, 0.45, 0.62, P.missileWhite);
	crossFins(b, 0.3, 0.32, 0.42, P.missileWhite);
	b.push().translate(-1.56, 0, 0).cylinder(0.07, 0.09, 0.08, 8, P.nozzle, { axis: 'x' }).pop();
	return b.build();
}

export function rocket(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.06, -0.6],
			[0.07, 0.4],
			[0.0, 0.62]
		],
		8,
		P.bombGrey,
		{ axis: 'x' }
	);
	crossFins(b, -0.5, 0.18, 0.26, P.bombGrey);
	return b.build();
}

export function debrisChunk(seed: number, m: Material = P.debris): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(1.0, 0.7, 0.85).blob(0.5, 5, 4, m, 0.4, seed).pop();
	return b.build();
}

export function debrisPlate(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.2, 0.07, 0.8, P.debris);
	b.push().translate(0.6, 0, 0).rotateZ(0.6).box(0.5, 0.07, 0.8, P.debris, 0.25, 0, 0).pop();
	return b.build();
}

export function debrisBeam(): Float32Array {
	const b = new MeshBuilder();
	b.box(2.0, 0.18, 0.18, P.debris);
	return b.build();
}

/** Open cone along +Y from 0 to 1 used for searchlight beams. */
export function beamCone(): Float32Array {
	const b = new MeshBuilder();
	b.lathe(
		[
			[0.02, 0],
			[1.0, 1]
		],
		20,
		P.paint,
		{ axis: 'y', smooth: true }
	);
	return b.build();
}
