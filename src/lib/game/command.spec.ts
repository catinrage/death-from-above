import { describe, expect, it } from 'vitest';
import { OUR_SITES, THEIR_SITES } from './base';
import {
	AIR_LIMIT,
	ARMY_LIMIT,
	BASE_INCOME,
	BOUNTY,
	CHECKPOINT_INCOME,
	COMMAND_ORDER,
	COMMAND_TABS,
	COMMANDS,
	ENEMY_INCOME,
	enemyArmy,
	START_FUNDS,
	TAB_KEYS,
	tabOrders
} from './command';
import { AIRCRAFT } from './defs-aircraft';
import type { AircraftId } from './types';
import { CommandAutopilot } from './command-ai';
import { WORLD } from './constants';
import { UNITS } from './defs-units';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { nearestFriendly } from './wingman';
import { HQ_HP } from './war';
import type { World } from './world';

const DT = 1 / 30;

function run(w: World, seconds: number, until?: () => boolean): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		if (until?.()) return;
	}
}

/** A command game with no enemy waves: tests place what they need. */
function command(funds = START_FUNDS): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false }, 5);
	w.units.length = 0;
	w.command.start(funds);
	return w;
}

/** Keeps our units standing at x (they won't stay put for a stun), so a test is about the aim. */
function holdAt(w: World, x: number): boolean {
	w.allies.list.forEach((u, i) => (u.x = x - i * 3));
	return false;
}

describe('the order list', () => {
	it('gives every order a price, a hotkey of its own and a one-line tip', () => {
		// Keys are unique on each page, and the strikes' keys clash with none of them.
		const strikeCodes = new Set<string>();
		for (const id of COMMAND_ORDER)
			if (COMMANDS[id].tab === null) strikeCodes.add(COMMANDS[id].code);
		for (const tab of COMMAND_TABS) {
			const codes = new Set<string>(strikeCodes);
			const page = tabOrders(tab.id);
			expect(page.length).toBeGreaterThan(0);
			expect(page.length).toBeLessThanOrEqual(TAB_KEYS.length);
			for (const id of page) {
				expect(codes.has(COMMANDS[id].code), id).toBe(false);
				codes.add(COMMANDS[id].code);
			}
		}
		for (const id of COMMAND_ORDER) {
			const d = COMMANDS[id];
			expect(d.id).toBe(id);
			expect(d.cost).toBeGreaterThan(0);
			expect(d.tip.length, id).toBeGreaterThan(10);
			expect(d.tip.length, id).toBeLessThan(90);
			if (d.group === 'ground') expect(d.units?.length).toBeGreaterThan(0);
			if (d.group === 'air') expect(d.aircraft).toBe(id);
			if (d.group === 'drone') expect(d.count).toBeGreaterThan(0);
			if (d.group === 'strike') expect(d.radius).toBeGreaterThan(0);
			if (d.units) expect(d.units.length).toBeLessThanOrEqual(ARMY_LIMIT);
		}
		expect(COMMAND_ORDER.length).toBe(Object.keys(COMMANDS).length);
	});

	it('offers every aircraft in the hangar as an air order', () => {
		for (const id of Object.keys(AIRCRAFT) as AircraftId[]) {
			expect(COMMANDS[id]?.group, id).toBe('air');
			expect(COMMANDS[id].tab === 'air' || COMMANDS[id].tab === 'heavy').toBe(true);
		}
	});
});

describe('the war chest', () => {
	it('fills with time and faster for every checkpoint held', () => {
		const w = command(0);
		run(w, 10);
		const held = w.war.held('player');
		expect(w.command.funds).toBeCloseTo((BASE_INCOME + CHECKPOINT_INCOME * held) * 10, -1);
		w.war.checkpoints[1].owner = 'player';
		expect(w.command.income(w)).toBe(BASE_INCOME + CHECKPOINT_INCOME * (held + 1));
	});

	it('pays a share of every kill', () => {
		const w = command(0);
		w.command.reward(200);
		expect(w.command.funds).toBe(200 * BOUNTY);
	});

	it('refuses an order it cannot pay for, and charges for one it can', () => {
		const w = command(COMMANDS.tank.cost - 1);
		expect(w.command.order(w, 'tank')).toBe('funds');
		expect(w.command.queue.length).toBe(0);
		w.command.funds = COMMANDS.tank.cost;
		expect(w.command.order(w, 'tank')).toBeNull();
		expect(w.command.funds).toBe(0);
		expect(w.command.spent).toBe(COMMANDS.tank.cost);
	});

	it('pays nothing and does nothing outside a command game', () => {
		const w = testWorld();
		w.command.reward(500);
		expect(w.command.funds).toBe(0);
		expect(w.command.order(w, 'rifles')).toBe('inactive');
		run(w, 1);
		expect(w.command.funds).toBe(0);
	});
});

describe('ground orders', () => {
	it('sends a paid-for squad up the road from the rally point', () => {
		const w = command(1000);
		const before = w.allies.deployed;
		w.command.order(w, 'rifles');
		w.command.order(w, 'tank');
		run(w, 6);
		expect(w.allies.deployed - before).toBe(COMMANDS.rifles.units!.length + 1);
		expect(w.allies.list.some((u) => u.def.kind === 'tank')).toBe(true);
		expect(w.allies.list.every((u) => u.x > WORLD.baseMaxX)).toBe(true);
	});

	it('lets groups out one at a time so they do not pile up', () => {
		const w = command(5000);
		for (let i = 0; i < 4; i++) w.command.order(w, 'jeep');
		run(w, 0.2);
		expect(w.allies.alive()).toBe(1);
		expect(w.command.queue.length).toBe(3);
		run(w, 8);
		expect(w.allies.alive()).toBe(4);
	});

	it('stops buying once the army is at full strength', () => {
		const w = command(1e6);
		let bought = 0;
		while (w.command.order(w, 'rifles') === null) bought++;
		expect(w.command.order(w, 'rifles')).toBe('army');
		expect(bought * COMMANDS.rifles.units!.length).toBeLessThanOrEqual(ARMY_LIMIT);
	});

	it('sends no reinforcements of its own: the commander buys every unit', () => {
		const w = command(0);
		run(w, 70);
		expect(w.allies.deployed).toBe(0);
	});
});

describe('air orders', () => {
	it('puts a jet up that hunts near the front and is a target for enemy guns', () => {
		const w = command(2000);
		expect(w.command.order(w, 'f16')).toBeNull();
		expect(w.escorts.length).toBe(1);
		const jet = w.escorts[0];
		expect(jet.callsign).toBeNull();
		run(w, 2);
		expect(jet.patrol).toBeGreaterThan(WORLD.baseMaxX);
		expect(nearestFriendly(w, jet.x + 50, jet.y)).toBe(jet);
		expect(COMMANDS.f16.cooldown).toBeGreaterThan(0);
		expect(w.command.order(w, 'f16')).toBe('cooldown');
	});

	it('flies the strike jet against the air defences first', () => {
		const w = command(2000);
		const sam = w.spawnUnit('sam', 1800, -11);
		w.command.order(w, 'a10');
		expect(w.escorts[0].order).toBe('sams');
		expect(w.escorts[0].target?.unit).toBe(sam);
		expect(w.escorts[0].aircraft).toBe('a10');
	});

	it('keeps at most a few jets up at once and forgets the ones shot down', () => {
		const w = command(1e5);
		for (let i = 0; i < AIR_LIMIT; i++) {
			w.command.cooldowns.f16 = 0;
			expect(w.command.order(w, 'f16')).toBeNull();
		}
		w.command.cooldowns.f16 = 0;
		expect(w.command.order(w, 'f16')).toBe('air');
		const lost = w.escorts[0];
		lost.hit(w, 1e4);
		run(w, 20, () => !w.escorts.includes(lost));
		expect(w.escorts.includes(lost)).toBe(false);
		expect(w.command.order(w, 'f16')).toBeNull();
	});
});

describe('strikes', () => {
	it('needs a spot on the battlefield', () => {
		const w = command(1000);
		expect(w.command.order(w, 'barrage')).toBe('target');
		expect(w.command.funds).toBe(1000);
	});

	it('drops a barrage around the spot a moment later', () => {
		const w = command(1000);
		const foes = [1500, 1508, 1516].map((x) => w.spawnUnit('rifleman', x, 0));
		expect(w.command.order(w, 'barrage', 1508)).toBeNull();
		run(w, 0.5);
		expect(foes.every((u) => u.alive)).toBe(true);
		run(w, 6);
		expect(foes.filter((u) => !u.alive).length).toBeGreaterThan(0);
		expect(w.command.order(w, 'barrage', 1508)).toBe('cooldown');
	});

	it('fires the cruise missile from the base at the best target near the spot', () => {
		const w = command(1000);
		const tank = w.spawnUnit('tank', 1900, 0);
		w.command.order(w, 'cruise', 1880);
		expect(w.strikes[0].x).toBeLessThan(WORLD.baseMaxX);
		run(w, 30, () => !tank.alive);
		expect(tank.alive).toBe(false);
	});

	it('brings a ballistic missile down on the spot after its climb', () => {
		const w = command(1000);
		// Dug in, so it is still there when the warhead arrives.
		const site = w.spawnUnit('flak', 2000, -11);
		w.command.order(w, 'ballistic', 2000);
		run(w, 2);
		expect(site.alive).toBe(true);
		run(w, 10, () => !site.alive);
		expect(site.alive).toBe(false);
	});

	it('sends a bomber across that lays its stick over the spot', () => {
		const w = command(1000);
		const foes = [1700, 1730, 1760].map((x) => w.spawnUnit('jeep', x, 0));
		// Stalled on the road, so the test is about the aim, not the timing.
		for (const u of foes) u.stun = 1e3;
		w.command.order(w, 'carpet', 1730);
		expect(w.command.flybys.length).toBe(1);
		run(w, 25, () => foes.every((u) => !u.alive));
		expect(foes.filter((u) => !u.alive).length).toBeGreaterThanOrEqual(2);
		run(w, 30, () => w.command.flybys.length === 0);
		expect(w.command.flybys.length).toBe(0);
	});

	it('cannot touch the enemy HQ: only troops can', () => {
		const w = command(5000);
		w.command.order(w, 'ballistic', (w.war.hq.x0 + w.war.hq.x1) / 2);
		run(w, 10);
		expect(w.war.hq.hp).toBe(HQ_HP);
	});

	it('hurts our own troops too', () => {
		const w = command(1000);
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman'], 1500);
		w.command.order(w, 'ballistic', 1497);
		run(w, 10);
		expect(w.allies.friendlyKills).toBeGreaterThan(0);
	});
});

describe('launch sites', () => {
	it('fires each strike from its own site on the airfield', () => {
		const w = command(5000);
		w.command.order(w, 'cruise', 1800);
		expect(Math.abs(w.strikes[0].x - OUR_SITES.launcher)).toBeLessThan(8);
		w.command.order(w, 'ballistic', 1900);
		expect(w.strikes[1].x).toBe(OUR_SITES.silo);
		expect(w.strikes[1].z).toBe(OUR_SITES.z);
	});

	it('sends the bomber off our runway, climbing toward the target', () => {
		const w = command(1000);
		w.command.order(w, 'carpet', 1800);
		const f = w.command.flybys[0];
		expect(f.x).toBeGreaterThan(WORLD.runwayMinX);
		expect(f.x).toBeLessThan(WORLD.runwayMaxX);
		const y0 = f.y;
		run(w, 3);
		expect(f.y).toBeGreaterThan(y0 + 30);
	});
});

describe('the enemy commander', () => {
	/** A command game with the enemy's side running too, and no units yet. */
	function both(funds = START_FUNDS): World {
		const w = command(funds);
		w.enemyCommand.start(funds);
		return w;
	}

	it('fills its war chest the same way, a little faster to make up for weaker troops', () => {
		const w = both(0);
		const held = w.war.held('enemy');
		expect(w.enemyCommand.income(w)).toBeCloseTo(
			(BASE_INCOME + CHECKPOINT_INCOME * held) * ENEMY_INCOME
		);
		w.allies.deploy(w, ['tank'], 1500);
		w.allies.list[0].hp = 0;
		run(w, DT);
		expect(w.enemyCommand.funds).toBeGreaterThan(UNITS.tank.score * BOUNTY * 0.99);
	});

	it('sends what it buys down the road toward our airfield', () => {
		const w = both(1000);
		expect(w.enemyCommand.order(w, 'tank')).toBeNull();
		expect(w.enemyCommand.order(w, 'rifles')).toBeNull();
		run(w, 6);
		const theirs = w.units.filter((u) => u.alive && !u.def.isStatic);
		expect(theirs.length).toBe(5);
		expect(theirs.every((u) => u.dir === -1 && u.x > WORLD.hqMinX - 400)).toBe(true);
		expect(enemyArmy(w)).toBe(5);
		expect(w.allies.alive()).toBe(0);
	});

	it('scrambles jets from its own runway that go after our troops', () => {
		const w = both(2000);
		w.allies.deploy(w, ['spaag', 'rifleman', 'rifleman'], 2000);
		expect(w.enemyCommand.order(w, 'a10')).toBeNull();
		const jet = w.air[0];
		expect(jet.kind).toBe('striker');
		expect(jet.role).toBe('sams');
		expect(jet.x).toBeGreaterThan(WORLD.hqMaxX);
		expect(jet.vx).toBeLessThan(0);
		const spaag = w.allies.list.find((u) => u.def.kind === 'spaag')!;
		// The AA gun shoots back: keep the test about the jet finding it.
		spaag.hp = 30;
		jet.hp = 1e4;
		run(w, 60, () => holdAt(w, 2000) || !spaag.alive);
		expect(spaag.alive).toBe(false);
	});

	it('flies its fighter at our jets first', () => {
		const w = both(5000);
		w.command.order(w, 'f16');
		w.enemyCommand.order(w, 'f16');
		const bandit = w.air[0];
		const ours = w.escorts[0];
		// Our jet is within reach of theirs, though their own front is far off.
		ours.x = bandit.x - 700;
		ours.y = bandit.y;
		expect(bandit.kind).toBe('fighter');
		expect(w.enemyCommand.airborne(w)).toBe(1);
		let closest = Infinity;
		run(w, 40, () => {
			closest = Math.min(closest, Math.hypot(bandit.x - ours.x, bandit.y - ours.y));
			return closest < 300;
		});
		expect(closest).toBeLessThan(300);
	});

	it('shells our troops from its own battery', () => {
		const w = both(1000);
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman'], 1500);
		expect(w.enemyCommand.order(w, 'barrage', 1496)).toBeNull();
		expect(w.allies.alive()).toBe(3);
		run(w, 14, () => holdAt(w, 1500) || w.allies.alive() === 0);
		expect(w.allies.lost).toBeGreaterThan(0);
		expect(w.allies.friendlyKills).toBe(0);
	});

	it('fires cruise missiles from its launcher at our best target', () => {
		const w = both(1000);
		w.allies.deploy(w, ['tank'], 1900);
		const tank = w.allies.list[0];
		w.enemyCommand.order(w, 'cruise', 1880);
		expect(Math.abs(w.strikes[0].x - THEIR_SITES.launcher)).toBeLessThan(8);
		run(w, 40, () => holdAt(w, 1900) || !tank.alive);
		expect(tank.alive).toBe(false);
	});

	it('cannot touch our airfield from the air either', () => {
		const w = both(5000);
		w.enemyCommand.order(w, 'ballistic', 200);
		run(w, 10);
		expect(w.base.hp).toBe(w.base.maxHp);
	});
});

describe('a whole war', () => {
	it('between two commanders: both sides fight it out with troops, jets and strikes', () => {
		const w = command();
		w.enemyCommand.start();
		let theirLosses = 0;
		w.events = {
			...w.events,
			kill: (_n, score, _x, _y, by) => {
				if (by !== 'player') return;
				theirLosses++;
				w.command.reward(score);
			}
		};
		const ours = new CommandAutopilot('player');
		const theirs = new CommandAutopilot('enemy');
		const spent = { ground: 0, air: 0, drone: 0, strike: 0 };
		const order = w.enemyCommand.order.bind(w.enemyCommand);
		w.enemyCommand.order = (ww, id, x) => {
			const why = order(ww, id, x);
			if (!why) spent[COMMANDS[id].group]++;
			return why;
		};
		for (let t = 0; t < 600 && !w.war.hq.destroyed && w.base.hp > 0; t += DT) {
			simulateWorld(w, DT, null);
			ours.update(w, DT);
			theirs.update(w, DT);
		}
		expect(w.player).toBeNull();
		// The enemy used every kind of order, not just troops.
		expect(spent.ground).toBeGreaterThan(10);
		expect(spent.air).toBeGreaterThan(0);
		expect(spent.strike).toBeGreaterThan(0);
		expect(w.allies.lost).toBeGreaterThan(10);
		expect(theirLosses).toBeGreaterThan(10);
	}, 180_000);
});
