import { MeshBuilder, type P2 } from '../engine/mesh-builder';
import { P } from './palette';

/** Generic road wheel, axle along Z, centred on the origin. */
export function wheel(radius = 0.5, width = 0.36): Float32Array {
	const b = new MeshBuilder();
	b.push()
		.translate(0, 0, -width / 2)
		.cylinder(radius, radius, width, 12, P.rubber, { axis: 'z' })
		.pop();
	b.push()
		.translate(0, 0, width / 2)
		.cylinder(radius * 0.55, radius * 0.45, 0.04, 8, P.hub, { axis: 'z' })
		.pop();
	b.push()
		.translate(0, 0, -width / 2 - 0.04)
		.cylinder(radius * 0.45, radius * 0.55, 0.04, 8, P.hub, { axis: 'z' })
		.pop();
	return b.build();
}

function trackRun(
	b: MeshBuilder,
	profile: readonly P2[],
	wheelXs: number[],
	wheelY: number,
	z: number
): void {
	for (const s of [1, -1]) {
		b.push().translate(0, 0, z * s);
		b.extrude(profile, 0.66, P.track);
		for (const x of wheelXs) {
			b.push().translate(x, wheelY, s > 0 ? 0.33 : -0.38);
			b.cylinder(0.4, 0.4, 0.05, 10, P.hub, { axis: 'z' });
			b.pop();
		}
		b.pop();
	}
}

export function tankHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.5, 0.55],
			[3.0, 0.55],
			[3.75, 1.15],
			[3.3, 1.65],
			[-3.3, 1.65],
			[-3.6, 1.2]
		],
		3.0,
		P.army
	);
	trackRun(
		b,
		[
			[-3.6, 0.12],
			[3.4, 0.12],
			[3.95, 0.62],
			[3.45, 1.05],
			[-3.6, 1.05],
			[-4.0, 0.6]
		],
		[-2.75, -1.65, -0.55, 0.55, 1.65, 2.75],
		0.5,
		1.6
	);
	for (const s of [1, -1]) b.box(7.0, 0.42, 0.08, P.armyLight, -0.1, 1.28, 1.97 * s);
	b.box(0.6, 0.35, 1.4, P.armyDark, -3.35, 1.55, 0);
	b.box(0.25, 0.25, 0.25, P.lamp, 3.45, 1.45, 1.2);
	b.box(0.25, 0.25, 0.25, P.lamp, 3.45, 1.45, -1.2);
	return b.build();
}

export function tankTurret(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-1.9, 0],
			[1.6, 0],
			[2.25, 0.35],
			[1.5, 0.95],
			[-1.6, 0.95],
			[-2.2, 0.5]
		],
		2.5,
		P.armyLight,
		0.28
	);
	b.push().translate(-0.6, 0.95, 0.5).cylinder(0.42, 0.38, 0.28, 10, P.armyLight).pop();
	b.push().translate(-0.6, 1.23, 0.5).cylinder(0.32, 0.32, 0.06, 10, P.armyDark).pop();
	b.box(0.9, 0.08, 0.08, P.gunMetal, -0.15, 1.38, 0.5);
	b.box(0.6, 0.55, 2.0, P.armyDark, -2.3, 0.45, 0);
	for (const s of [1, -1]) b.box(0.35, 0.18, 0.5, P.armyDark, 1.2, 0.78, 1.15 * s);
	b.box(0.9, 0.2, 2.56, P.red, -0.7, 0.5, 0);
	b.push().translate(-1.3, 0.95, -0.6).cylinder(0.03, 0.02, 2.2, 4, P.gunMetal).pop();
	return b.build();
}

export function tankBarrel(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.8, 0.62, 0.95, P.armyLight, 0.2, 0, 0);
	b.push().translate(0.5, 0, 0).cylinder(0.15, 0.13, 4.8, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(2.6, 0, 0).cylinder(0.21, 0.21, 0.7, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(5.1, 0, 0).cylinder(0.19, 0.19, 0.35, 8, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}

export function spaagHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.0, 0.5],
			[2.6, 0.5],
			[3.2, 1.05],
			[2.8, 1.5],
			[-2.9, 1.5],
			[-3.1, 1.1]
		],
		2.8,
		P.army
	);
	trackRun(
		b,
		[
			[-3.1, 0.12],
			[3.0, 0.12],
			[3.45, 0.58],
			[3.0, 0.98],
			[-3.1, 0.98],
			[-3.45, 0.56]
		],
		[-2.2, -1.1, 0, 1.1, 2.2],
		0.48,
		1.5
	);
	for (const s of [1, -1]) b.box(6.0, 0.38, 0.08, P.armyLight, 0, 1.18, 1.86 * s);
	return b.build();
}

export function spaagTurret(): Float32Array {
	const b = new MeshBuilder();
	b.taper(2.7, 2.5, 2.2, 2.1, 1.1, P.armyLight, -0.15);
	b.box(0.9, 0.25, 0.9, P.armyDark, -0.6, 1.2, 0.55);
	b.push().translate(-1.0, 1.1, -0.4).cylinder(0.1, 0.08, 0.7, 6, P.gunMetal).pop();
	b.box(0.7, 0.2, 2.54, P.red, -0.3, 0.6, 0);
	return b.build();
}

export function spaagGuns(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.9, 0.42, 1.4, P.armyDark, 0.2, 0, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(0.5, 0, 0.5 * s)
			.cylinder(0.08, 0.07, 3.0, 8, P.gunMetal, { axis: 'x' })
			.pop();
		b.push()
			.translate(3.3, 0, 0.5 * s)
			.cylinder(0.1, 0.1, 0.3, 8, P.gunMetal, { axis: 'x' })
			.pop();
	}
	return b.build();
}

/** Radar dish spinning around Y, mounted on top of AA vehicles and radar sites. */
export function radarDish(scale = 1): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(scale, scale, scale);
	b.cylinder(0.08, 0.08, 0.42, 6, P.gunMetal);
	b.push().translate(0, 0.5, 0).rotateZ(0.3);
	// Shallow parabolic reflector opening toward +X.
	b.lathe(
		[
			[0.02, -0.04],
			[0.26, -0.02],
			[0.5, 0.05],
			[0.68, 0.15],
			[0.76, 0.24]
		],
		14,
		P.steel,
		{ axis: 'x', smooth: false }
	);
	b.push().translate(0.0, 0, 0).cylinder(0.025, 0.02, 0.62, 5, P.gunMetal, { axis: 'x' }).pop();
	b.box(0.09, 0.09, 0.09, P.armyDark, 0.64, 0, 0);
	b.pop();
	b.pop();
	return b.build();
}

export function samChassis(): Float32Array {
	const b = new MeshBuilder();
	b.box(7.6, 0.35, 1.0, P.armyDark, -0.3, 0.8, 0);
	b.push().translate(2.65, 0.95, 0).taper(2.1, 2.6, 1.8, 2.4, 1.55, P.army, 0.1).pop();
	b.box(0.06, 0.55, 2.0, P.glass, 3.66, 2.05, 0);
	b.box(4.9, 0.35, 2.6, P.army, -1.1, 1.15, 0);
	for (const s of [1, -1]) {
		b.box(0.2, 1.0, 0.2, P.armyDark, -3.4, 0.7, 1.15 * s);
		b.box(0.6, 0.08, 0.6, P.armyDark, -3.4, 0.2, 1.15 * s);
	}
	b.box(0.25, 0.25, 0.25, P.lamp, 3.65, 1.25, 0.95);
	b.box(0.25, 0.25, 0.25, P.lamp, 3.65, 1.25, -0.95);
	return b.build();
}

/** Four-tube missile rack, pivots at its rear. */
export function samRack(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.5, 0.4, 2.3, P.armyDark, 0.2, 0.15, 0);
	for (const iy of [0, 1]) {
		for (const iz of [-0.5, 0.5]) {
			b.push().translate(0, 0.5 + iy * 0.62, iz);
			b.cylinder(0.28, 0.28, 5.2, 8, P.armyLight, { axis: 'x' });
			b.push().translate(5.2, 0, 0).cylinder(0.22, 0.22, 0.03, 8, P.armyDark, { axis: 'x' }).pop();
			b.pop();
		}
	}
	b.box(0.9, 0.12, 2.3, P.red, 4.2, 1.42, 0);
	return b.build();
}

export function truck(): Float32Array {
	const b = new MeshBuilder();
	b.box(6.6, 0.3, 1.0, P.armyDark, -0.3, 0.75, 0);
	b.push().translate(2.2, 0.9, 0).taper(1.9, 2.3, 1.6, 2.2, 1.45, P.army, -0.1).pop();
	b.box(1.1, 0.78, 1.9, P.army, 3.55, 1.28, 0);
	b.box(0.05, 0.5, 1.8, P.glass, 3.0, 1.98, 0);
	b.box(0.08, 0.5, 1.7, P.armyDark, 4.12, 1.2, 0);
	b.box(4.3, 0.18, 2.3, P.armyDark, -1.2, 1.08, 0);
	for (const s of [1, -1]) b.box(4.3, 0.5, 0.06, P.army, -1.2, 1.4, 1.13 * s);
	b.push().translate(-1.2, 1.17, 0).taper(4.3, 2.32, 3.9, 1.9, 1.55, P.canvas).pop();
	b.box(0.22, 0.22, 0.22, P.lamp, 4.12, 1.35, 0.75);
	b.box(0.22, 0.22, 0.22, P.lamp, 4.12, 1.35, -0.75);
	return b.build();
}

/** Bridging truck: cab, flatbed stacked with folded pontoon sections, and a loading crane. */
export function engineerTruck(): Float32Array {
	const b = new MeshBuilder();
	b.box(6.8, 0.3, 1.0, P.armyDark, -0.3, 0.75, 0);
	b.push().translate(2.3, 0.9, 0).taper(1.9, 2.3, 1.6, 2.2, 1.45, P.army, -0.1).pop();
	b.box(1.1, 0.78, 1.9, P.army, 3.65, 1.28, 0);
	b.box(0.05, 0.5, 1.8, P.glass, 3.1, 1.98, 0);
	b.box(0.08, 0.5, 1.7, P.armyDark, 4.22, 1.2, 0);
	b.box(4.6, 0.18, 2.4, P.armyDark, -1.3, 1.08, 0);
	// Folded sections, each a shallow pontoon box with a darker deck plate.
	for (let k = 0; k < 3; k++) {
		const y = 1.42 + k * 0.5;
		b.box(4.2 - k * 0.2, 0.42, 2.3, k % 2 ? P.armyLight : P.army, -1.4, y, 0);
		b.box(4.0 - k * 0.2, 0.05, 2.0, P.gunMetal, -1.4, y + 0.23, 0);
	}
	// Crane post behind the cab with its jib folded back over the load.
	b.box(0.3, 1.6, 0.3, P.armyDark, 1.1, 2.0, -0.85);
	b.push().translate(-0.4, 2.85, -0.85).rotateZ(-0.12);
	b.box(3.2, 0.2, 0.2, P.armyDark);
	b.pop();
	b.box(0.22, 0.22, 0.22, P.lamp, 4.22, 1.35, 0.75);
	b.box(0.22, 0.22, 0.22, P.lamp, 4.22, 1.35, -0.75);
	return b.build();
}

export function jeepBody(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-1.9, 0.45],
			[1.9, 0.45],
			[2.05, 0.95],
			[0.6, 1.08],
			[-1.9, 1.08]
		],
		1.75,
		P.armyLight
	);
	b.box(0.06, 0.55, 1.6, P.gunMetal, 0.55, 1.36, 0);
	for (const z of [0.42, -0.42]) {
		b.box(0.32, 0.5, 0.38, P.uniform, -0.05, 1.32, z);
		b.push().translate(-0.05, 1.7, z).sphere(0.13, 6, 4, P.skin, false).pop();
		b.push().translate(-0.05, 1.76, z).scale(1, 0.6, 1).sphere(0.17, 6, 3, P.helmet, false).pop();
	}
	b.push().translate(-1.2, 1.05, 0).cylinder(0.06, 0.06, 0.6, 6, P.gunMetal).pop();
	b.push().translate(-2.05, 0.95, 0).cylinder(0.36, 0.36, 0.2, 10, P.rubber, { axis: 'x' }).pop();
	b.box(0.2, 0.2, 0.2, P.lamp, 2.0, 0.9, 0.62);
	b.box(0.2, 0.2, 0.2, P.lamp, 2.0, 0.9, -0.62);
	return b.build();
}

/** Pintle machine gun with gunner shield; pivot at the mount. */
export function jeepGun(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.2, 0.12, 0.12, P.gunMetal, 0.4, 0.05, 0);
	b.box(0.3, 0.25, 0.25, P.armyDark, 0, 0, 0.18);
	b.box(0.05, 0.5, 0.7, P.armyLight, 0.15, 0.12, 0);
	return b.build();
}

export function apcHull(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.6, 0.65],
			[2.5, 0.65],
			[3.45, 1.35],
			[2.9, 2.15],
			[-3.5, 2.15],
			[-3.7, 1.4]
		],
		2.7,
		P.army,
		0.15
	);
	b.box(0.9, 0.25, 0.08, P.red, -1.6, 1.7, 1.37);
	b.box(0.9, 0.25, 0.08, P.red, -1.6, 1.7, -1.37);
	b.box(0.6, 0.8, 0.06, P.armyDark, -3.66, 1.4, 0);
	b.box(0.22, 0.22, 0.22, P.lamp, 3.2, 1.5, 0.9);
	b.box(0.22, 0.22, 0.22, P.lamp, 3.2, 1.5, -0.9);
	return b.build();
}

export function apcTurret(): Float32Array {
	const b = new MeshBuilder();
	b.taper(1.5, 1.5, 1.1, 1.05, 0.55, P.armyLight);
	return b.build();
}

export function apcGun(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.5, 0.3, 0.45, P.armyDark, 0.1, 0, 0);
	b.push().translate(0.3, 0, 0).cylinder(0.06, 0.05, 2.2, 6, P.gunMetal, { axis: 'x' }).pop();
	return b.build();
}

export function artilleryCarriage(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.3, 0.4, 1.6, P.army, 0, 0.8, 0);
	b.push().translate(0.55, 1.2, 0).rotateZ(-0.12).box(0.08, 1.25, 2.3, P.armyLight).pop();
	for (const s of [1, -1]) {
		b.push()
			.translate(-0.4, 0.62, 0.3 * s)
			.rotateY(0.22 * s)
			.rotateZ(0.17);
		b.box(3.5, 0.18, 0.2, P.armyDark, -1.75, 0, 0);
		b.pop();
	}
	b.box(0.12, 0.12, 2.3, P.gunMetal, 0, 0.6, 0);
	return b.build();
}

export function artilleryBarrel(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(-0.9, 0, 0).cylinder(0.2, 0.2, 1.8, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(0.2, 0, 0).cylinder(0.13, 0.11, 4.4, 10, P.armyLight, { axis: 'x' }).pop();
	b.box(0.35, 0.3, 0.42, P.gunMetal, 4.65, 0, 0);
	return b.build();
}
