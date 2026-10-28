import { describe, expect, it } from 'vitest';
import { LENS_BARREL, lensDistort, lensUndistort } from './lens';

describe('lens', () => {
	it('is the identity when off', () => {
		expect(lensDistort(0.2, 0.7, 16 / 9, 0)).toEqual([0.2, 0.7]);
		expect(lensUndistort(0.2, 0.7, 16 / 9, 0)).toEqual([0.2, 0.7]);
	});

	it('keeps the corners and centre fixed and never samples outside the frame', () => {
		const a = 16 / 9;
		for (const [u, v] of [
			[0, 0],
			[1, 1],
			[0, 1]
		]) {
			const [x, y] = lensDistort(u, v, a, LENS_BARREL);
			expect(x).toBeCloseTo(u, 9);
			expect(y).toBeCloseTo(v, 9);
		}
		expect(lensDistort(0.5, 0.5, a, LENS_BARREL)).toEqual([0.5, 0.5]);
		for (let i = 0; i <= 10; i++) {
			const [x, y] = lensDistort(i / 10, 0, a, LENS_BARREL);
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(1);
			expect(y).toBeGreaterThanOrEqual(0);
		}
	});

	it('undistort inverts distort', () => {
		const a = 16 / 9;
		for (const [u, v] of [
			[0.1, 0.2],
			[0.5, 0.9],
			[0.83, 0.41],
			[0.97, 0.03]
		]) {
			const [x, y] = lensDistort(u, v, a, LENS_BARREL);
			const [bu, bv] = lensUndistort(x, y, a, LENS_BARREL);
			expect(bu).toBeCloseTo(u, 5);
			expect(bv).toBeCloseTo(v, 5);
		}
	});
});
