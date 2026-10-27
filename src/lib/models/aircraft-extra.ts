import { MeshBuilder, mat } from '../engine/mesh-builder';
import { body, canopy, fin, mirror, navLights, wingPair } from './aircraft-real';
import { P } from './palette';

const GUNSHIP = mat(0x4b5157, 0.62, 0.3);
const GUNSHIP_DARK = mat(0x3a3f44, 0.66, 0.3);
const APACHE = mat(0x3f4636, 0.62, 0.2);
const APACHE_DARK = mat(0x30362a, 0.66, 0.2);
const DRONE = mat(0x8a9096, 0.5, 0.3);
const DRONE_DARK = mat(0x6c7277, 0.55, 0.3);
const STUKA = mat(0x56604a, 0.7, 0.15);
const STUKA_DARK = mat(0x3e4636, 0.72, 0.15);
const STUKA_BELLY = mat(0x8da3b4, 0.65, 0.1);
const SANDY = mat(0x5d6650, 0.66, 0.2);
const SANDY_DARK = mat(0x464d3c, 0.7, 0.2);
const SANDY_BELLY = mat(0xa7aaa0, 0.6, 0.2);
const BEAR = mat(0xb2b6b9, 0.34, 0.7);
const BEAR_DARK = mat(0x7f8488, 0.4, 0.6);

/** A propeller hub's spinner (the blades are drawn separately so they can spin). */
function spinner(b: MeshBuilder, x: number, y: number, z: number, r: number): void {
	b.push().translate(x, y, z).scale(1.3, 1, 1).sphere(r, 10, 6, P.gunMetal).pop();
}

/** AC-130H Spectre: a C-130 airframe with four turboprops and guns poking out of the port side. */
export function ac130(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.5, -15.5],
			[1.2, -13.0],
			[2.0, -8.0],
			[2.1, -2.0],
			[2.1, 6.0],
			[1.9, 10.0],
			[1.4, 12.5],
			[0.6, 14.0],
			[0.0, 14.4]
		],
		GUNSHIP,
		1.0,
		0.95
	);
	// Flight-deck windows and the black radome.
	b.box(1.2, 0.5, 2.6, P.canopy, 12.2, 1.0, 0);
	b.push().translate(14.1, -0.2, 0).scale(0.6, 0.8, 0.8).sphere(0.7, 10, 6, P.antiGlare).pop();
	// Undercarriage sponsons along the belly.
	for (const s of [1, -1]) b.box(6.5, 1.1, 0.8, GUNSHIP_DARK, 0.2, -1.6, 1.9 * s);
	// Sensor turret under the nose.
	b.push().translate(9.5, -2.0, 0).sphere(0.5, 10, 6, P.glass).pop();
	wingPair(
		b,
		[
			[2.4, 1.5],
			[1.4, 20.0],
			[-0.8, 20.0],
			[-1.6, 1.5]
		],
		1.9,
		0.42,
		GUNSHIP
	);
	for (const z of [5.6, 10.6, -5.6, -10.6]) {
		b.push()
			.translate(-2.6, 1.4, z)
			.cylinder(0.55, 0.78, 7.2, 12, GUNSHIP_DARK, { axis: 'x' })
			.pop();
		spinner(b, 4.9, 1.4, z, 0.42);
	}
	fin(
		b,
		[
			[-10.0, 1.4],
			[-15.2, 1.4],
			[-15.9, 8.4],
			[-13.6, 8.4]
		],
		0,
		0.3,
		GUNSHIP
	);
	wingPair(
		b,
		[
			[-12.5, 0.4],
			[-13.7, 7.0],
			[-15.4, 7.0],
			[-15.7, 0.4]
		],
		1.4,
		0.2,
		GUNSHIP
	);
	// Port-side battery: a 20 mm Vulcan forward, the 40 mm Bofors and the 105 mm howitzer aft.
	const guns: [number, number, number][] = [
		[3.0, 0.07, 1.0],
		[-1.5, 0.12, 1.6],
		[-6.0, 0.22, 2.4]
	];
	for (const [x, r, len] of guns) {
		b.push()
			.translate(x, -0.6, -1.9)
			.rotateX(Math.PI)
			.cylinder(r, r, len, 8, P.gunMetal, { axis: 'z' })
			.pop();
		b.box(1.0, 0.9, 0.2, GUNSHIP_DARK, x, -0.6, -2.0);
	}
	navLights(b, -0.5, 1.9, 20);
	return b.build();
}

/** AH-64D Apache Longbow: tandem cockpits, stub wings with rocket pods and a chin gun. */
export function apache(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.2, -2.6],
			[0.7, -2.2],
			[0.95, -0.8],
			[0.95, 1.2],
			[0.7, 2.6],
			[0.35, 3.5],
			[0.0, 3.7]
		],
		APACHE,
		1.1,
		0.7
	);
	canopy(b, 2.3, 0.5, 1.0, 0.55, 0.52);
	canopy(b, 0.9, 0.85, 1.1, 0.62, 0.56);
	for (const s of [1, -1]) {
		b.push()
			.translate(-1.6, 0.75, 0.85 * s)
			.cylinder(0.4, 0.34, 2.4, 10, APACHE_DARK, { axis: 'x' })
			.pop();
	}
	// Tail boom, fin, tailplane and tail wheel.
	b.push()
		.translate(-2.4, 0.35, 0)
		.rotateZ(Math.PI)
		.cylinder(0.42, 0.18, 6.0, 10, APACHE, { axis: 'x' })
		.pop();
	b.extrude(
		[
			[-7.6, 0.2],
			[-8.6, 0.2],
			[-9.0, 2.3],
			[-8.3, 2.3]
		],
		0.14,
		APACHE
	);
	b.box(1.0, 0.08, 2.6, APACHE, -8.2, 0.35, 0);
	b.box(0.08, 0.6, 0.08, P.gunMetal, -7.9, -0.15, 0);
	b.push().translate(-7.9, -0.45, -0.1).cylinder(0.18, 0.18, 0.2, 8, P.rubber, { axis: 'z' }).pop();
	// Mast and the Longbow radar dome above the rotor.
	b.push().translate(0, 0.9, 0).cylinder(0.16, 0.12, 1.15, 8, P.gunMetal).pop();
	b.push().translate(0, 2.25, 0).scale(1, 0.45, 1).sphere(0.5, 10, 6, APACHE_DARK).pop();
	// Stub wings with a rocket pod and a Hellfire rail on each.
	b.box(1.0, 0.12, 3.8, APACHE_DARK, -0.2, -0.05, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(-1.1, -0.45, 1.75 * s)
			.cylinder(0.27, 0.27, 1.8, 10, APACHE_DARK, { axis: 'x' })
			.pop();
		b.box(1.6, 0.12, 0.12, P.gunMetal, -0.2, -0.35, 1.2 * s);
		// Main wheels.
		b.box(0.1, 0.9, 0.1, P.gunMetal, 1.0, -0.9, 0.85 * s);
		b.push()
			.translate(1.0, -1.35, 0.85 * s - 0.1)
			.cylinder(0.28, 0.28, 0.2, 10, P.rubber, { axis: 'z' })
			.pop();
	}
	// Chin turret and its 30 mm chain gun.
	b.push().translate(2.4, -0.8, 0).sphere(0.28, 10, 6, P.gunMetal).pop();
	b.push().translate(2.4, -0.8, 0).cylinder(0.06, 0.06, 1.5, 6, P.gunMetal, { axis: 'x' }).pop();
	b.box(0.3, 0.12, 0.12, P.beacon, -2.0, 0.95, 0);
	return b.build();
}

/** MQ-9 Reaper: a slender drone with a satcom hump, long thin wings, a Y tail and a pusher prop. */
export function mq9(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.18, -5.2],
			[0.42, -4.4],
			[0.55, -1.5],
			[0.6, 2.5],
			[0.55, 3.8],
			[0.35, 4.8],
			[0.0, 5.2]
		],
		DRONE,
		1.05,
		0.9
	);
	b.push().translate(3.4, 0.3, 0).scale(1.6, 0.5, 0.55).sphere(1, 12, 8, DRONE).pop();
	// Sensor ball under the nose.
	b.box(0.2, 0.3, 0.2, DRONE_DARK, 2.6, -0.55, 0);
	b.push().translate(2.6, -0.8, 0).sphere(0.32, 10, 6, P.glass).pop();
	wingPair(
		b,
		[
			[0.9, 0.5],
			[0.5, 10.0],
			[-0.2, 10.0],
			[-0.4, 0.5]
		],
		0.2,
		0.14,
		DRONE,
		-0.03
	);
	wingPair(
		b,
		[
			[-3.6, 0.2],
			[-4.4, 2.6],
			[-5.0, 2.6],
			[-5.0, 0.2]
		],
		0.2,
		0.08,
		DRONE_DARK,
		-0.75
	);
	fin(
		b,
		[
			[-4.0, -0.2],
			[-5.0, -0.2],
			[-5.0, -1.1],
			[-4.6, -1.1]
		],
		0,
		0.08,
		DRONE_DARK
	);
	spinner(b, -5.25, 0, 0, 0.2);
	navLights(b, -0.2, 0.5, 10);
	return b.build();
}

/** Ju 87 B Stuka: inverted gull wings, spatted fixed gear with its sirens, a long greenhouse canopy. */
export function stuka(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.25, -6.0],
			[0.55, -4.5],
			[0.85, -1.5],
			[0.95, 1.5],
			[0.95, 3.6],
			[0.8, 5.0],
			[0.55, 5.5]
		],
		STUKA,
		1.1,
		0.85
	);
	b.box(4.5, 0.3, 1.2, STUKA_BELLY, 1.0, -0.85, 0);
	b.push().translate(5.4, 0, 0).cylinder(0.85, 0.8, 0.3, 12, P.paintYellow, { axis: 'x' }).pop();
	spinner(b, 5.75, 0, 0, 0.32);
	b.push().translate(1.4, 0.85, 0).scale(2.4, 0.55, 0.48).sphere(1, 14, 8, P.canopy).pop();
	// Inverted gull wing: the inner panels droop to the knee, the outer panels sweep back up.
	const knee = 0.35;
	wingPair(
		b,
		[
			[1.2, 0.6],
			[0.9, 3.2],
			[-1.0, 3.2],
			[-1.3, 0.6]
		],
		-0.5,
		0.3,
		STUKA,
		knee
	);
	const outer = [
		[0.9, 0.0],
		[0.3, 5.6],
		[-0.8, 5.6],
		[-1.0, 0.0]
	] as const;
	const kneeY = -0.5 - Math.sin(knee) * 3.2;
	const kneeZ = Math.cos(knee) * 3.2;
	for (const s of [1, -1]) {
		b.push()
			.translate(0, kneeY, kneeZ * s)
			.rotateX(-0.12 * s);
		b.slab(s > 0 ? outer : mirror(outer), 0.24, STUKA);
		b.pop();
		// Trousered gear leg, wheel spat and the wind-driven "Jericho trumpet" siren.
		b.box(0.5, 1.0, 0.25, STUKA_DARK, 0.5, kneeY - 0.5, kneeZ * s);
		b.push()
			.translate(0.4, kneeY - 1.1, kneeZ * s)
			.scale(0.75, 0.45, 0.25)
			.sphere(1, 10, 6, STUKA_DARK)
			.pop();
		b.push()
			.translate(0.95, kneeY - 0.45, kneeZ * s - 0.25 * s)
			.cylinder(0.12, 0.16, 0.35, 8, P.gunMetal, { axis: 'x' })
			.pop();
	}
	fin(
		b,
		[
			[-4.3, 0.5],
			[-6.2, 0.5],
			[-6.3, 2.6],
			[-5.2, 2.6]
		],
		0,
		0.14,
		STUKA_DARK
	);
	wingPair(
		b,
		[
			[-4.8, 0.3],
			[-5.2, 2.9],
			[-6.2, 2.9],
			[-6.2, 0.3]
		],
		0.5,
		0.12,
		STUKA
	);
	navLights(b, -0.3, kneeY + Math.sin(0.12) * 5.6, kneeZ + 5.4);
	return b.build();
}

/** A-1H Skyraider: a big radial nose, a bubble canopy and a wing hung with pylons. */
export function a1(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.25, -6.5],
			[0.55, -5.0],
			[0.9, -2.0],
			[1.05, 1.5],
			[1.1, 3.6],
			[1.05, 4.6]
		],
		SANDY,
		1.05,
		0.95
	);
	b.box(5.0, 0.3, 1.2, SANDY_BELLY, 0.5, -0.95, 0);
	b.push().translate(4.6, 0, 0).cylinder(1.12, 1.0, 1.0, 16, SANDY_DARK, { axis: 'x' }).pop();
	spinner(b, 5.75, 0, 0, 0.42);
	canopy(b, 1.2, 0.95, 1.8, 0.6, 0.55);
	wingPair(
		b,
		[
			[1.6, 0.8],
			[0.9, 7.6],
			[-0.6, 7.6],
			[-1.4, 0.8]
		],
		-0.6,
		0.3,
		SANDY,
		-0.08
	);
	for (const s of [1, -1]) {
		for (const z of [2.4, 4.0, 5.4]) b.box(1.2, 0.3, 0.12, SANDY_DARK, -0.3, -0.85, z * s);
		for (const z of [3.2, 3.7])
			b.push()
				.translate(1.0, -0.5, z * s)
				.cylinder(0.06, 0.06, 0.8, 6, P.gunMetal, { axis: 'x' })
				.pop();
	}
	fin(
		b,
		[
			[-4.2, 0.6],
			[-6.6, 0.6],
			[-6.6, 3.4],
			[-5.4, 3.4]
		],
		0,
		0.16,
		SANDY_DARK
	);
	wingPair(
		b,
		[
			[-5.2, 0.3],
			[-5.8, 3.0],
			[-6.6, 3.0],
			[-6.6, 0.3]
		],
		0.3,
		0.12,
		SANDY
	);
	navLights(b, -0.6, 0, 7.6);
	return b.build();
}

/** Tu-95MS Bear: a slim fuselage, swept wings, four turboprops with contra-props and a tail turret. */
export function tu95(): Float32Array {
	const b = new MeshBuilder();
	body(
		b,
		[
			[0.4, -23.0],
			[0.9, -21.0],
			[1.5, -16.0],
			[1.6, -4.0],
			[1.6, 10.0],
			[1.4, 16.0],
			[1.0, 19.5],
			[0.55, 21.5],
			[0.0, 22.6]
		],
		BEAR,
		1.0,
		0.95
	);
	canopy(b, 17.2, 1.1, 2.2, 0.55, 0.9);
	b.push().translate(21.4, -0.25, 0).scale(1.2, 0.7, 0.7).sphere(0.6, 10, 6, P.glass).pop();
	// Refuelling probe over the nose.
	b.push().translate(19.0, 1.3, 0).cylinder(0.08, 0.06, 4.6, 6, BEAR_DARK, { axis: 'x' }).pop();
	const dihedral = 0.05;
	wingPair(
		b,
		[
			[4.0, 1.4],
			[-8.0, 25.0],
			[-11.0, 25.0],
			[-5.5, 1.4]
		],
		-0.4,
		0.45,
		BEAR,
		dihedral
	);
	for (const z of [7.0, 13.5]) {
		// Nacelle sits under the swept leading edge.
		const lead = 4.0 - (12.0 * (z - 1.4)) / 23.6;
		const y = -0.4 - Math.sin(dihedral) * z - 0.3;
		for (const s of [1, -1]) {
			b.push()
				.translate(lead - 6.0, y, z * s)
				.cylinder(0.6, 0.95, 9.0, 12, BEAR_DARK, { axis: 'x' })
				.pop();
			spinner(b, lead + 3.9, y, z * s, 0.45);
		}
	}
	fin(
		b,
		[
			[-15.0, 1.2],
			[-22.0, 1.2],
			[-23.8, 8.5],
			[-20.8, 8.5]
		],
		0,
		0.3,
		BEAR
	);
	wingPair(
		b,
		[
			[-17.5, 0.6],
			[-21.5, 8.5],
			[-23.2, 8.5],
			[-22.3, 0.6]
		],
		0.9,
		0.2,
		BEAR
	);
	// Tail turret with its twin 23 mm cannons.
	b.push().translate(-23.2, 0.15, 0).sphere(0.75, 10, 6, P.glass).pop();
	for (const s of [1, -1])
		b.push()
			.translate(-25.6, 0.1, 0.16 * s)
			.cylinder(0.07, 0.07, 1.8, 6, P.gunMetal, { axis: 'x' })
			.pop();
	b.box(8.0, 0.1, 1.6, BEAR_DARK, -2.0, -1.62, 0);
	navLights(b, -9.5, -0.4 - Math.sin(dihedral) * 25, 25);
	return b.build();
}
