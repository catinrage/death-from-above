import { MeshBuilder, mat } from '../engine/mesh-builder';
import { body, fin, wingPair } from './aircraft-real';
import { P } from './palette';

const FRAME = mat(0x2b2e31, 0.6, 0.3);
const MOTOR = mat(0x55595d, 0.4, 0.7);
const WARHEAD = mat(0x6b6f3a, 0.7, 0.1);
const DELTA = mat(0x9a9c98, 0.62, 0.2);
const DELTA_DARK = mat(0x6e716d, 0.66, 0.2);

/**
 * FPV attack quadcopter: an X frame with four motors and an anti-tank round
 * strapped under it. Drawn a little larger than life so it reads from the
 * commander's height. Nose along +x; the props are drawn as discs.
 */
export function fpvDrone(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.7, 0.22, 0.42, FRAME);
	for (const [sx, sz] of [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	]) {
		b.push().rotateY(Math.atan2(sz, sx)).box(1.0, 0.1, 0.12, FRAME, 0.5, 0, 0).pop();
		const x = sx * 0.72,
			z = sz * 0.72;
		b.push().translate(x, 0.05, z).cylinder(0.11, 0.11, 0.16, 8, MOTOR).pop();
		b.push().translate(x, 0.22, z).cylinder(0.42, 0.42, 0.02, 12, P.canopy).pop();
	}
	// The round slung underneath, nose forward, and the camera on top.
	b.push().translate(0, -0.28, 0);
	body(
		b,
		[
			[0.0, -0.55],
			[0.14, -0.5],
			[0.14, 0.25],
			[0.06, 0.6],
			[0.0, 0.65]
		],
		WARHEAD
	);
	b.pop();
	b.push().translate(0.3, 0.16, 0).sphere(0.09, 8, 5, P.glass).pop();
	return b.build();
}

/**
 * Delta-wing one-way attack drone: a slim body with a big cranked delta, tip
 * fins and a pusher propeller hub at the tail. Nose along +x.
 */
export function deltaDrone(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.0, -1.9],
			[0.2, -1.8],
			[0.28, -1.0],
			[0.3, 0.8],
			[0.22, 1.5],
			[0.0, 1.8]
		],
		DELTA
	);
	wingPair(
		b,
		[
			[0.9, 0.2],
			[-1.6, 1.55],
			[-1.85, 1.55],
			[-1.75, 0.2]
		],
		0,
		0.08,
		DELTA
	);
	for (const z of [1.5, -1.5])
		fin(
			b,
			[
				[-1.85, -0.25],
				[-1.55, -0.25],
				[-1.7, 0.45],
				[-1.95, 0.45]
			],
			z,
			0.05,
			DELTA_DARK
		);
	b.push().translate(-1.95, 0, 0).sphere(0.12, 8, 5, P.gunMetal).pop();
	b.box(0.05, 0.9, 0.12, P.gunMetal, -2.0, 0, 0);
	return b.build();
}
