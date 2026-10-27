import { MeshBuilder, type Material, type P2 } from '../engine/mesh-builder';
import { Rng } from '../engine/rng';
import { P } from './palette';

function sandbagRing(b: MeshBuilder, radius: number, count: number, layers: number, gap = 0): void {
	for (let layer = 0; layer < layers; layer++) {
		for (let i = 0; i < count; i++) {
			const a = ((i + (layer % 2) * 0.5) / count) * Math.PI * 2;
			if (gap > 0 && Math.abs(Math.sin(a / 2)) < gap) continue;
			b.push()
				.translate(Math.cos(a) * radius, 0.2 + layer * 0.38, Math.sin(a) * radius)
				.rotateY(-a + Math.PI / 2);
			b.box(1.15, 0.38, 0.58, P.sandbag);
			b.pop();
		}
	}
}

export function bunker(): Float32Array {
	const b = new MeshBuilder();
	b.extrude(
		[
			[-3.4, 0],
			[3.4, 0],
			[2.7, 2.1],
			[-2.7, 2.1]
		],
		4.2,
		P.concrete,
		0.2
	);
	b.box(3.4, 0.34, 0.1, P.slit, 0, 1.35, 2.12);
	b.push().translate(2.95, 1.25, 0).rotateZ(-0.66).box(0.1, 0.32, 2.4, P.slit).pop();
	for (let i = 0; i < 7; i++) b.box(1.05, 0.38, 0.55, P.sandbag, -3.2 + i * 1.07, 0.19, 2.6);
	for (let i = 0; i < 6; i++) b.box(1.05, 0.38, 0.55, P.sandbag, -2.7 + i * 1.07, 0.57, 2.6);
	b.push().translate(-1.8, 2.1, -1.2).cylinder(0.04, 0.03, 2.8, 4, P.gunMetal).pop();
	return b.build();
}

export function flakBase(): Float32Array {
	const b = new MeshBuilder();
	sandbagRing(b, 3.5, 16, 2);
	b.cylinder(1.4, 1.5, 0.3, 10, P.concreteDark);
	b.push().translate(0, 0.3, 0).cylinder(0.45, 0.5, 0.9, 8, P.armyDark).pop();
	for (let i = 0; i < 3; i++) b.box(0.6, 0.4, 0.4, P.armyDark, -2.0 + i * 0.7, 0.2, -1.9);
	return b.build();
}

/** Rotating cradle and shield; origin on the pedestal. */
export function flakMount(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.6, 0.5, 1.3, P.armyLight, 0, 0.25, 0);
	for (const s of [1, -1]) b.box(1.3, 1.3, 0.1, P.army, 0.1, 0.9, 0.58 * s);
	b.push().translate(1.05, 0.95, 0).rotateZ(-0.15).box(0.1, 1.6, 2.4, P.armyLight).pop();
	b.box(0.7, 0.35, 0.35, P.armyDark, -0.6, 0.65, 0.85);
	return b.build();
}

export function flakBarrel(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(-1.0, 0, 0).cylinder(0.22, 0.22, 1.9, 10, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(0.9, 0, 0).cylinder(0.11, 0.095, 5.0, 10, P.gunMetal, { axis: 'x' }).pop();
	b.box(0.38, 0.24, 0.3, P.gunMetal, 6.0, 0, 0);
	return b.build();
}

export function searchlightBase(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(0.9, 1.0, 0.35, 8, P.armyDark);
	b.push().translate(0, 0.35, 0).cylinder(0.25, 0.3, 0.8, 8, P.gunMetal).pop();
	sandbagRing(b, 1.9, 9, 1);
	return b.build();
}

/** Lamp head; points along +X. */
export function searchlightLamp(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(-0.5, 0, 0).cylinder(0.5, 0.6, 1.0, 12, P.armyLight, { axis: 'x' }).pop();
	b.push().translate(0.5, 0, 0).cylinder(0.52, 0.52, 0.04, 12, P.lamp, { axis: 'x' }).pop();
	for (const s of [1, -1]) b.box(0.15, 0.9, 0.08, P.gunMetal, 0, -0.3, 0.68 * s);
	return b.build();
}

export function radarStation(): Float32Array {
	const b = new MeshBuilder();
	b.box(4.4, 2.5, 2.5, P.armyLight, -1.2, 1.25, 0);
	b.box(1.0, 1.9, 0.06, P.armyDark, -2.0, 1.0, 1.28);
	b.box(0.4, 0.3, 0.06, P.window, -0.3, 1.8, 1.28);
	b.push().translate(1.6, 0, 0).cylinder(0.22, 0.16, 5.2, 6, P.gunMetal).pop();
	for (const s of [1, -1]) {
		b.push()
			.translate(1.6, 0, 0.9 * s)
			.rotateX(-0.28 * s)
			.cylinder(0.05, 0.05, 4.6, 4, P.gunMetal)
			.pop();
	}
	b.box(1.6, 1.2, 1.4, P.armyDark, 3.2, 0.6, 0.6);
	b.box(0.25, 0.25, 0.25, P.beacon, -1.2, 2.62, 0.9);
	return b.build();
}

export function fuelDepot(): Float32Array {
	const b = new MeshBuilder();
	for (const x of [-5.4, 0, 5.4]) {
		b.push().translate(x, 0, 0);
		b.cylinder(2.3, 2.3, 4.6, 14, P.tankWhite, { smooth: true });
		b.push().translate(0, 4.6, 0).cylinder(2.3, 0.9, 0.7, 14, P.tankWhite, { smooth: true }).pop();
		b.push().translate(0, 1.5, 0).cylinder(2.33, 2.33, 0.5, 14, P.red, { smooth: true }).pop();
		b.push().translate(0, 0.05, 0).cylinder(2.34, 2.34, 0.35, 14, P.rust, { smooth: true }).pop();
		b.push().translate(1.5, 2.6, 2.0).rotateZ(0.9).box(4.6, 0.1, 0.5, P.steel).pop();
		b.pop();
	}
	b.push().translate(-8, 0.6, 2.6).cylinder(0.25, 0.25, 16, 8, P.steel, { axis: 'x' }).pop();
	b.box(1.6, 1.4, 1.4, P.armyDark, 8.6, 0.7, 1.2);
	return b.build();
}

/** House walls with dark windows; lit panes are a separate mesh. */
export function house(wall: Material, roof: Material, w = 6, d = 5, h = 3.2): Float32Array {
	const b = new MeshBuilder();
	b.box(w, h, d, wall, 0, h / 2, 0);
	const roofProfile: P2[] = [
		[-w / 2 - 0.4, h],
		[w / 2 + 0.4, h],
		[0, h + 2.1]
	];
	b.extrude(roofProfile, d + 0.6, roof);
	b.box(0.6, 1.5, 0.6, P.concreteDark, w * 0.25, h + 1.6, d * 0.2);
	b.box(1.0, 2.0, 0.08, P.wood, -w * 0.22, 1.0, d / 2 + 0.01);
	b.box(1.0, 0.9, 0.06, P.windowDark, w * 0.22, 1.9, d / 2 + 0.01);
	b.box(0.06, 0.9, 1.0, P.windowDark, w / 2 + 0.01, 1.9, 0);
	b.box(0.06, 0.9, 1.0, P.windowDark, -w / 2 - 0.01, 1.9, 0);
	return b.build();
}

export function houseLights(w = 6, d = 5): Float32Array {
	const b = new MeshBuilder();
	b.box(0.9, 0.8, 0.04, P.window, w * 0.22, 1.9, d / 2 + 0.045);
	b.box(0.04, 0.8, 0.9, P.window, w / 2 + 0.045, 1.9, 0);
	b.box(0.04, 0.8, 0.9, P.window, -w / 2 - 0.045, 1.9, 0);
	return b.build();
}

/** Field hospital: a long white ward with red crosses on the roof and the facade. */
export function hospital(): Float32Array {
	const b = new MeshBuilder();
	const w = 16,
		d = 9,
		h = 5;
	b.box(w, h, d, P.wallWhite, 0, h / 2, 0);
	b.box(w + 0.4, 0.35, d + 0.4, P.concreteDark, 0, h + 0.17, 0);
	// Roof cross, readable from the cockpit.
	b.box(5.2, 0.08, 1.5, P.red, 0, h + 0.39, 0);
	b.box(1.5, 0.08, 5.2, P.red, 0, h + 0.39, 0);
	// Facade cross above the door.
	b.box(2.4, 0.7, 0.06, P.red, 0, 3.6, d / 2 + 0.02);
	b.box(0.7, 2.4, 0.06, P.red, 0, 3.6, d / 2 + 0.02);
	b.box(1.8, 2.2, 0.08, P.wood, 0, 1.1, d / 2 + 0.01);
	for (const x of [-6, -3.6, 3.6, 6]) b.box(1.2, 1.0, 0.06, P.windowDark, x, 2.4, d / 2 + 0.01);
	for (const z of [-2, 2]) {
		b.box(0.06, 1.0, 1.2, P.windowDark, w / 2 + 0.01, 2.4, z);
		b.box(0.06, 1.0, 1.2, P.windowDark, -w / 2 - 0.01, 2.4, z);
	}
	return b.build();
}

export function hospitalLights(): Float32Array {
	const b = new MeshBuilder();
	for (const x of [-6, -3.6, 3.6, 6]) b.box(1.1, 0.9, 0.04, P.window, x, 2.4, 4.545);
	return b.build();
}

/** Roadside board marking the edge of a no-fire zone. */
export function noFireSign(): Float32Array {
	const b = new MeshBuilder();
	for (const x of [-1.1, 1.1]) b.box(0.12, 2.6, 0.12, P.wood, x, 1.3, 0);
	b.box(2.6, 1.6, 0.08, P.wallWhite, 0, 2.2, 0.08);
	b.box(2.6, 0.16, 0.1, P.red, 0, 2.92, 0.09);
	b.box(2.6, 0.16, 0.1, P.red, 0, 1.48, 0.09);
	b.box(0.16, 1.6, 0.1, P.red, -1.22, 2.2, 0.09);
	b.box(0.16, 1.6, 0.1, P.red, 1.22, 2.2, 0.09);
	b.push().translate(0, 2.2, 0.1).rotateZ(0.55).box(2.4, 0.18, 0.06, P.red).pop();
	return b.build();
}

export function ruin(): Float32Array {
	const b = new MeshBuilder();
	b.box(6, 1.6, 0.35, P.wall, 0, 0.8, -2.3);
	b.push().translate(-2.8, 0, 0).taper(0.35, 4.8, 0.35, 2.2, 2.4, P.wall, 0, -1.2).pop();
	b.push().translate(2.8, 0, 0.6).taper(0.35, 3.0, 0.35, 0.8, 1.2, P.wall, 0, 0.6).pop();
	b.box(2.0, 0.9, 0.35, P.wall, -1.6, 0.45, 2.3);
	for (let i = 0; i < 5; i++) {
		b.push()
			.translate(-1.5 + i * 0.8, 0.25, -0.5 + (i % 2) * 0.9)
			.scale(1.2, 0.5, 1)
			.blob(0.6, 6, 4, P.concreteDark, 0.35, i)
			.pop();
	}
	b.push().translate(0.5, 0.3, 0.2).rotateZ(0.4).box(3.2, 0.15, 0.25, P.wood).pop();
	return b.build();
}

export function runway(length: number, width: number): Float32Array {
	const b = new MeshBuilder();
	b.box(length, 0.12, width, P.asphalt, 0, 0.0, 0);
	for (let x = -length / 2 + 20; x < length / 2 - 18; x += 16)
		b.box(8, 0.03, 0.45, P.paint, x, 0.07, 0);
	for (const s of [1, -1]) b.box(length - 4, 0.03, 0.3, P.paint, 0, 0.07, (width / 2 - 1) * s);
	for (const end of [1, -1]) {
		for (let i = -4; i <= 4; i++) {
			if (i === 0) continue;
			b.box(6, 0.03, 0.8, P.paint, end * (length / 2 - 6), 0.07, i * 2.2);
		}
	}
	return b.build();
}

export function hangar(): Float32Array {
	const b = new MeshBuilder();
	const arch: P2[] = [];
	for (let i = 0; i <= 12; i++) {
		const a = (i / 12) * Math.PI;
		arch.push([Math.cos(a) * 10, Math.sin(a) * 7.5]);
	}
	b.extrude(arch, 22, P.hangar);
	b.box(13, 6.2, 0.12, P.slit, 0, 3.1, 11.02);
	b.box(13.6, 0.4, 0.2, P.steel, 0, 6.3, 11.05);
	b.box(1.2, 0.5, 0.1, P.accent, 7.2, 4.8, 11.05);
	return b.build();
}

export function hangarGlow(): Float32Array {
	const b = new MeshBuilder();
	b.box(12.4, 5.8, 0.05, P.window, 0, 3.0, 11.1);
	return b.build();
}

export function controlTower(): Float32Array {
	const b = new MeshBuilder();
	b.box(4, 9, 4, P.wallWhite, 0, 4.5, 0);
	b.box(4.06, 0.5, 4.06, P.accent, 0, 7.2, 0);
	b.push().translate(0, 9, 0).taper(5, 5, 5.8, 5.8, 2.3, P.windowDark).pop();
	b.box(6.2, 0.35, 6.2, P.roofGrey, 0, 11.45, 0);
	b.push().translate(1.6, 11.6, 1.6).cylinder(0.06, 0.04, 3.2, 4, P.gunMetal).pop();
	b.box(0.3, 0.3, 0.3, P.beacon, 1.6, 14.9, 1.6);
	b.box(6, 3, 5, P.wallWhite, 4.8, 1.5, 0);
	return b.build();
}

export function controlTowerGlow(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 9.25, 0).taper(5.12, 5.12, 5.85, 5.85, 1.6, P.window).pop();
	return b.build();
}

export function fuelTankSmall(): Float32Array {
	const b = new MeshBuilder();
	b.push()
		.translate(-3, 1.8, 0)
		.cylinder(1.6, 1.6, 6, 12, P.tankWhite, { axis: 'x', smooth: true })
		.pop();
	for (const x of [-2, 2]) b.box(0.4, 0.9, 2.6, P.concreteDark, x, 0.45, 0);
	b.push()
		.translate(-3, 1.8, 0)
		.cylinder(1.62, 1.62, 0.5, 12, P.accent, { axis: 'x', smooth: true })
		.pop();
	return b.build();
}

export function windsock(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(0.08, 0.06, 6, 5, P.steel);
	b.push().translate(0.1, 5.7, 0).cylinder(0.45, 0.2, 2.4, 8, P.orange, { axis: 'x' }).pop();
	return b.build();
}

export function flagpole(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(0.1, 0.07, 12, 6, P.steel);
	b.box(3.0, 1.8, 0.05, P.accent, 1.55, 11.0, 0);
	b.box(1.0, 1.8, 0.06, P.wallWhite, 0.55, 11.0, 0);
	return b.build();
}

export function sandbagWall(length: number): Float32Array {
	const b = new MeshBuilder();
	const n = Math.max(1, Math.round(length / 1.1));
	for (let layer = 0; layer < 3; layer++) {
		for (let i = 0; i < n - (layer % 2); i++) {
			b.box(
				1.08,
				0.38,
				0.6,
				P.sandbag,
				-length / 2 + 0.55 + i * 1.1 + (layer % 2) * 0.55,
				0.19 + layer * 0.38,
				0
			);
		}
	}
	return b.build();
}

export function tankTrap(): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0.7, 0).rotateZ(0.95).box(2.0, 0.18, 0.18, P.steel).pop();
	b.push().translate(0, 0.7, 0).rotateZ(-0.95).box(2.0, 0.18, 0.18, P.steel).pop();
	b.push().translate(0, 0.7, 0).rotateX(0.95).box(0.18, 0.18, 2.0, P.steel).pop();
	return b.build();
}

export function crateStack(): Float32Array {
	const b = new MeshBuilder();
	b.box(1.2, 1.0, 1.2, P.wood, 0, 0.5, 0);
	b.box(1.2, 1.0, 1.2, P.wood, 1.25, 0.5, 0.2);
	b.box(1.1, 0.9, 1.1, P.armyDark, 0.6, 1.45, 0.1);
	for (let i = 0; i < 3; i++)
		b.push()
			.translate(-1.3 - i * 0.7, 0, 0.3)
			.cylinder(0.32, 0.32, 1.0, 8, i === 1 ? P.red : P.armyLight)
			.pop();
	return b.build();
}

export interface BlockSpec {
	w: number;
	d: number;
	floors: number;
	wall: Material;
	/** Glass curtain wall instead of punched windows. */
	glass?: boolean;
	seed: number;
}

const FLOOR_H = 3.1;

/** Window grid of one city block face, as (x, y) centres, deterministic per seed. */
function blockWindows(spec: BlockSpec, span: number): number[][] {
	const cols = Math.max(2, Math.floor(span / 2.4));
	const out: number[][] = [];
	for (let f = 0; f < spec.floors; f++) {
		for (let c = 0; c < cols; c++) {
			const x = -span / 2 + (c + 0.5) * (span / cols);
			out.push([x, f * FLOOR_H + 1.7, f, c]);
		}
	}
	return out;
}

/** Apartment or office block with dark windows; lit panes are `blockLights`. */
export function block(spec: BlockSpec): Float32Array {
	const b = new MeshBuilder();
	const { w, d, floors, wall } = spec;
	const h = floors * FLOOR_H + 0.6;
	b.box(w, h, d, spec.glass ? P.officeGlass : wall, 0, h / 2, 0);
	if (spec.glass) {
		// Concrete floor bands and corner columns over the glass.
		for (let f = 0; f <= floors; f++)
			b.box(w + 0.12, 0.35, d + 0.12, P.trim, 0, f * FLOOR_H + 0.2, 0);
		for (const sx of [1, -1])
			for (const sz of [1, -1]) b.box(0.5, h, 0.5, P.trim, (sx * w) / 2, h / 2, (sz * d) / 2);
	} else {
		for (const [x, y] of blockWindows(spec, w)) {
			b.box(1.2, 1.4, 0.06, P.windowDark, x, y, d / 2 + 0.02);
			b.box(1.2, 1.4, 0.06, P.windowDark, x, y, -d / 2 - 0.02);
		}
		for (const [z, y] of blockWindows(spec, d)) {
			b.box(0.06, 1.4, 1.2, P.windowDark, w / 2 + 0.02, y, z);
			b.box(0.06, 1.4, 1.2, P.windowDark, -w / 2 - 0.02, y, z);
		}
		b.box(w + 0.3, 0.4, d + 0.3, P.trim, 0, h, 0);
	}
	// Rooftop clutter: a stair house, a water tank and a mast.
	const rng = new Rng(spec.seed);
	b.box(
		2.6,
		2.4,
		2.6,
		P.concreteDark,
		w * rng.range(-0.25, 0.25),
		h + 1.2,
		d * rng.range(-0.2, 0.2)
	);
	if (rng.chance(0.6))
		b.push()
			.translate(w * 0.3, h, -d * 0.25)
			.cylinder(0.9, 0.9, 1.8, 8, P.rust)
			.pop();
	if (rng.chance(0.5))
		b.push()
			.translate(-w * 0.35, h, d * 0.3)
			.cylinder(0.06, 0.04, 4, 4, P.steel)
			.pop();
	return b.build();
}

/** Lit windows of a city block, on a seeded subset of its windows. */
export function blockLights(spec: BlockSpec): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(spec.seed * 13 + 1);
	const { w, d } = spec;
	if (spec.glass) {
		for (let f = 0; f < spec.floors; f++) {
			if (!rng.chance(0.45)) continue;
			const y = f * FLOOR_H + 1.8;
			const span = rng.range(0.12, 0.35);
			const x = rng.range(-0.5 + span / 2, 0.5 - span / 2) * w;
			b.box(w * span, 1.1, 0.05, P.window, x, y, d / 2 + 0.04);
		}
		return b.build();
	}
	for (const [x, y] of blockWindows(spec, w))
		if (rng.chance(0.35)) b.box(1.1, 1.3, 0.04, P.window, x, y, d / 2 + 0.06);
	for (const [z, y] of blockWindows(spec, d)) {
		if (rng.chance(0.3)) b.box(0.04, 1.3, 1.1, P.window, w / 2 + 0.06, y, z);
		if (rng.chance(0.3)) b.box(0.04, 1.3, 1.1, P.window, -w / 2 - 0.06, y, z);
	}
	return b.build();
}

/** Collapsed city block: broken wall stumps over a heap of rubble. */
export function rubble(seed: number): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	b.push().translate(-5.2, 0, -3.5).taper(0.6, 7.5, 0.6, 3.5, 3, P.plaster, 0, -2).pop();
	b.push().translate(4.8, 0, 1.0).taper(0.6, 5.0, 0.6, 1.5, 6.5, P.plaster, 0, 1.2).pop();
	b.box(9, 2.2, 0.6, P.plaster, 0, 1.1, -4.6);
	for (let i = 0; i < 10; i++) {
		b.push()
			.translate(rng.range(-4.5, 4.5), 0.4, rng.range(-3.5, 3.5))
			.scale(1.5, 0.6, 1.3)
			.blob(rng.range(0.8, 1.5), 6, 4, i % 3 ? P.concreteDark : P.concrete, 0.35, seed * 11 + i)
			.pop();
	}
	for (let i = 0; i < 3; i++)
		b.push()
			.translate(rng.range(-3, 3), 0.8, rng.range(-2, 2))
			.rotateY(rng.range(0, 3))
			.rotateZ(rng.range(0.2, 0.6))
			.box(5, 0.35, 1.6, P.concrete)
			.pop();
	return b.build();
}
