import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import { HELO_GAP, spread } from './spacing';
import { testWorld } from './test-world';
import { Wingman } from './wingman';
import { wingProfile } from './wing-profile';

const STEP = 1 / 60;

describe('spread', () => {
	it('pushes apart only what is closer than the gap', () => {
		const a = { x: 0, y: 0 };
		expect(spread(a, [a, { x: HELO_GAP + 1, y: 0 }], () => 0)).toEqual([0, 0]);
		const [px] = spread(a, [{ x: 10, y: 0 }], () => 0);
		expect(px).toBeCloseTo(-(HELO_GAP - 10));
	});

	it('splits two aircraft stacked exactly, one each way', () => {
		const a = { x: 5, y: 5, id: 1 };
		const b = { x: 5, y: 5, id: 2 };
		const rank = (s: { id: number }): number => s.id;
		expect(spread(a, [b], rank)[0]).toBeLessThan(0);
		expect(spread(b, [a], rank)[0]).toBeGreaterThan(0);
	});
});

describe('helicopters', () => {
	it('two of ours sent at the same spot hover apart', () => {
		const w = testWorld();
		w.player = null;
		const x = 900;
		const helos = [0, 1].map(() => {
			const h = new Wingman(x, w.ground(x) + 40, {
				aircraft: 'apache',
				callsign: null,
				profile: wingProfile('apache'),
				autoRearm: true
			});
			h.patrol = 1400;
			w.escorts.push(h);
			return h;
		});
		for (let t = 0; t < 20; t += STEP) for (const h of helos) h.update(w, STEP);
		const d = Math.hypot(helos[0].x - helos[1].x, helos[0].y - helos[1].y);
		expect(d).toBeGreaterThan(HELO_GAP * 0.7);
	});

	it('two of theirs on the same station hover apart', () => {
		const w = testWorld();
		const x = 1600;
		const a = new AirUnit(w.newId(), 'heli', x, w.ground(x) + 46);
		const b = new AirUnit(w.newId(), 'heli', x, w.ground(x) + 46);
		w.air.push(a, b);
		for (let t = 0; t < 20; t += STEP) {
			a.update(w, STEP);
			b.update(w, STEP);
		}
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(HELO_GAP * 0.7);
	});
});
