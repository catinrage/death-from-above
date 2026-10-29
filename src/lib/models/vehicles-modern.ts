import { MeshBuilder } from '../engine/mesh-builder';
import { P } from './palette';
import { trackRun } from './vehicles';

/**
 * Infantry fighting vehicle in the Bradley / BMP mould: a tall tracked
 * hull with a sloped glacis and a rear troop door. Origin at the ground.
 */
export function ifvHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.2, 0.55],
			[2.3, 0.55],
			[3.3, 1.2],
			[2.4, 2.0],
			[-3.15, 2.0],
			[-3.3, 1.15]
		],
		2.9,
		P.army,
		0.12
	);
	trackRun(
		b,
		[
			[-3.3, 0.12],
			[2.8, 0.12],
			[3.35, 0.6],
			[2.95, 1.0],
			[-3.3, 1.0],
			[-3.6, 0.6]
		],
		[-2.5, -1.25, 0, 1.25, 2.5],
		0.48,
		1.5
	);
	// Side skirts, the troop door at the back and the driver's hatch.
	for (const s of [1, -1]) b.box(6.2, 0.45, 0.08, P.armyLight, -0.2, 1.2, 1.88 * s);
	b.box(0.08, 1.0, 1.2, P.armyDark, -3.3, 1.35, 0);
	b.box(0.6, 0.12, 0.6, P.armyDark, 1.6, 2.05, 0.7);
	b.box(0.22, 0.22, 0.22, P.lamp, 3.05, 1.3, 1.1);
	b.box(0.22, 0.22, 0.22, P.lamp, 3.05, 1.3, -1.1);
	return b.build();
}

/** Two-man turret with the boxy twin missile launcher on its side. */
export function ifvTurret(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-1.2, 0],
			[0.9, 0],
			[1.3, 0.35],
			[0.9, 0.7],
			[-1.2, 0.7]
		],
		1.7,
		P.armyLight,
		0.15
	);
	b.box(1.3, 0.55, 0.42, P.armyDark, -0.3, 0.55, 1.1);
	b.box(0.1, 0.36, 0.3, P.gunMetal, 0.36, 0.55, 1.1);
	b.push().translate(-0.6, 0.7, -0.45).cylinder(0.2, 0.2, 0.25, 8, P.armyLight).pop();
	return b.build();
}

/** The 25 mm chain gun: a slim barrel with a muzzle brake. */
export function ifvGun(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.45, 0.3, 0.4, P.armyDark, 0.1, 0, 0);
	b.push().translate(0.3, 0, 0).cylinder(0.07, 0.06, 2.3, 6, P.gunMetal, { axis: 'x' }).pop();
	b.push().translate(2.55, 0, 0).cylinder(0.1, 0.1, 0.25, 6, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}

/** Tank destroyer: a low, fast tracked hull built to carry one big gun. */
export function tankDestroyerHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.0, 0.5],
			[2.6, 0.5],
			[3.3, 0.95],
			[2.7, 1.3],
			[-2.9, 1.3],
			[-3.1, 0.95]
		],
		2.6,
		P.army,
		0.1
	);
	trackRun(
		b,
		[
			[-3.1, 0.12],
			[3.0, 0.12],
			[3.4, 0.5],
			[3.0, 0.88],
			[-3.1, 0.88],
			[-3.4, 0.5]
		],
		[-2.3, -1.15, 0, 1.15, 2.3],
		0.44,
		1.35
	);
	for (const s of [1, -1]) b.box(5.8, 0.25, 0.08, P.armyLight, 0, 1.05, 1.72 * s);
	// Stowage at the back, and the travel lock the barrel rests in on the march.
	b.box(0.9, 0.35, 2.0, P.canvas, -2.5, 1.45, 0);
	b.box(0.12, 0.55, 0.3, P.armyDark, 2.7, 1.55, 0);
	b.box(0.2, 0.2, 0.2, P.lamp, 3.1, 1.1, 1.0);
	b.box(0.2, 0.2, 0.2, P.lamp, 3.1, 1.1, -1.0);
	return b.build();
}

/** Low, wide, flat turret: a thin silhouette that hides well. */
export function tankDestroyerTurret(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-1.5, 0],
			[1.3, 0],
			[1.75, 0.28],
			[1.2, 0.55],
			[-1.4, 0.55],
			[-1.7, 0.3]
		],
		2.2,
		P.armyLight,
		0.18
	);
	b.push().translate(-0.5, 0.55, 0.5).cylinder(0.3, 0.28, 0.18, 10, P.armyLight).pop();
	b.box(0.5, 0.3, 1.6, P.armyDark, -1.65, 0.3, 0);
	return b.build();
}

/** The long high-velocity gun, with its fume extractor and muzzle brake. */
export function tankDestroyerBarrel(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.6, 0.45, 0.75, P.armyLight, 0.15, 0, 0);
	b.push().translate(0.45, 0, 0).cylinder(0.13, 0.11, 4.6, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(2.3, 0, 0).cylinder(0.19, 0.19, 0.6, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(5.05, 0, 0).cylinder(0.2, 0.2, 0.38, 10, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}
