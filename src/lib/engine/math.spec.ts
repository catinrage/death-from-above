import { describe, expect, it } from 'vitest';
import {
	angleDiff,
	clamp,
	damp,
	mat4,
	moveToward,
	quat,
	smoothstep,
	vec3,
	wrapAngle
} from './math';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-5): void => {
	expect(a.length).toBe(b.length);
	for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(eps);
};

describe('scalar helpers', () => {
	it('clamps and smoothsteps into range', () => {
		expect(clamp(5, 0, 1)).toBe(1);
		expect(clamp(-5, 0, 1)).toBe(0);
		expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
		expect(smoothstep(0, 1, 2)).toBe(1);
	});

	it('wraps angles into [-PI, PI) and finds the shortest turn', () => {
		expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
		expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
		expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
	});

	it('damps toward a target independent of frame rate', () => {
		let a = 0;
		for (let i = 0; i < 60; i++) a = damp(a, 10, 3, 1 / 60);
		let b = 0;
		for (let i = 0; i < 30; i++) b = damp(b, 10, 3, 1 / 30);
		expect(a).toBeCloseTo(b, 4);
	});

	it('moves toward a value without overshooting', () => {
		expect(moveToward(0, 1, 0.3)).toBeCloseTo(0.3);
		expect(moveToward(0.9, 1, 0.3)).toBe(1);
	});
});

describe('mat4', () => {
	it('inverts a translate-rotate-scale matrix', () => {
		const m = mat4.create();
		mat4.translate(m, m, 3, -2, 7);
		mat4.rotateY(m, m, 0.7);
		mat4.rotateZ(m, m, -1.1);
		mat4.scale(m, m, 2, 0.5, 1.5);
		const inv = mat4.invert(mat4.create(), m);
		expect(inv).not.toBeNull();
		const id = mat4.multiply(mat4.create(), m, inv as Float32Array);
		close(id, mat4.create(), 1e-5);
	});

	it('lookAt puts the eye at the origin looking down -Z', () => {
		const v = mat4.lookAt(mat4.create(), [0, 5, 10], [0, 5, 0], [0, 1, 0]);
		const eye = mat4.transformPoint(vec3.create(), v, 0, 5, 10);
		close(eye, [0, 0, 0]);
		const target = mat4.transformPoint(vec3.create(), v, 0, 5, 0);
		close(target, [0, 0, -10]);
	});

	it('perspective maps the near and far planes to NDC -1 and 1', () => {
		const p = mat4.perspective(mat4.create(), 1, 1.5, 2, 100);
		expect(mat4.transformPoint(vec3.create(), p, 0, 0, -2)[2]).toBeCloseTo(-1);
		expect(mat4.transformPoint(vec3.create(), p, 0, 0, -100)[2]).toBeCloseTo(1);
	});
});

describe('quat', () => {
	it('stays normalised while integrating angular velocity', () => {
		const q = quat.create();
		for (let i = 0; i < 1000; i++) quat.integrate(q, 3, -2, 5, 1 / 60);
		expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 6);
	});

	it('integrating a spin about Y matches the analytic rotation', () => {
		const q = quat.create();
		for (let i = 0; i < 600; i++) quat.integrate(q, 0, Math.PI / 2, 0, 1 / 600);
		const v = quat.rotate(vec3.create(), q, 1, 0, 0);
		close(v, [0, 0, -1], 1e-3);
	});

	it('yaw/pitch/roll agrees with the matrix composition used for units', () => {
		const q = quat.fromYawPitchRoll(quat.create(), 0.8, -0.3, 1.2);
		const fromQ = mat4.fromQuatTranslation(mat4.create(), q, 0, 0, 0);
		const m = mat4.create();
		mat4.rotateY(m, m, 0.8);
		mat4.rotateZ(m, m, -0.3);
		mat4.rotateX(m, m, 1.2);
		close(fromQ, m, 1e-5);
	});
});
