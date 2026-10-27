import { MeshBuilder, type P2 } from '../engine/mesh-builder';
import { P } from './palette';

/** Mirrors an XZ planform across the fuselage centreline. */
const mirror = (pts: readonly P2[]): P2[] => pts.map(([x, z]) => [x, -z] as P2);

function wings(b: MeshBuilder, planform: readonly P2[], y: number, t: number, m = P.kestrel): void {
	b.push().translate(0, y, 0);
	b.slab(planform, t, m).slab(mirror(planform), t, m);
	b.pop();
}

function navLights(b: MeshBuilder, x: number, y: number, z: number): void {
	b.box(0.22, 0.09, 0.12, P.navGreen, x, y, z);
	b.box(0.22, 0.09, 0.12, P.navRed, x, y, -z);
}

/** Balanced single-engine fighter-bomber. ~12.6 m long, nose toward +X. */
export function kestrel(): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(1, 0.92, 1);
	b.lathe(
		[
			[0.44, -6.0],
			[0.64, -5.0],
			[0.82, -3.0],
			[0.9, -0.5],
			[0.86, 1.6],
			[0.68, 3.4],
			[0.42, 4.9],
			[0.13, 6.0],
			[0.0, 6.35]
		],
		16,
		P.kestrel,
		{ axis: 'x' }
	);
	b.pop();
	b.push().translate(-6.5, 0, 0).cylinder(0.44, 0.5, 0.65, 14, P.nozzle, { axis: 'x' }).pop();
	b.push().translate(-6.45, 0, 0).cylinder(0.37, 0.37, 0.04, 12, P.nozzleHot, { axis: 'x' }).pop();
	b.push().translate(2.5, 0.66, 0).scale(1.7, 0.56, 0.5).sphere(1, 14, 8, P.canopy).pop();
	b.push().translate(-0.9, 0.55, 0).taper(4.4, 0.62, 3.6, 0.3, 0.32, P.kestrel).pop();
	b.box(2.3, 0.56, 2.08, P.kestrelDark, 0.9, -0.12, 0);
	b.box(0.06, 0.44, 1.96, P.antiGlare, 2.06, -0.12, 0);
	wings(
		b,
		[
			[1.8, 0.6],
			[-1.5, 4.9],
			[-2.7, 4.9],
			[-2.3, 0.6]
		],
		-0.24,
		0.16
	);
	wings(
		b,
		[
			[-4.0, 0.4],
			[-5.2, 2.3],
			[-5.95, 2.3],
			[-5.7, 0.4]
		],
		0.12,
		0.1,
		P.kestrelDark
	);
	b.extrude(
		[
			[-3.7, 0.55],
			[-6.0, 0.55],
			[-6.3, 2.9],
			[-5.4, 2.9]
		],
		0.14,
		P.kestrelDark
	);
	b.extrude(
		[
			[-5.07, 2.45],
			[-6.24, 2.45],
			[-6.3, 2.9],
			[-5.4, 2.9]
		],
		0.18,
		P.accent
	);
	b.push().translate(6.2, -0.05, 0).cylinder(0.03, 0.02, 0.9, 5, P.gunMetal, { axis: 'x' }).pop();
	navLights(b, -2.1, -0.24, 4.95);
	b.box(0.12, 0.12, 0.12, P.navWhite, -6.3, 2.9, 0);
	return b.build();
}

/** Faceted stealth strike jet: fast, hard to lock, small payload. */
export function wraith(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[6.6, -0.05],
			[4.2, 0.42],
			[1.5, 0.78],
			[-2.5, 0.72],
			[-6.0, 0.35],
			[-6.4, 0.0],
			[-6.0, -0.35],
			[-1.5, -0.48],
			[3.5, -0.32]
		],
		1.9,
		P.wraith,
		0.55
	);
	b.push().translate(3.0, 0.62, 0).scale(1.9, 0.42, 0.48).sphere(1, 6, 4, P.goldGlass, false).pop();
	wings(
		b,
		[
			[2.4, 0.7],
			[-3.4, 6.3],
			[-4.7, 6.3],
			[-4.9, 0.7]
		],
		-0.05,
		0.2,
		P.wraith
	);
	for (const s of [1, -1]) {
		b.push()
			.translate(0, 0.45, 0.55 * s)
			.rotateX(0.62 * s);
		b.extrude(
			[
				[-3.6, 0],
				[-5.6, 0],
				[-6.2, 2.3],
				[-5.2, 2.3]
			],
			0.12,
			P.wraithEdge
		);
		b.pop();
	}
	b.box(0.1, 0.16, 1.3, P.nozzleHot, -6.42, 0.0, 0);
	navLights(b, -4.2, -0.05, 6.35);
	return b.build();
}

/** Armoured ground-attack jet with a nose cannon and straight wings. */
export function grizzly(): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(1, 0.95, 1.05);
	b.lathe(
		[
			[0.55, -6.6],
			[0.8, -5.5],
			[1.05, -3.2],
			[1.12, -0.5],
			[1.06, 2.2],
			[0.86, 4.0],
			[0.55, 5.4],
			[0.28, 6.0]
		],
		16,
		P.grizzly,
		{ axis: 'x', caps: true }
	);
	b.pop();
	b.push().translate(5.9, -0.25, 0).cylinder(0.24, 0.22, 0.6, 10, P.gunMetal, { axis: 'x' });
	b.translate(0.55, 0, 0).cylinder(0.1, 0.09, 1.5, 8, P.gunMetal, { axis: 'x' }).pop();
	b.push().translate(3.2, 0.85, 0).scale(1.5, 0.6, 0.55).sphere(1, 14, 8, P.canopy).pop();
	b.push().translate(-1.2, -0.95, 0).scale(5.5, 0.35, 0.9).sphere(1, 10, 6, P.grizzlyBelly).pop();
	wings(
		b,
		[
			[1.3, 1.0],
			[0.7, 7.4],
			[-1.3, 7.4],
			[-1.9, 1.0]
		],
		-0.45,
		0.28,
		P.grizzly
	);
	for (const s of [1, -1]) {
		b.push().translate(-4.7, 0.62, 1.3 * s);
		b.cylinder(0.62, 0.62, 3.1, 12, P.grizzlyBelly, { axis: 'x' });
		b.push().translate(3.1, 0, 0).cylinder(0.5, 0.5, 0.04, 10, P.antiGlare, { axis: 'x' }).pop();
		b.push().translate(-0.25, 0, 0).cylinder(0.45, 0.55, 0.3, 10, P.nozzle, { axis: 'x' }).pop();
		b.push()
			.translate(-0.22, 0, 0)
			.cylinder(0.38, 0.38, 0.04, 10, P.nozzleHot, { axis: 'x' })
			.pop();
		b.pop();
	}
	wings(
		b,
		[
			[-4.6, 0.6],
			[-5.4, 3.0],
			[-6.6, 3.0],
			[-6.6, 0.6]
		],
		0.2,
		0.14,
		P.grizzly
	);
	b.extrude(
		[
			[-4.4, 0.7],
			[-6.5, 0.7],
			[-6.8, 3.2],
			[-5.9, 3.2]
		],
		0.16,
		P.grizzly
	);
	b.extrude(
		[
			[-5.6, 2.6],
			[-6.72, 2.6],
			[-6.8, 3.2],
			[-5.9, 3.2]
		],
		0.2,
		P.accent
	);
	navLights(b, -0.3, -0.45, 7.45);
	return b.build();
}

/** Four-engine turboprop heavy bomber. ~23 m long. */
export function albatross(): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(1, 1.05, 1);
	b.lathe(
		[
			[0.35, -11.4],
			[0.85, -10],
			[1.35, -6.5],
			[1.5, -1],
			[1.48, 4.5],
			[1.3, 7.8],
			[0.95, 9.8],
			[0.45, 11.0],
			[0.0, 11.3]
		],
		18,
		P.alu,
		{ axis: 'x', caps: true }
	);
	b.pop();
	b.push().translate(10.4, 0.0, 0).scale(1.0, 0.75, 0.75).sphere(1, 12, 8, P.canopy).pop();
	b.push().translate(8.0, 0.98, 0).scale(1.3, 0.45, 0.95).sphere(1, 10, 6, P.canopy).pop();
	b.push().translate(6.5, 1.2, 0).scale(2.4, 0.3, 0.9).sphere(1, 8, 4, P.antiGlare).pop();
	wings(
		b,
		[
			[1.8, 1.2],
			[0.6, 15.0],
			[-1.6, 15.0],
			[-2.6, 1.2]
		],
		0.85,
		0.42,
		P.alu
	);
	for (const z of [4.6, 9.0, -4.6, -9.0]) {
		b.push().translate(-2.4, 0.5, z);
		b.lathe(
			[
				[0.35, 0],
				[0.62, 0.6],
				[0.66, 3.4],
				[0.5, 4.8],
				[0.0, 5.3]
			],
			12,
			P.aluDark,
			{ axis: 'x', caps: true }
		);
		b.pop();
	}
	wings(
		b,
		[
			[-8.6, 0.6],
			[-9.5, 5.6],
			[-11.0, 5.6],
			[-11.2, 0.6]
		],
		0.6,
		0.2,
		P.alu
	);
	for (const z of [5.5, -5.5]) {
		b.push().translate(0, 0.6, z);
		b.extrude(
			[
				[-9.4, -0.9],
				[-11.2, -0.9],
				[-11.5, 3.4],
				[-10.5, 3.4]
			],
			0.22,
			P.alu
		);
		b.extrude(
			[
				[-10.3, 2.8],
				[-11.45, 2.8],
				[-11.5, 3.4],
				[-10.5, 3.4]
			],
			0.26,
			P.accent
		);
		b.pop();
	}
	b.push().translate(-11.5, 0.15, 0).scale(1, 0.85, 0.85).sphere(0.78, 10, 6, P.canopy).pop();
	b.box(6, 0.1, 1.5, P.antiGlare, 0.2, -1.52, 0);
	navLights(b, -0.5, 0.85, 15.05);
	return b.build();
}

/** Four-blade propeller spinning around X. Origin at the hub. */
export function propeller(radius = 2.1): Float32Array {
	const b = new MeshBuilder();
	for (let i = 0; i < 4; i++) {
		b.push().rotateX((i * Math.PI) / 2 + 0.3);
		b.box(0.07, radius - 0.25, 0.3, P.prop, 0, (radius - 0.25) / 2 + 0.2, 0);
		b.box(0.075, 0.25, 0.3, P.propTip, 0, radius - 0.1, 0);
		b.pop();
	}
	return b.build();
}

/** Enemy delta-wing interceptor. */
export function enemyFighter(): Float32Array {
	const b = new MeshBuilder();
	b.push().scale(1, 0.92, 1);
	b.lathe(
		[
			[0.36, -5.4],
			[0.56, -4.4],
			[0.72, -2.0],
			[0.74, 0.8],
			[0.56, 2.9],
			[0.3, 4.5],
			[0.0, 5.7]
		],
		14,
		P.enemyJet,
		{ axis: 'x' }
	);
	b.pop();
	b.push().translate(-5.85, 0, 0).cylinder(0.36, 0.42, 0.5, 12, P.nozzle, { axis: 'x' }).pop();
	b.push().translate(-5.8, 0, 0).cylinder(0.3, 0.3, 0.04, 10, P.nozzleHot, { axis: 'x' }).pop();
	b.push().translate(2.2, 0.6, 0).scale(1.5, 0.5, 0.45).sphere(1, 12, 8, P.canopy).pop();
	wings(
		b,
		[
			[1.4, 0.55],
			[-3.4, 4.3],
			[-4.5, 4.3],
			[-4.6, 0.55]
		],
		-0.1,
		0.14,
		P.enemyJet
	);
	wings(
		b,
		[
			[2.7, 0.5],
			[1.9, 1.5],
			[1.5, 1.5],
			[1.5, 0.5]
		],
		0.05,
		0.08,
		P.enemyJetDark
	);
	b.extrude(
		[
			[-2.8, 0.5],
			[-5.2, 0.5],
			[-5.6, 2.7],
			[-4.6, 2.7]
		],
		0.14,
		P.enemyTail
	);
	b.box(2.2, 0.5, 1.1, P.enemyJetDark, 0.6, -0.55, 0);
	b.box(0.06, 0.4, 1.0, P.antiGlare, 1.72, -0.55, 0);
	navLights(b, -4.0, -0.1, 4.35);
	return b.build();
}

export function helicopterBody(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 1.9, 0).scale(1, 1.05, 0.78);
	b.lathe(
		[
			[0.15, -2.2],
			[0.85, -1.8],
			[1.15, -0.4],
			[1.1, 1.2],
			[0.85, 2.4],
			[0.35, 3.3],
			[0.0, 3.5]
		],
		14,
		P.heli,
		{ axis: 'x', caps: true }
	);
	b.pop();
	b.push().translate(2.0, 2.25, 0).scale(1.25, 0.72, 0.7).sphere(1, 12, 8, P.canopy).pop();
	b.push()
		.translate(-1.9, 2.3, 0)
		.rotateZ(Math.PI)
		.cylinder(0.38, 0.16, 5.8, 10, P.heli, { axis: 'x' })
		.pop();
	b.extrude(
		[
			[-7.1, 2.1],
			[-7.9, 2.1],
			[-8.3, 3.6],
			[-7.7, 3.6]
		],
		0.12,
		P.heli
	);
	b.box(0.8, 0.08, 2.2, P.heli, -6.6, 2.3, 0);
	b.push().translate(-0.4, 2.85, 0).taper(2.6, 1.3, 1.8, 0.9, 0.55, P.armyDark).pop();
	b.push().translate(0, 3.35, 0).cylinder(0.14, 0.12, 0.45, 8, P.gunMetal).pop();
	b.box(0.9, 0.12, 3.6, P.heli, 0.1, 1.55, 0);
	for (const s of [1, -1]) {
		b.push()
			.translate(-0.6, 1.35, 1.65 * s)
			.cylinder(0.22, 0.22, 1.5, 8, P.armyDark, { axis: 'x' })
			.pop();
		b.push()
			.translate(-1.4, 0.15, 0.95 * s)
			.cylinder(0.05, 0.05, 3.6, 5, P.gunMetal, { axis: 'x' })
			.pop();
		b.box(0.08, 0.9, 0.08, P.gunMetal, -0.6, 0.6, 0.85 * s);
		b.box(0.08, 0.9, 0.08, P.gunMetal, 1.2, 0.6, 0.85 * s);
	}
	b.push().translate(2.9, 1.25, 0).cylinder(0.05, 0.05, 1.0, 5, P.gunMetal, { axis: 'x' }).pop();
	b.box(0.3, 0.12, 0.12, P.beacon, -2.0, 2.9, 0);
	return b.build();
}

export function helicopterRotor(): Float32Array {
	const b = new MeshBuilder();
	for (let i = 0; i < 4; i++) {
		b.push().rotateY((i * Math.PI) / 2);
		b.box(4.7, 0.06, 0.42, P.prop, 2.45, 0, 0);
		b.pop();
	}
	b.cylinder(0.3, 0.2, 0.25, 8, P.gunMetal);
	return b.build();
}

export function helicopterTailRotor(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.16, 1.6, 0.05, P.prop);
	b.box(1.6, 0.16, 0.05, P.prop);
	return b.build();
}
