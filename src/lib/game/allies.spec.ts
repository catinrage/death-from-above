import { describe, expect, it } from 'vitest';
import { endlessColumn } from './allies';
import { MISSIONS, MissionTracker } from './campaign';
import { WORLD } from './constants';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { WaveDirector } from './waves';
import type { World } from './world';

const DT = 1 / 30;

function run(w: World, seconds: number, until?: () => boolean): number {
	let t = 0;
	for (; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		if (until?.()) break;
	}
	return t;
}

describe('friendly column', () => {
	it('drives up the road, over the bridge and through to the rally point', () => {
		const w = testWorld();
		w.allies.deploy(w, ['tank', 'apc', 'truck']);
		const r = w.river!;
		// Start them short of the bridge so the test doesn't drive the whole valley.
		w.allies.list.forEach((u, i) => (u.x = r.x0 - r.bridgeHalf - 120 - i * 16));
		run(w, 120, () => w.allies.arrived === 3);
		expect(w.allies.arrived).toBe(3);
		expect(w.allies.list.length).toBe(0);
		expect(w.allies.lost).toBe(0);
	});

	it('halts to fight an enemy tank instead of driving through it', () => {
		const w = testWorld();
		w.allies.deploy(w, ['tank']);
		const ally = w.allies.list[0];
		ally.x = 1200;
		const foe = w.spawnUnit('tank', 1500, 0);
		let closest = Infinity;
		run(w, 90, () => {
			if (ally.alive && foe.alive) closest = Math.min(closest, foe.x - ally.x);
			return !ally.alive || !foe.alive;
		});
		expect(closest).toBeGreaterThan(100);
		// One of them lost the duel.
		expect(!ally.alive || !foe.alive).toBe(true);
	});

	it('is hurt by enemy guns while it waits out a fight', () => {
		const w = testWorld();
		w.allies.deploy(w, ['truck']);
		const truck = w.allies.list[0];
		truck.x = 1300;
		// Unarmed and pinned in front of a machine-gun nest.
		w.spawnUnit('jeep', 1560, 0);
		run(w, 40);
		expect(truck.hp).toBeLessThan(truck.def.hp);
	});

	it('waits at a fallen bridge span', () => {
		const w = testWorld();
		const b = w.bridge!;
		for (const s of b.spans) s.down = true;
		w.allies.deploy(w, ['apc']);
		const u = w.allies.list[0];
		u.x = b.spans[0].x0 - 60;
		run(w, 30);
		expect(u.alive).toBe(true);
		expect(u.x).toBeLessThan(b.spans[0].x0);
		expect(u.speed).toBeLessThan(0.5);
	});

	it("takes damage from the player's own bombs", () => {
		const w = testWorld();
		w.allies.deploy(w, ['jeep']);
		const u = w.allies.list[0];
		w.allies.blast(u.x, u.y + 1, 12, 400, 0.5);
		run(w, 0.1);
		expect(u.alive).toBe(false);
		expect(w.allies.lost).toBe(1);
	});

	it('scores nothing for the enemy when a friendly vehicle dies', () => {
		const w = testWorld();
		const credited: string[] = [];
		w.events = { ...w.events, kill: (_n, _s, _x, _y, by) => credited.push(by) };
		w.allies.deploy(w, ['truck']);
		w.allies.list[0].hp = 0;
		run(w, 0.1);
		expect(credited).toEqual(['enemy']);
	});

	it('rolls out when a wave that carries one launches', () => {
		const w = testWorld();
		const waves = new WaveDirector(3, { column: (n) => (n === 1 ? ['tank', 'truck'] : []) });
		waves.begin(w, 1);
		for (let t = 0; t < 5; t += DT) waves.update(w, DT);
		expect(w.allies.deployed).toBe(2);
		expect(w.allies.list.every((u) => u.x > WORLD.baseMinX && u.dir === 1)).toBe(true);
	});

	it('comes every third wave in endless, heavier as it goes', () => {
		expect(endlessColumn(1)).toEqual([]);
		expect(endlessColumn(4)).toEqual([]);
		expect(endlessColumn(3).length).toBeGreaterThan(0);
		expect(endlessColumn(12).length).toBeGreaterThan(endlessColumn(3).length);
	});
});

describe('escort objective', () => {
	const mission = MISSIONS.find((m) => m.id === 'spearhead')!;

	it('counts vehicles that reach the rally point', () => {
		const w = testWorld();
		const t = new MissionTracker(mission);
		t.update(w);
		expect(t.failed()).toBe(false);
		w.allies.deploy(w, ['tank', 'apc', 'truck', 'jeep']);
		w.allies.arrived = 3;
		t.update(w);
		const waves = new WaveDirector(1, mission.waves);
		expect(t.status(waves)[0]).toMatchObject({ count: '3/4', done: false });
		w.allies.arrived = 4;
		t.update(w);
		expect(t.status(waves)[0]).toMatchObject({ count: '4/4', done: true });
		expect(t.failed()).toBe(false);
	});

	it('fails once too few vehicles are left to make it', () => {
		const w = testWorld();
		const t = new MissionTracker(mission);
		w.allies.deploy(w, ['tank', 'apc', 'truck', 'jeep']);
		t.update(w);
		expect(t.failure()).toBeNull();
		w.allies.list[0].hp = 0;
		run(w, 0.1);
		t.update(w);
		expect(t.failure()).toBe('The column was destroyed');
	});
});
