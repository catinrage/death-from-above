import { MeshBuilder, type Material, type P2 } from '../engine/mesh-builder';
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
