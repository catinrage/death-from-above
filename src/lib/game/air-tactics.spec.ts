import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import type { AircraftId } from './types';
import { HQ_HP } from './war';
import { Wingman } from './wingman';
import { bomberAltitude, wingProfile } from './wing-profile';
import type { World } from './world';

const STEP = 1 / 60;

function commandWorld(): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false, ourHq: true }, 5);
	w.command.start(0);
	w.enemyCommand.start(0);
	w.player = null;
	return w;
}

function jet(w: World, id: AircraftId, x: number, alt = 150): Wingman {
	const j = new Wingman(x, w.ground(x) + alt, {
		aircraft: id,
		callsign: null,
		profile: wingProfile(id),
		autoRearm: true
	});
	w.escorts.push(j);
	return j;
}

const riflemen = (w: World, from: number): number =>
	w.units.filter((u) => u.alive && u.def.kind === 'rifleman' && u.x > from).length;

describe('our jets', () => {
	it('turn back from guns deep behind their lines for troops crossing at the front', () => {
		const w = commandWorld();
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman'], 1950);
		const jets = (['f16', 'a10', 'su25'] as AircraftId[]).map((id) => jet(w, id, 2900));
		// Let them get stuck into the guns around their HQ first.
		for (let t = 0; t < 4; t += STEP) simulateWorld(w, STEP, null);
		expect(jets.some((j) => j.target?.unit && j.target.unit.x > 3300)).toBe(true);
		for (let i = 0; i < 12; i++) w.spawnUnit('rifleman', 2240 + i * 6, 0, -1);
		for (let t = 0; t < 6; t += STEP) simulateWorld(w, STEP, null);
		const onTroops = jets.filter((j) => j.target?.unit?.def.kind === 'rifleman').length;
		expect(onTroops).toBeGreaterThanOrEqual(2);
		for (let t = 0; t < 14; t += STEP) simulateWorld(w, STEP, null);
		expect(riflemen(w, 2200)).toBeLessThan(6);
	});
});

describe('heavy bombers', () => {
	it('fly higher the bigger they are, under the ceiling', () => {
		expect(bomberAltitude('b1')).toBeGreaterThan(bomberAltitude('albatross'));
		expect(bomberAltitude('tu95')).toBeGreaterThan(bomberAltitude('b1'));
		expect(bomberAltitude('tu95')).toBeLessThanOrEqual(270);
	});

	it('our Lancer runs in level and high over its target, never diving onto it', () => {
		const w = commandWorld();
		for (let i = 0; i < 6; i++) w.spawnUnit('tank', 1600 + i * 20, 0, -1);
		const b = jet(w, 'b1', 1000, 200);
		let low = Infinity;
		let steep = 0;
		for (let t = 3; t < 40; t += STEP) {
			simulateWorld(w, STEP, null);
			if (t < 8 || !b.alive) continue;
			low = Math.min(low, b.y - w.ground(b.x));
			steep = Math.max(steep, -Math.sin(b.angle));
		}
		expect(low).toBeGreaterThan(180);
		expect(steep).toBeLessThan(0.45);
	});

	it('their Lancer bombs our troops from height instead of diving to strafe', () => {
		const w = commandWorld();
		w.allies.deploy(w, Array(8).fill('rifleman'), 1500);
		const b = new AirUnit(w.newId(), 'striker', 2400, w.ground(2400) + 250, 'b1');
		b.role = 'attack';
		b.patrol = 1500;
		w.air.push(b);
		let low = Infinity;
		const before = w.allies.alive();
		for (let t = 0; t < 40 && b.alive; t += STEP) {
			simulateWorld(w, STEP, null);
			if (t > 6) low = Math.min(low, b.y - w.ground(b.x));
		}
		expect(low).toBeGreaterThan(180);
		expect(w.allies.alive()).toBeLessThan(before);
	});
});

describe('our HQ in command mode', () => {
	it('their siege wears down our HQ, not the airfield', () => {
		const w = commandWorld();
		expect(w.war.ourHqUp).toBe(true);
		const t = w.spawnUnit('tank', 900, 0, -1);
		for (let s = 0; s < 30 && t.state !== 'siege'; s += STEP) simulateWorld(w, STEP, null);
		expect(t.state).toBe('siege');
		for (let s = 0; s < 10; s += STEP) simulateWorld(w, STEP, null);
		expect(w.war.ourHq.hp).toBeLessThan(w.war.ourHq.maxHp);
		expect(w.base.hp).toBe(w.base.maxHp);
	});

	it('mirrors their HQ about the bridge', () => {
		const w = commandWorld();
		const mid = (w.war.hq.x0 + w.war.hq.x1 + w.war.ourHq.x0 + w.war.ourHq.x1) / 4;
		expect(mid).toBeCloseTo(w.river!.x0, 0);
		expect(w.war.ourHq.structures).toHaveLength(w.war.hq.structures.length);
		// Every building stands inside our compound, mirroring one of theirs.
		const ours = w.war.ourHq;
		for (const [i, s] of ours.structures.entries()) {
			expect(s.x).toBeGreaterThanOrEqual(ours.x0 - 20);
			expect(s.x).toBeLessThanOrEqual(ours.x1 + 20);
			expect(s.x + w.war.hq.structures[i].x).toBeCloseTo(2 * w.river!.x0, 0);
		}
	});

	it('only comes up in command mode', () => {
		const w = testWorld();
		w.war.start(w, { hqHp: HQ_HP }, 5);
		expect(w.war.ourHqUp).toBe(false);
	});
});
