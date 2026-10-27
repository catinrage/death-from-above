import { describe, expect, it } from 'vitest';
import { damageUnit, segmentVsBox, segmentVsCircle, segmentVsUnit } from './combat';
import { testWorld } from './test-world';

describe('hit tests', () => {
	it('finds the entry point of a segment through a box', () => {
		expect(segmentVsBox(0, 5, 10, 5, 4, 0, 6, 10)).toBeCloseTo(0.4);
		expect(segmentVsBox(0, 20, 10, 20, 4, 0, 6, 10)).toBe(-1);
	});

	it('detects a segment passing close to a circle', () => {
		expect(segmentVsCircle(0, 0, 10, 0, 5, 1, 2)).toBeGreaterThanOrEqual(0);
		expect(segmentVsCircle(0, 0, 10, 0, 5, 3, 2)).toBe(-1);
	});

	it('tests bullets against a unit in the side-on plane, ignoring depth', () => {
		const w = testWorld();
		const u = w.spawnUnit('truck', 1500, 2.5);
		expect(segmentVsUnit(u, 1490, u.y + 1, 1510, u.y + 1)).toBeGreaterThanOrEqual(0);
		expect(segmentVsUnit(u, 1490, u.y + 20, 1510, u.y + 20)).toBe(-1);
	});
});

describe('damage', () => {
	it('lets armour shrug off small arms', () => {
		const w = testWorld();
		const tank = w.spawnUnit('tank', 1500, 0);
		const jeep = w.spawnUnit('jeep', 1600, 0);
		damageUnit(w, tank, 10, 0.1, 'player', 1400, 'bullet');
		damageUnit(w, jeep, 10, 0.1, 'player', 1400, 'bullet');
		expect(tank.def.hp - tank.hp).toBeLessThan(jeep.def.hp - jeep.hp);
	});

	it('pops a tank turret into debris and leaves a burning wreck', () => {
		const w = testWorld();
		const tank = w.spawnUnit('tank', 1500, 0);
		damageUnit(w, tank, 10000, 1, 'player', 1400, 'blast');
		expect(tank.alive).toBe(false);
		expect(tank.turretGone).toBe(true);
		expect(tank.remove).toBe(false);
		expect(w.debris.list.length).toBeGreaterThan(0);
		expect(w.fires.list.length).toBeGreaterThan(0);
	});

	it('flings infantry as ragdolls', () => {
		const w = testWorld();
		const s = w.spawnUnit('rifleman', 1500, 0);
		damageUnit(w, s, 100, 0, 'player', 1495, 'blast');
		expect(s.remove).toBe(true);
		const body = w.debris.list[w.debris.list.length - 1];
		expect(body.vx).toBeGreaterThan(0);
	});

	it('makes an APC unload troops once badly damaged', () => {
		const w = testWorld();
		const apc = w.spawnUnit('apc', 1500, 0);
		damageUnit(w, apc, 120, 1, 'player', 1400, 'blast');
		expect(apc.alive).toBe(true);
		expect(apc.state).toBe('deploy');
	});
});
