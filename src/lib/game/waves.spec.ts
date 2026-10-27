import { describe, expect, it } from 'vitest';
import { UNITS } from './defs-units';
import { testWorld } from './test-world';
import type { UnitKind } from './types';
import { endlessTweaks, planWave, waveBonus, WaveDirector } from './waves';

const ground = (kinds: string[]): UnitKind[] =>
	kinds.filter((k) => k !== 'fighter' && k !== 'heli' && k !== 'train') as UnitKind[];

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

describe('mission waves', () => {
	it('applies budget, lead and aircraft tweaks', () => {
		const cost = (budget: number): number =>
			ground(planWave(3, 3, 0, null, { budget }).orders.map((o) => o.kind)).reduce(
				(s, k) => s + UNITS[k].cost,
				0
			);
		expect(cost(2)).toBeGreaterThan(cost(1) * 1.5);
		const tanks = (mult: number): number =>
			planWave(4, 3, 0, null, { lead: { tank: mult } }).orders.filter((o) => o.kind === 'tank')
				.length;
		expect(tanks(6)).toBeGreaterThan(tanks(0));
		const air = planWave(1, 3, 0, null, { fighters: 3, helis: 2 }).orders;
		expect(air.filter((o) => o.kind === 'fighter')).toHaveLength(3);
		expect(air.filter((o) => o.kind === 'heli')).toHaveLength(2);
	});

	it('places extra emplacements even when the field is already full', () => {
		const plan = planWave(8, 1, 20, [2700, 3000], {}, ['radar', 'bunker']);
		expect(plan.statics.map((s) => s.kind)).toEqual(['radar', 'bunker']);
		for (const s of plan.statics) expect(s.x < 2700 || s.x > 3000).toBe(true);
	});

	it('runs a fixed number of waves at an offset strength', () => {
		const w = testWorld();
		const messages: string[] = [];
		w.events = { ...w.events, message: (t, sub) => messages.push(`${t}|${sub ?? ''}`) };
		const d = new WaveDirector(5, { last: 2, offset: 3, briefings: ['First', 'Second'] });
		d.begin(w, 1);
		expect(w.wave).toBe(4);
		expect(d.label).toBe('WAVE 1/2');
		expect(messages[0]).toBe('WAVE 1/2|First');
		const clear = (): void => {
			for (let i = 0; i < 60 * 200; i++) {
				d.update(w, 1 / 60);
				for (const u of w.units) u.alive = false;
				for (const a of w.air) a.alive = false;
				if (d.state === 'cleared' || d.state === 'complete') break;
			}
		};
		clear();
		expect(d.state).toBe('cleared');
		expect(d.cleared).toBe(1);
		for (let i = 0; i < 60 * 8; i++) d.update(w, 1 / 60);
		expect(d.wave).toBe(2);
		expect(w.wave).toBe(5);
		clear();
		expect(d.state).toBe('complete');
		expect(d.cleared).toBe(2);
		d.update(w, 10);
		expect(d.wave).toBe(2);
	});

	it('keeps escalating in endless mode', () => {
		expect(endlessTweaks(3)).toEqual({ budget: 1, fighters: undefined, helis: undefined });
		expect(endlessTweaks(10).budget).toBeGreaterThan(1.2);
		expect(endlessTweaks(15).fighters).toBeGreaterThan(4);
		expect(endlessTweaks(60).fighters).toBe(7);
		expect(waveBonus(5, 1)).toBeGreaterThan(waveBonus(1, 1));
		expect(waveBonus(5, 0.2)).toBeLessThan(waveBonus(5, 1));
		expect(waveBonus(3, 1) % 10).toBe(0);
	});
});
