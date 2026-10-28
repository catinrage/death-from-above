import { MeshBuilder, type Material } from '../engine/mesh-builder';
import { P } from './palette';

/** What a soldier carries, which sets his role at a glance. */
export type SoldierKit = 'rifle' | 'launcher' | 'sniper' | 'rpg' | 'mortar' | 'medic';

/** Torso, head and kit. Origin at the feet; hips at y = 0.95. */
export function soldierBody(kit: SoldierKit): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0.92, 0).taper(0.3, 0.4, 0.34, 0.52, 0.62, P.uniform).pop();
	b.box(0.31, 0.12, 0.43, P.armyDark, 0, 1.0, 0);
	b.push().translate(0, 1.66, 0).sphere(0.13, 8, 6, P.skin, false).pop();
	b.push()
		.translate(0.01, 1.73, 0)
		.scale(1.1, 0.75, 1.05)
		.sphere(0.17, 8, 4, kit === 'sniper' ? P.canvas : P.helmet, false)
		.pop();
	if (kit !== 'medic') b.box(0.22, 0.42, 0.38, P.helmet, -0.25, 1.3, 0);
	switch (kit) {
		case 'launcher':
			b.push().translate(-0.8, 1.62, 0.24).rotateZ(0.1);
			b.cylinder(0.1, 0.1, 1.6, 8, P.armyLight, { axis: 'x' });
			b.push().translate(1.1, 0.1, 0).box(0.25, 0.2, 0.1, P.armyDark).pop();
			b.pop();
			break;
		case 'rpg':
			// Shoulder tube with the bulbous warhead poking out the front.
			b.push().translate(-0.55, 1.6, 0.24).rotateZ(0.06);
			b.cylinder(0.07, 0.07, 1.2, 8, P.armyDark, { axis: 'x' });
			b.push().translate(1.25, 0, 0).sphere(0.14, 8, 5, P.armyLight, false).pop();
			b.pop();
			b.box(0.2, 0.36, 0.3, P.canvas, -0.27, 1.25, -0.2);
			break;
		case 'sniper':
			// Long rifle with a scope, slung low and level.
			b.push().translate(0.1, 1.3, 0.26).rotateZ(0.12);
			b.box(1.5, 0.06, 0.06, P.rifle);
			b.box(0.34, 0.07, 0.07, P.gunMetal, 0.05, 0.1, 0);
			b.pop();
			b.box(0.36, 0.18, 0.46, P.canvas, 0, 1.45, 0);
			break;
		case 'mortar':
			// The tube on his back and a baseplate under his arm.
			b.push().translate(-0.28, 1.0, 0).rotateZ(-0.25);
			b.cylinder(0.08, 0.08, 1.1, 8, P.gunMetal);
			b.pop();
			b.box(0.08, 0.36, 0.36, P.armyDark, 0.12, 1.15, 0.3);
			break;
		case 'medic':
			// Satchel and armband, red cross on white.
			b.box(0.24, 0.36, 0.36, P.shirtCream, -0.25, 1.3, 0);
			b.box(0.05, 0.22, 0.07, P.red, -0.38, 1.3, 0);
			b.box(0.05, 0.07, 0.22, P.red, -0.38, 1.3, 0);
			b.box(0.12, 0.08, 0.14, P.shirtCream, 0.02, 1.42, 0.3);
			break;
		default:
			b.push().translate(0.2, 1.25, 0.26).rotateZ(0.55).box(0.95, 0.07, 0.06, P.rifle).pop();
	}
	return b.build();
}

/** One leg, origin at the hip joint. */
export function soldierLeg(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.17, 0.86, 0.19, P.uniform, 0, -0.43, 0);
	b.box(0.28, 0.12, 0.2, P.boots, 0.05, -0.89, 0);
	return b.build();
}

/** One arm, origin at the shoulder joint. */
export function soldierArm(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.13, 0.58, 0.14, P.uniform, 0, -0.29, 0);
	b.box(0.11, 0.11, 0.11, P.skin, 0, -0.62, 0);
	return b.build();
}

/** An unarmed villager: shirt, bare head, no kit. */
export function civilianBody(shirt: Material, hair: Material): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0.92, 0).taper(0.28, 0.36, 0.32, 0.5, 0.6, shirt).pop();
	b.box(0.3, 0.1, 0.4, P.boots, 0, 1.0, 0);
	b.push().translate(0, 1.64, 0).sphere(0.13, 8, 6, P.skin, false).pop();
	b.push().translate(-0.02, 1.7, 0).scale(1.05, 0.7, 1).sphere(0.14, 8, 4, hair, false).pop();
	return b.build();
}

export function civilianLeg(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.17, 0.86, 0.19, P.trousers, 0, -0.43, 0);
	b.box(0.26, 0.1, 0.18, P.boots, 0.05, -0.9, 0);
	return b.build();
}

export function civilianArm(): Float32Array {
	const b = new MeshBuilder();
	b.box(0.12, 0.56, 0.13, P.skin, 0, -0.29, 0);
	return b.build();
}
