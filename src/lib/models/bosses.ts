import { MeshBuilder, mat, type P2 } from '../engine/mesh-builder';
import { P } from './palette';

/** River navy greys: the cruiser is the only thing on the map painted for water. */
const NAVY = mat(0x5d666e, 0.6, 0.3);
const NAVY_LIGHT = mat(0x78828a, 0.55, 0.3);
const NAVY_DARK = mat(0x3c4349, 0.65, 0.3);
const BOOT = mat(0x6e2a24, 0.8, 0.1);

function tracks(
	b: MeshBuilder,
	profile: readonly P2[],
	wheelXs: number[],
	wheelY: number,
	zs: number[]
): void {
	for (const z of zs) {
		b.push().translate(0, 0, z);
		b.extrude(profile, 0.9, P.track);
		for (const x of wheelXs) {
			b.push().translate(x, wheelY, z > 0 ? 0.45 : -0.5);
			b.cylinder(0.62, 0.62, 0.05, 12, P.hub, { axis: 'z' });
			b.pop();
		}
		b.pop();
	}
}

/** Super-heavy tank hull: twice a battle tank's length on four track runs. */
export function superTankHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-7.2, 0.8],
			[6.3, 0.8],
			[7.5, 1.7],
			[6.8, 2.8],
			[-6.9, 2.8],
			[-7.4, 1.8]
		],
		5.4,
		P.army,
		0.2
	);
	const run: P2[] = [
		[-7.3, 0.15],
		[6.8, 0.15],
		[7.7, 0.95],
		[6.9, 1.6],
		[-7.3, 1.6],
		[-7.9, 0.9]
	];
	tracks(b, run, [-5.6, -3.8, -2.0, -0.2, 1.6, 3.4, 5.2], 0.78, [3.2, 2.15, -2.15, -3.2]);
	// Side skirts, glacis plates and the engine deck.
	for (const s of [1, -1]) {
		b.box(14.2, 0.9, 0.12, P.armyLight, -0.2, 1.95, 3.72 * s);
		b.box(1.6, 0.35, 0.5, P.armyDark, -5.5, 2.95, 1.9 * s);
		b.box(0.3, 0.3, 0.3, P.lamp, 7.15, 2.2, 2.0 * s);
	}
	b.box(3.6, 0.3, 4.2, P.armyDark, -5.0, 2.95, 0);
	for (let i = 0; i < 4; i++) b.box(0.18, 0.12, 3.8, P.gunMetal, -6.4 + i * 0.9, 3.15, 0);
	b.box(1.2, 0.25, 4.6, P.red, 4.8, 2.9, 0);
	b.box(0.9, 0.6, 0.9, P.armyDark, 5.2, 3.2, -1.6);
	b.push().translate(-7.2, 2.3, 1.7).cylinder(0.25, 0.25, 1.4, 8, P.gunMetal).pop();
	b.push().translate(-7.2, 2.3, -1.7).cylinder(0.25, 0.25, 1.4, 8, P.gunMetal).pop();
	return b.build();
}

/** Main turret, pivot at its base centre. */
export function superTankTurret(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.8, 0],
			[2.6, 0],
			[3.5, 0.6],
			[2.6, 1.75],
			[-3.3, 1.75],
			[-4.0, 0.9]
		],
		4.4,
		P.armyLight,
		0.3
	);
	b.push().translate(-1.4, 1.75, 1.2).cylinder(0.55, 0.5, 0.4, 10, P.armyLight).pop();
	b.push().translate(-1.4, 2.15, 1.2).cylinder(0.42, 0.42, 0.08, 10, P.armyDark).pop();
	b.push().translate(-0.6, 1.75, -1.3).cylinder(0.45, 0.4, 0.3, 10, P.armyDark).pop();
	b.box(1.0, 0.8, 3.4, P.armyDark, -4.1, 0.85, 0);
	b.box(1.4, 0.35, 4.46, P.red, -1.6, 0.9, 0);
	for (const s of [1, -1]) b.box(0.6, 0.3, 0.8, P.armyDark, 2.2, 1.4, 1.9 * s);
	b.push().translate(-2.6, 1.75, -1.6).cylinder(0.04, 0.03, 3.2, 4, P.gunMetal).pop();
	return b.build();
}

/** Long main gun with a muzzle brake; pivots at the mantlet. */
export function superTankBarrel(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.3, 1.1, 1.6, P.armyLight, 0.3, 0, 0);
	b.push().translate(0.8, 0, 0).cylinder(0.3, 0.24, 7.4, 12, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(3.6, 0, 0).cylinder(0.38, 0.38, 1.0, 12, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(8.0, 0, 0).cylinder(0.36, 0.36, 0.7, 10, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}

/** Rear anti-aircraft cupola: a squat drum the twin guns ride on. */
export function superTankAA(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(1.25, 1.05, 0.75, 10, P.armyLight);
	b.box(1.0, 0.5, 1.6, P.armyDark, 0.1, 0.95, 0);
	return b.build();
}

export function superTankAAGuns(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.7, 0.4, 1.0, P.armyDark, 0.1, 0, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(0.4, 0, 0.36 * s)
			.cylinder(0.07, 0.06, 2.6, 6, P.gunMetal, { axis: 'x' })
			.pop();
	}
	return b.build();
}

/**
 * River AA cruiser hull and superstructure, bow toward +X with the waterline
 * at y = 0. Short enough to lie across the channel; the mast clears the bridge.
 */
export function cruiserHull(): Float32Array {
	const b = new MeshBuilder();
	// Hull: a plan-view outline extruded and turned so its depth runs along Y.
	const plan: P2[] = [
		[-18.4, -3.5],
		[11.5, -4],
		[16.5, -2.6],
		[19.4, 0],
		[16.5, 2.6],
		[11.5, 4],
		[-18.4, 3.5],
		[-19, 0]
	];
	b.push()
		.translate(0, 0.8, 0)
		.rotateX(Math.PI / 2);
	b.extrude(plan, 4.4, NAVY);
	b.pop();
	// Boot-topping stripe at the waterline.
	b.push()
		.translate(0, 0.05, 0)
		.rotateX(Math.PI / 2);
	b.extrude(
		plan.map(([x, z]) => [x * 1.01, z * 1.03] as P2),
		0.45,
		BOOT
	);
	b.pop();
	b.push()
		.translate(0, 3.05, 0)
		.rotateX(Math.PI / 2);
	b.extrude(plan, 0.1, NAVY_DARK);
	b.pop();
	// Superstructure: bridge block, bridge windows, funnel and lattice mast.
	b.push().translate(2.6, 3, 0).taper(8, 5.4, 6.8, 4.8, 3.2, NAVY_LIGHT).pop();
	b.push().translate(4.0, 6.2, 0).taper(4.2, 4.4, 3.5, 3.9, 2.6, NAVY_LIGHT).pop();
	b.box(0.08, 0.6, 3.6, P.glass, 5.75, 7.8, 0);
	for (const s of [1, -1]) b.box(3.0, 0.6, 0.08, P.glass, 4.0, 7.8, 1.98 * s);
	b.box(3.8, 0.15, 5.6, NAVY_DARK, 4.0, 8.85, 0);
	b.push().translate(-3.0, 3, 0).taper(3.0, 2.6, 2.4, 2.1, 5.6, NAVY).pop();
	b.box(2.5, 0.4, 2.2, NAVY_DARK, -3.2, 8.7, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(-0.5, 3, 0.9 * s)
			.rotateX(-0.055 * s)
			.cylinder(0.14, 0.07, 15, 5, P.gunMetal)
			.pop();
	}
	for (let i = 0; i < 6; i++) b.box(0.08, 0.08, 2.0 - i * 0.22, P.gunMetal, -0.5, 4.8 + i * 2.2, 0);
	b.box(2.6, 0.1, 0.1, P.gunMetal, -0.5, 15.6, 0);
	b.box(0.25, 0.25, 0.25, P.beacon, -0.5, 18.2, 0);
	// Deck clutter: raised gun bandstands, rails, a stern ensign staff.
	b.push().translate(11.2, 3, 0).cylinder(2.0, 2.2, 0.5, 12, NAVY_LIGHT).pop();
	b.push().translate(-12, 3, 0).cylinder(2.0, 2.2, 0.5, 12, NAVY_LIGHT).pop();
	for (const s of [1, -1]) b.box(34, 0.5, 0.06, P.gunMetal, -1, 3.45, 3.65 * s);
	b.push().translate(-18.3, 3, 0).cylinder(0.05, 0.05, 3, 4, P.gunMetal).pop();
	b.box(0.05, 0.9, 1.4, P.red, -18.3, 5.4, 0.7);
	b.box(0.25, 0.25, 0.25, P.lamp, 19, 2.6, 0);
	return b.build();
}

/** Twin heavy flak mount, pivot at its base; the guns sit on top. */
export function cruiserTurret(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-2.0, 0],
			[1.5, 0],
			[2.0, 0.6],
			[1.4, 1.5],
			[-1.9, 1.5]
		],
		3.0,
		NAVY_LIGHT,
		0.2
	);
	b.box(0.6, 0.3, 3.04, P.red, -1.0, 0.75, 0);
	return b.build();
}

export function cruiserGuns(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.2, 0.9, 1.9, NAVY_DARK, 0.2, 0, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(0.6, 0, 0.55 * s)
			.cylinder(0.17, 0.14, 4.8, 8, NAVY_LIGHT, { axis: 'x' })
			.pop();
		b.push()
			.translate(5.0, 0, 0.55 * s)
			.cylinder(0.2, 0.2, 0.4, 8, P.gunMetal, { axis: 'x' })
			.pop();
	}
	return b.build();
}

/** Rotary close-in gun drum, pivot at its base. */
export function cruiserCiws(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(0.85, 0.75, 0.9, 10, NAVY_LIGHT);
	b.push()
		.translate(0, 0.9, 0)
		.lathe(
			[
				[0, 0],
				[0.72, 0],
				[0.7, 0.6],
				[0.45, 1.1],
				[0, 1.25]
			],
			10,
			mat(0xd2d4d0, 0.6, 0.2)
		);
	b.pop();
	return b.build();
}

export function cruiserCiwsGuns(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.6, 0.6, 0.6, NAVY_DARK, 0.2, 0, 0);
	b.push().translate(0.4, 0, 0).cylinder(0.22, 0.2, 2.2, 8, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}

/** Twin-arm SAM launcher on a turntable; the arms are fixed at launch elevation. */
export function cruiserSam(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(1.1, 1.0, 0.6, 10, NAVY_LIGHT);
	b.box(0.8, 1.4, 1.6, NAVY_DARK, 0, 1.2, 0);
	b.push().translate(0, 1.7, 0).rotateZ(0.65);
	for (const s of [1, -1]) {
		b.box(4.2, 0.18, 0.18, NAVY_DARK, 1.2, -0.25, 0.7 * s);
		b.push().translate(-0.6, 0.12, 0.7 * s);
		b.cylinder(0.26, 0.26, 4.6, 8, mat(0xdedcd4, 0.55, 0.1), { axis: 'x' });
		b.push().translate(4.6, 0, 0).cylinder(0.26, 0.02, 0.8, 8, P.red, { axis: 'x' }).pop();
		b.pop();
	}
	b.pop();
	return b.build();
}
