import { describe, expect, it } from 'vitest';
import {
	AIR_LIMIT,
	ARMY_LIMIT,
	BASE_INCOME,
	BOUNTY,
	CHECKPOINT_INCOME,
	COMMAND_ORDER,
	COMMANDS,
	START_FUNDS
} from './command';
import { CommandAutopilot } from './command-ai';
import { WORLD } from './constants';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { nearestFriendly } from './wingman';
import { HQ_HP } from './war';
import { WaveDirector, warTweaks } from './waves';
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

describe('the order list', () => {
	it('gives every order a price, a hotkey of its own and a one-line tip', () => {
		const codes = new Set<string>();
		for (const id of COMMAND_ORDER) {
			const d = COMMANDS[id];
			expect(d.id).toBe(id);
			expect(d.cost).toBeGreaterThan(0);
			expect(d.tip.length).toBeGreaterThan(10);
			expect(d.tip.length).toBeLessThan(90);
			expect(codes.has(d.code)).toBe(false);
			codes.add(d.code);
			if (d.group === 'ground') expect(d.units?.length).toBeGreaterThan(0);
			if (d.group === 'air') expect(d.aircraft).toBeDefined();
			if (d.group === 'strike') expect(d.radius).toBeGreaterThan(0);
		}
		expect(COMMAND_ORDER.length).toBe(Object.keys(COMMANDS).length);
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
		expect(w.command.order(w, 'fighter')).toBeNull();
		expect(w.escorts.length).toBe(1);
		const jet = w.escorts[0];
		expect(jet.callsign).toBeNull();
		run(w, 2);
		expect(jet.patrol).toBeGreaterThan(WORLD.baseMaxX);
		expect(nearestFriendly(w, jet.x + 50, jet.y)).toBe(jet);
		expect(COMMANDS.fighter.cooldown).toBeGreaterThan(0);
		expect(w.command.order(w, 'fighter')).toBe('cooldown');
	});

	it('flies the strike jet against the air defences first', () => {
		const w = command(2000);
		const sam = w.spawnUnit('sam', 1800, -11);
		w.command.order(w, 'striker');
		expect(w.escorts[0].order).toBe('sams');
		expect(w.escorts[0].target?.unit).toBe(sam);
		expect(w.escorts[0].aircraft).toBe('a10');
	});

	it('keeps at most a few jets up at once and forgets the ones shot down', () => {
		const w = command(1e5);
		for (let i = 0; i < AIR_LIMIT; i++) {
			w.command.cooldowns.fighter = 0;
			expect(w.command.order(w, 'fighter')).toBeNull();
		}
		w.command.cooldowns.fighter = 0;
		expect(w.command.order(w, 'fighter')).toBe('air');
		const lost = w.escorts[0];
		lost.hit(w, 1e4);
		run(w, 20, () => !w.escorts.includes(lost));
		expect(w.escorts.includes(lost)).toBe(false);
		expect(w.command.order(w, 'fighter')).toBeNull();
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

describe('a whole war', () => {
	it('can be won by a commander alone, with no aircraft of their own', () => {
		const w = command();
		w.events = {
			...w.events,
			kill: (_n, score, _x, _y, by) => {
				if (by === 'player') w.command.reward(score);
			}
		};
		const waves = new WaveDirector(3, { tweaks: warTweaks, rolling: true, quietStart: true });
		w.war.start(w, { hqHp: HQ_HP, auto: false }, 3);
		waves.begin(w, 1);
		const ai = new CommandAutopilot();
		for (let t = 0; t < 1500 && !w.war.hq.destroyed && w.base.hp > 0; t += DT) {
			simulateWorld(w, DT, null);
			waves.update(w, DT);
			ai.update(w, DT);
		}
		expect(w.player).toBeNull();
		expect(w.base.hp).toBeGreaterThan(0);
		expect(w.war.hq.destroyed).toBe(true);
	}, 120_000);
});
