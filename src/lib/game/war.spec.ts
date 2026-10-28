import { describe, expect, it } from 'vitest';
import { Rng } from '../engine/rng';
import { BOMBS } from './defs-bombs';
import { explode } from './combat';
import { WORLD } from './constants';
import { UNITS } from './defs-units';
import { zoneAt } from './no-fire';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import {
	ARMY_CAP,
	CAPTURE_RADIUS,
	CAPTURE_RATE,
	checkpointLayout,
	GROUP_INTERVAL,
	HQ_HP,
	planGroup
} from './war';
import { WaveDirector } from './waves';
import type { World } from './world';

const DT = 1 / 30;

function run(w: World, seconds: number, until?: () => boolean): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		if (until?.()) return;
	}
}

/** A war with no reinforcements due for a long while, so tests control who is on the field. */
function war(): World {
	const w = testWorld();
	w.war.start(w, {}, 3);
	w.war.nextGroup = 1e9;
	// Clear the HQ's guns too: tests place what they need.
	w.units.length = 0;
	return w;
}

describe('war layout', () => {
	it('starts with our end of the road ours, the far end theirs, the middle open', () => {
		const w = war();
		const owners = w.war.checkpoints.map((c) => c.owner);
		expect(owners[0]).toBe('player');
		expect(owners.at(-1)).toBe('enemy');
		expect(owners.slice(1, -1).every((o) => o === null)).toBe(true);
		expect(w.war.hq.hp).toBe(HQ_HP);
	});

	it('keeps checkpoints off the river, out of the villages and short of the HQ', () => {
		const w = testWorld();
		const r = w.river!;
		for (const c of checkpointLayout(r.x0, r.bridgeHalf)) {
			expect(Math.abs(c.x - r.x0)).toBeGreaterThan(r.bridgeHalf + CAPTURE_RADIUS);
			expect(zoneAt(c.x)).toBeNull();
			expect(c.x).toBeGreaterThan(WORLD.baseMaxX);
			expect(c.x).toBeLessThan(WORLD.hqMinX - 150);
		}
	});

	it('digs the HQ guns in when the war starts', () => {
		const w = testWorld();
		w.war.start(w, {}, 1);
		const guns = w.units.filter((u) => u.def.isStatic && u.x > WORLD.hqMinX - 250);
		expect(guns.length).toBeGreaterThanOrEqual(3);
	});
});

describe('checkpoints', () => {
	it('falls to whoever stands on it alone, faster with more troops', () => {
		const w = war();
		const cp = w.war.checkpoints[1];
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman', 'rifleman'], cp.x + 10);
		const expected = 1 / (CAPTURE_RATE * 4);
		run(w, expected * 2, () => cp.owner === 'player');
		expect(cp.owner).toBe('player');
		expect(w.war.taken).toBe(1);
		expect(w.war.mostHeld).toBe(2);
	});

	it('does not move while both armies are on it', () => {
		const w = war();
		const cp = w.war.checkpoints[1];
		w.allies.deploy(w, ['rifleman'], cp.x - 10);
		w.spawnUnit('rifleman', cp.x + 10, 0, -1);
		run(w, 1);
		expect(cp.contested).toBe(true);
		expect(cp.hold).toBe(0);
	});

	it('holds an enemy column on a checkpoint until it is theirs, then lets it go on', () => {
		const w = war();
		const cp = w.war.checkpoints[2];
		const u = w.spawnUnit('jeep', cp.x + 30, 0, -1);
		run(w, 4);
		expect(Math.abs(u.x - cp.x)).toBeLessThan(CAPTURE_RADIUS);
		run(w, 30, () => cp.owner === 'enemy');
		expect(cp.owner).toBe('enemy');
		const at = u.x;
		run(w, 3);
		expect(u.x).toBeLessThan(at - 5);
	});

	it('swells enemy waves for each checkpoint they hold, and stages them at the foremost one', () => {
		const w = war();
		const before = w.war.enemyBudgetScale();
		w.war.checkpoints[2].owner = 'enemy';
		expect(w.war.enemyBudgetScale()).toBeGreaterThan(before);
		expect(w.war.enemyStaging()).toBeLessThan(w.war.checkpoints[2].x + 100);
		expect(w.war.enemyStaging()).toBeGreaterThan(w.war.checkpoints[2].x);
	});
});

describe('enemy HQ', () => {
	it('shrugs off bombs and says so once', () => {
		const w = war();
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		const x = (w.war.hq.x0 + w.war.hq.x1) / 2;
		for (let i = 0; i < 3; i++) explode(w, x, w.ground(x), -20, BOMBS.thunder.blast, 'player');
		expect(w.war.hq.hp).toBe(w.war.hq.maxHp);
		expect(said.filter((t) => t === 'HQ IS HARDENED').length).toBe(1);
	});

	it('falls to troops at the wire', () => {
		const w = war();
		w.war.hq.reset(200);
		w.allies.deploy(w, ['tank', 'tank', 'apc'], w.war.hq.x0 - 90);
		run(w, 60, () => w.war.hq.destroyed);
		expect(w.war.hq.destroyed).toBe(true);
		expect(w.war.hqsDestroyed).toBe(1);
		expect(w.allies.list.every((u) => u.x < w.war.hq.x0)).toBe(true);
	});

	it('is rebuilt stronger on the next front in endless', () => {
		const w = testWorld();
		w.war.start(w, { fronts: true, hqHp: 500 }, 1);
		w.war.nextGroup = 1e9;
		w.war.hq.damage(w, 500);
		run(w, 20, () => w.war.front === 2);
		expect(w.war.front).toBe(2);
		expect(w.war.hq.destroyed).toBe(false);
		expect(w.war.hq.maxHp).toBeGreaterThan(500);
	});

	it('stays down in a campaign mission', () => {
		const w = war();
		w.war.hq.damage(w, w.war.hq.maxHp);
		run(w, 20);
		expect(w.war.hq.destroyed).toBe(true);
		expect(w.war.front).toBe(1);
	});
});

describe('reinforcements', () => {
	it('sends a group from the forward checkpoint on a timer, up to the army cap', () => {
		const w = war();
		w.war.checkpoints[1].owner = 'player';
		w.war.nextGroup = 0.01;
		run(w, 0.1);
		expect(w.allies.alive()).toBeGreaterThan(0);
		const xs = w.allies.list.map((u) => u.x);
		expect(Math.max(...xs)).toBeGreaterThan(w.war.checkpoints[1].x - 40);
		expect(w.war.nextGroup).toBeGreaterThan(GROUP_INTERVAL - 1);
		// Full strength: the next group is skipped.
		while (w.allies.alive() < ARMY_CAP) w.allies.deploy(w, ['rifleman'], 700);
		const n = w.allies.deployed;
		w.war.nextGroup = 0.01;
		run(w, 0.1);
		expect(w.allies.deployed).toBe(n);
	});

	it('forms up at the airfield when the forward checkpoint is under attack', () => {
		const w = war();
		w.war.checkpoints[1].owner = 'player';
		w.spawnUnit('tank', w.war.checkpoints[1].x + 100, 0, -1);
		expect(w.war.forward(w)).toBe(w.war.checkpoints[0]);
	});

	it('is always a smaller army than the enemy fields', () => {
		const rng = new Rng(4);
		for (const wave of [1, 4, 8]) {
			const ours = planGroup(wave, rng).reduce((s, k) => s + UNITS[k].cost, 0);
			const theirs = 70 + wave * 48;
			expect(ours).toBeLessThan(theirs * 0.6);
			expect(planGroup(wave, rng).some((k) => UNITS[k].category !== 'infantry')).toBe(true);
		}
	});
});

describe('rolling waves', () => {
	it('sends the next wave once the last is spent, without wiping it out', () => {
		const w = testWorld();
		const waves = new WaveDirector(2, { rolling: true, last: 1 });
		waves.begin(w, 1);
		for (let t = 0; t < 400 && waves.wave < 2; t += DT) {
			waves.update(w, DT);
			simulateWorld(w, DT, null);
		}
		expect(waves.wave).toBe(2);
		expect(waves.state).not.toBe('complete');
		expect(waves.label).toBe('WAVE 2');
	});
});
