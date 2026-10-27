import { describe, expect, it } from 'vitest';
import { Announcer, noAlerts } from './cockpit';

const tick = (a: Announcer, s: ReturnType<typeof noAlerts>, seconds: number) => {
	const said: string[] = [];
	for (let t = 0; t < seconds; t += 0.05) {
		const x = a.update(0.05, s);
		if (x) said.push(x);
	}
	return said;
};

describe('voice warnings', () => {
	it('repeats a held warning on its own cadence', () => {
		const a = new Announcer();
		const s = { ...noAlerts(), stall: true };
		expect(tick(a, s, 4).filter((x) => x === 'stall').length).toBe(3);
	});

	it('lets the most urgent warning drown out lesser ones', () => {
		const a = new Announcer();
		const s = { ...noAlerts(), pullUp: true, damage: true, boundary: true };
		expect(new Set(tick(a, s, 6))).toEqual(new Set(['pullUp']));
	});

	it('says one-shot callouts once each time they come on', () => {
		const a = new Announcer();
		const on = { ...noAlerts(), winchester: true };
		expect(tick(a, on, 5)).toEqual(['winchester']);
		tick(a, noAlerts(), 1);
		expect(tick(a, on, 2)).toEqual(['winchester']);
	});
});
