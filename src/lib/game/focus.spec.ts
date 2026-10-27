import { describe, expect, it } from 'vitest';
import { FOCUS_TIME_SCALE, Focus } from './focus';

const run = (f: Focus, seconds: number, allowed = true): void => {
	for (let t = 0; t < seconds; t += 0.05) f.update(0.05, false, allowed);
};

describe('Focus', () => {
	it('toggles on and off and eases time toward a quarter speed', () => {
		const f = new Focus();
		expect(f.update(0.016, true, true)).toBe('start');
		run(f, 0.6);
		expect(f.timeScale()).toBeCloseTo(FOCUS_TIME_SCALE, 2);
		expect(f.update(0.016, true, true)).toBe('stop');
		run(f, 0.6);
		expect(f.timeScale()).toBeCloseTo(1, 2);
	});

	it('runs out of meter after a few seconds and must recharge before reuse', () => {
		const f = new Focus();
		f.update(0.016, true, true);
		run(f, 5);
		expect(f.active).toBe(false);
		expect(f.meter).toBeLessThan(0.05);
		expect(f.update(0.016, true, true)).toBeNull();
		run(f, 3.5);
		expect(f.update(0.016, true, true)).toBe('start');
	});

	it('ends when the aircraft can no longer use it', () => {
		const f = new Focus();
		f.update(0.016, true, true);
		expect(f.update(0.016, false, false)).toBe('stop');
	});

	it('refills from kills only while not focusing', () => {
		const f = new Focus();
		f.meter = 0.5;
		f.reward(0.2);
		expect(f.meter).toBeCloseTo(0.7);
		f.update(0.016, true, true);
		const before = f.meter;
		f.reward(0.2);
		expect(f.meter).toBe(before);
	});
});
