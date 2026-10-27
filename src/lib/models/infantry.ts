import { MeshBuilder } from '../engine/mesh-builder';
import { P } from './palette';

/** Torso, head and kit. Origin at the feet; hips at y = 0.95. */
export function soldierBody(launcher: boolean): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0.92, 0).taper(0.3, 0.4, 0.34, 0.52, 0.62, P.uniform).pop();
	b.box(0.31, 0.12, 0.43, P.armyDark, 0, 1.0, 0);
	b.push().translate(0, 1.66, 0).sphere(0.13, 8, 6, P.skin, false).pop();
	b.push()
		.translate(0.01, 1.73, 0)
		.scale(1.1, 0.75, 1.05)
		.sphere(0.17, 8, 4, P.helmet, false)
		.pop();
	b.box(0.22, 0.42, 0.38, P.helmet, -0.25, 1.3, 0);
	if (launcher) {
		b.push().translate(-0.8, 1.62, 0.24).rotateZ(0.1);
		b.cylinder(0.1, 0.1, 1.6, 8, P.armyLight, { axis: 'x' });
		b.push().translate(1.1, 0.1, 0).box(0.25, 0.2, 0.1, P.armyDark).pop();
		b.pop();
	} else {
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
