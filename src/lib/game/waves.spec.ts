import { describe, expect, it } from 'vitest';
import { UNITS } from './defs-units';
import { testWorld } from './test-world';
import type { UnitKind } from './types';
import { planWave, WaveDirector } from './waves';

const ground = (kinds: string[]): UnitKind[] =>
	kinds.filter((k) => k !== 'fighter' && k !== 'heli') as UnitKind[];

describe('planWave', () => {
	it('only fields units unlocked for the wave', () => {
		for (let wave = 1; wave <= 6; wave++) {
			const plan = planWave(wave, 3, 0);
			for (const k of ground(plan.orders.map((o) => o.kind)))
				expect(UNITS[k].minWave).toBeLessThanOrEqual(wave);
			for (const s of plan.statics) expect(UNITS[s.kind].minWave).toBeLessThanOrEqual(wave);
		}
	});

	it('escalates with the wave number', () => {
		const cost = (wave: number): number =>
			ground(planWave(wave, 3, 0).orders.map((o) => o.kind)).reduce((s, k) => s + UNITS[k].cost, 0);
		expect(cost(6)).toBeGreaterThan(cost(1) * 2);
		expect(planWave(1, 3, 0).orders.some((o) => o.kind === 'fighter')).toBe(false);
		expect(planWave(7, 3, 0).orders.some((o) => o.kind === 'fighter')).toBe(true);
	});

	it('is deterministic for a given seed and keeps spawn times ordered', () => {
		const a = planWave(4, 9, 0),
			b = planWave(4, 9, 0);
		expect(a).toEqual(b);
		for (let i = 1; i < a.orders.length; i++)
			expect(a.orders[i].t).toBeGreaterThanOrEqual(a.orders[i - 1].t);
	});

	it('tops up static defences instead of stacking them forever', () => {
		expect(planWave(8, 1, 20).statics.length).toBe(0);
	});
});

describe('WaveDirector', () => {
	it('briefs, spawns the wave and declares it cleared when everyone is dead', () => {
		const w = testWorld();
		const d = new WaveDirector(5);
		d.begin(w, 1);
		expect(d.state).toBe('briefing');
		for (let i = 0; i < 60 * 5; i++) d.update(w, 1 / 60);
		expect(d.state).toBe('active');
		for (let i = 0; i < 60 * 120; i++) d.update(w, 1 / 60);
		expect(w.units.length).toBeGreaterThan(3);
		for (const u of w.units) u.alive = false;
		d.update(w, 1 / 60);
		expect(d.state).toBe('cleared');
	});
});
