import { describe, expect, it } from 'vitest';
import { damageUnit } from './combat';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { cadence, credit, MAX_RANK, nextRankXp, power, toughness } from './veterancy';
import { HQ_HP } from './war';
import type { World } from './world';

const STEP = 1 / 60;

function battle(): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false }, 5);
	w.units.length = 0;
	return w;
}

describe('veterancy', () => {
	it('a rifleman is promoted after a kill; a tank needs a real tally', () => {
		const w = battle();
		w.allies.deploy(w, ['rifleman', 'tank'], 1200);
		const [rifle, tank] = w.allies.list;
		const foe = w.spawnUnit('rifleman', 1500, 0, -1);
		expect(credit(w, rifle, foe)).toBe(1);
		expect(rifle.rank).toBe(1);
		expect(credit(w, tank, foe)).toBe(0);
		expect(tank.xp).toBeGreaterThan(0);
		expect(nextRankXp(tank)).toBeGreaterThan(nextRankXp(rifle, 0));
	});

	it('stops at rank five', () => {
		const w = battle();
		w.allies.deploy(w, ['rifleman'], 1200);
		const rifle = w.allies.list[0];
		const big = w.spawnUnit('superTank', 1500, 0, -1);
		for (let i = 0; i < 20; i++) credit(w, rifle, big);
		expect(rifle.rank).toBe(MAX_RANK);
	});

	it('earns nothing for killing its own side', () => {
		const w = battle();
		w.allies.deploy(w, ['rifleman', 'rifleman'], 1200);
		const [a, b] = w.allies.list;
		expect(credit(w, a, b)).toBe(0);
		expect(a.xp ?? 0).toBe(0);
	});

	it('makes a unit tougher, harder hitting and quicker to reload with each rank', () => {
		const w = battle();
		const green = w.spawnUnit('tank', 1500, 0, -1);
		const vet = w.spawnUnit('tank', 1600, 0, -1);
		vet.rank = 3;
		damageUnit(w, green, 100, 1, 'player', 1400, 'blast');
		damageUnit(w, vet, 100, 1, 'player', 1400, 'blast');
		expect(vet.hp - green.hp).toBeCloseTo(100 - 100 * toughness(vet), 3);
		expect(power(vet)).toBeGreaterThan(power(green));
		expect(cadence(vet)).toBeLessThan(cadence(green));
	});

	it('promotes our tank for the troops it shoots down in a real fight', () => {
		const w = battle();
		w.allies.deploy(w, ['tank'], 1300);
		const tank = w.allies.list[0];
		tank.stun = 1e4;
		for (let i = 0; i < 6; i++) w.spawnUnit('apc', 1560 + i * 14, 0, -1).stun = 1e4;
		for (let t = 0; t < 90 && (tank.rank ?? 0) === 0; t += STEP) simulateWorld(w, STEP, null);
		expect(tank.xp).toBeGreaterThan(0);
		expect(tank.rank).toBeGreaterThan(0);
	});

	it('promotes their units for killing ours too', () => {
		const w = battle();
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman'], 1300);
		for (const u of w.allies.list) u.stun = 1e4;
		// Stunned enemies don't fire at all, so this one is left free.
		const gunner = w.spawnUnit('mgTeam', 1520, 0, -1);
		for (let t = 0; t < 60 && (gunner.rank ?? 0) === 0; t += STEP) simulateWorld(w, STEP, null);
		expect(gunner.rank).toBeGreaterThan(0);
	});
});
