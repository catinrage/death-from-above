import { describe, expect, it } from 'vitest';
import { allyDef } from './allies';
import { COMMANDS, START_FUNDS, type StrikeOrder } from './command';
import { WORLD } from './constants';
import { AIRCRAFT } from './defs-aircraft';
import { AirUnit } from './enemy-air';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import type { AircraftId, Unit } from './types';
import { HQ_HP } from './war';
import { wingProfile } from './wing-profile';
import { nearestFriendly, Wingman } from './wingman';
import type { World } from './world';

const DT = 1 / 30;

function run(w: World, seconds: number, until?: () => boolean): number {
	let t = 0;
	for (; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		if (until?.()) return t;
	}
	return t;
}

/** A command game with no enemy waves: tests place what they need. */
function command(funds = START_FUNDS): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false }, 5);
	w.units.length = 0;
	w.command.start(funds);
	return w;
}

/** An enemy vehicle stalled on the road that can soak up a lot, so a test can watch it get hit. */
function dummy(w: World, kind: Unit['def']['kind'], x: number, hp = 1e5): Unit {
	const u = w.spawnUnit(kind, x, 0);
	u.stun = 1e4;
	u.hp = hp;
	return u;
}

/** Records every message the feed gets. */
function feed(w: World): string[] {
	const out: string[] = [];
	const events = w.events;
	w.events = {
		...events,
		message: (text: string, sub?: string, tone?: 'info' | 'warn' | 'good') => {
			out.push(text);
			events.message(text, sub, tone);
		}
	};
	return out;
}

describe('new ground orders', () => {
	it('sends the bigger groups up the road whole', () => {
		const w = command(1e4);
		for (const id of ['platoon', 'apc', 'column'] as const)
			expect(w.command.order(w, id)).toBeNull();
		run(w, 30);
		const sent =
			COMMANDS.platoon.units!.length + COMMANDS.apc.units!.length + COMMANDS.column.units!.length;
		expect(w.allies.deployed).toBe(sent);
		expect(w.allies.list.filter((u) => u.def.kind === 'apc').length).toBe(2);
	});

	it('fields our own Behemoth as a plain (if huge) tank, not a boss', () => {
		const w = command(5000);
		expect(w.command.order(w, 'behemoth')).toBeNull();
		run(w, 3);
		const b = w.allies.list.find((u) => u.def.kind === 'superTank');
		expect(b).toBeDefined();
		expect(b!.def.boss).toBe(false);
		expect(allyDef('superTank').hp).toBeGreaterThan(allyDef('tank').hp * 3);
	});

	it('has the SAM battery shoot radar missiles at enemy aircraft from far off', () => {
		const w = command(2000);
		w.allies.deploy(w, ['sam'], 1200);
		const bandit = new AirUnit(w.newId(), 'heli', 1900, w.ground(1900) + 120);
		w.air.push(bandit);
		run(w, 25, () => bandit.hp < bandit.maxHp);
		expect(bandit.hp).toBeLessThan(bandit.maxHp);
	});

	it('has the howitzers shell targets most of a kilometre ahead', () => {
		const w = command(2000);
		w.allies.deploy(w, ['artillery', 'artillery'], 1000);
		const site = w.spawnUnit('flak', 1950, -11);
		run(w, 40, () => site.hp < site.def.hp);
		expect(site.hp).toBeLessThan(site.def.hp);
	});
});

describe('kamikaze drones', () => {
	it('sends an FPV swarm that flies into the vehicles at the front', () => {
		const w = command(2000);
		const front = w.command.front(w);
		const tanks = [front + 150, front + 260].map((x) => dummy(w, 'tank', x, 200));
		expect(w.command.order(w, 'fpv')).toBeNull();
		expect(w.drones.length).toBe(COMMANDS.fpv.count);
		run(w, 90, () => tanks.every((t) => !t.alive));
		expect(tanks.every((t) => !t.alive)).toBe(true);
		expect(w.drones.length).toBeLessThan(COMMANDS.fpv.count!);
	});

	it('sends delta drones that cruise high and dive on the target', () => {
		const w = command(2000);
		const front = w.command.front(w);
		const site = dummy(w, 'sam', front + 200);
		w.command.order(w, 'delta');
		let high = 0;
		run(w, 120, () => {
			for (const d of w.drones) high = Math.max(high, d.y - w.ground(d.x));
			return site.hp < 1e5;
		});
		expect(high).toBeGreaterThan(100);
		expect(site.hp).toBeLessThan(1e5);
	});

	it('draws enemy fire like any of our aircraft, and dies to it', () => {
		const w = command(2000);
		w.command.order(w, 'delta');
		const d = w.drones[0];
		expect(nearestFriendly(w, d.x + 30, d.y)).toBe(d);
		d.hit(w, 1e3);
		expect(d.alive).toBe(false);
		run(w, 0.1);
		expect(w.drones.includes(d)).toBe(false);
	});

	it('will not dive on an enemy tangled up with our own troops', () => {
		const w = command(2000);
		const front = w.command.front(w);
		const tank = dummy(w, 'tank', front + 100);
		w.allies.deploy(w, ['rifleman'], front + 104);
		w.allies.list[0].stun = 1e4;
		w.command.order(w, 'fpv');
		run(w, 30);
		// Our rifleman plinks at it, but no drone dives in on top of him.
		expect(w.drones.some((d) => d.target === tank)).toBe(false);
		expect(w.drones.length).toBe(COMMANDS.fpv.count);
		expect(w.allies.list[0].alive).toBe(true);
	});
});

describe('every aircraft as an AI pilot', () => {
	const ids = Object.keys(AIRCRAFT) as AircraftId[];

	it.each(ids)('%s flies its tactic and hurts the enemy near the front', (id) => {
		const w = command(1e4);
		const front = w.command.front(w);
		const foes = [front + 120, front + 200, front + 280].map((x, i) =>
			dummy(w, i === 1 ? 'tank' : 'truck', x)
		);
		expect(w.command.order(w, id)).toBeNull();
		const jet = w.escorts[0];
		expect(jet.profile.tactic).toBe(wingProfile(id).tactic);
		run(w, 70, () => foes.some((u) => u.hp < 1e5));
		expect(Number.isFinite(jet.x) && Number.isFinite(jet.y)).toBe(true);
		expect(jet.x).toBeGreaterThan(WORLD.arenaMinX - 100);
		expect(jet.x).toBeLessThan(WORLD.arenaMaxX + 200);
		expect(foes.some((u) => u.hp < 1e5)).toBe(true);
	});

	it('has the helicopter hover short of its target, low down', () => {
		const w = command(2000);
		const front = w.command.front(w);
		const tank = dummy(w, 'tank', front + 200);
		w.command.order(w, 'apache');
		const helo = w.escorts[0];
		run(w, 40);
		expect(helo.x).toBeLessThan(tank.x);
		expect(helo.y - w.ground(helo.x)).toBeLessThan(120);
		expect(tank.hp).toBeLessThan(1e5);
	});

	it('has the gunship circle high over the front', () => {
		const w = command(2000);
		const front = w.command.front(w);
		dummy(w, 'tank', front + 150);
		w.command.order(w, 'ac130');
		const gunship = w.escorts[0];
		let depth = 0;
		run(w, 60, () => {
			depth = Math.max(depth, Math.abs(gunship.z));
			return false;
		});
		expect(depth).toBeGreaterThan(20);
		expect(gunship.y - w.ground(gunship.x)).toBeGreaterThan(150);
	});
});

describe('rearming and repairs', () => {
	it('sends an aircraft that has used up its ammunition home, then back to the fight', () => {
		const w = command(2000);
		const log = feed(w);
		w.command.order(w, 'f16');
		const jet = w.escorts[0];
		run(w, 3);
		jet.rounds = 0;
		jet.missiles = 0;
		for (const k in jet.rack) jet.rack[k as keyof typeof jet.rack] = 0;
		jet.rockets = 0;
		run(w, 0.1);
		expect(jet.order).toBe('rearm');
		expect(jet.homeFor).toBe('ammo');
		run(w, 120, () => jet.order !== 'rearm');
		expect(jet.order).not.toBe('rearm');
		expect(jet.rounds).toBe(jet.profile.rounds);
		expect(jet.missiles).toBe(jet.profile.missiles);
		expect(log.some((m) => m.endsWith('RTB'))).toBe(true);
		expect(log.some((m) => m.endsWith('BACK IN THE FIGHT'))).toBe(true);
	});

	it('sends a badly damaged aircraft home for repairs', () => {
		const w = command(2000);
		w.command.order(w, 'a10');
		const jet = w.escorts[0];
		run(w, 2);
		jet.hit(w, jet.profile.hp * 0.8);
		run(w, 0.1);
		expect(jet.order).toBe('rearm');
		expect(jet.homeFor).toBe('repair');
		run(w, 120, () => jet.order !== 'rearm');
		expect(jet.hp).toBe(jet.profile.hp);
	});

	it('brings a bomber home once its racks are empty and reloads them', () => {
		const w = command(2000);
		w.command.order(w, 'b1');
		const jet = w.escorts[0];
		run(w, 2);
		for (const k in jet.rack) jet.rack[k as keyof typeof jet.rack] = 0;
		run(w, 0.1);
		expect(jet.order).toBe('rearm');
		run(w, 150, () => jet.order !== 'rearm');
		expect(jet.rack).toEqual(jet.profile.rack);
	});

	it('gives the helicopter its ammunition back while it hovers over the runway', () => {
		const w = command(2000);
		w.command.order(w, 'apache');
		const helo = w.escorts[0];
		run(w, 2);
		helo.missiles = 0;
		helo.rockets = 0;
		helo.rounds = 0;
		run(w, 0.1);
		expect(helo.order).toBe('rearm');
		run(w, 90, () => helo.order !== 'rearm');
		expect(helo.missiles).toBe(helo.profile.missiles);
	});

	it('leaves the player’s own wingman as it was: endless gun, missiles back in the air', () => {
		const w = command(0);
		const wing = new Wingman(1500, w.ground(1500) + 120);
		w.wingman = wing;
		wing.missiles = 0;
		run(w, 12);
		expect(wing.order).not.toBe('rearm');
		expect(wing.missiles).toBeGreaterThan(0);
		expect(wing.rounds).toBe(Infinity);
	});
});

describe('strike timing', () => {
	/** Seconds from the order until the target at x first takes damage. */
	function firstHit(id: StrikeOrder, x: number): { eta: number; hit: number } {
		const w = command(1e4);
		const kind = id === 'ballistic' || id === 'nuke' ? 'flak' : 'tank';
		const u = kind === 'flak' ? w.spawnUnit('flak', x, -11) : dummy(w, 'tank', x);
		u.hp = 1e5;
		const eta = w.command.eta(w, id, x);
		expect(w.command.order(w, id, x)).toBeNull();
		expect(w.command.pending[0].t).toBeCloseTo(eta, 5);
		const hit = run(w, 60, () => u.hp < 1e5);
		return { eta, hit };
	}

	it.each(['cruise', 'ballistic', 'nuke'] as StrikeOrder[])(
		'tells the commander when the %s will land, to within a second',
		(id) => {
			const { eta, hit } = firstHit(id, 1900);
			expect(Math.abs(hit - eta)).toBeLessThan(1);
		}
	);

	it('times the barrage and the carpet to their first rounds landing', () => {
		for (const id of ['barrage', 'carpet'] as StrikeOrder[]) {
			const { eta, hit } = firstHit(id, 1700);
			// The target is hit by the first round near it, a little after the first lands.
			expect(hit).toBeGreaterThan(eta - 0.4);
			expect(hit).toBeLessThan(eta + 2.5);
		}
	});

	it('counts each strike down and forgets it once it has landed', () => {
		const w = command(1e4);
		w.command.order(w, 'ballistic', 1800);
		const t0 = w.command.pending[0].t;
		run(w, 1);
		expect(w.command.pending[0].t).toBeCloseTo(t0 - 1, 0);
		run(w, t0 + 1);
		expect(w.command.pending.length).toBe(0);
	});
});

describe('the enemy commander gets the same orders', () => {
	function both(funds = 1e4): World {
		const w = command(funds);
		w.enemyCommand.start(funds);
		return w;
	}

	it('flies every airframe from its own runway, drawn and named as that aircraft', () => {
		const w = both(1e5);
		const ids = Object.keys(AIRCRAFT) as AircraftId[];
		for (const id of ids) {
			w.enemyCommand.cooldowns[id] = 0;
			for (const a of w.air) a.alive = false;
			w.air.length = 0;
			expect(w.enemyCommand.order(w, id)).toBeNull();
			const jet = w.air[0];
			expect(jet.airframe).toBe(id);
			expect(jet.x).toBeGreaterThan(WORLD.hqMaxX);
			const tactic = wingProfile(id).tactic;
			expect(jet.kind).toBe(
				tactic === 'helo' ? 'heli' : tactic === 'fighter' ? 'fighter' : 'striker'
			);
		}
		// Heavier airframes are tougher than the stock ones.
		for (const a of w.air) a.alive = false;
		w.air.length = 0;
		w.enemyCommand.cooldowns.tu95 = 0;
		w.enemyCommand.order(w, 'tu95');
		expect(w.air[0].maxHp).toBeGreaterThan(110);
	});

	it('has its attack aircraft hit our troops', () => {
		const w = both();
		w.allies.deploy(w, ['tank', 'tank'], 2400);
		for (const u of w.allies.list) u.stun = 1e4;
		w.enemyCommand.order(w, 'b1');
		const hp = () => w.allies.list.reduce((n, u) => n + u.hp, 0);
		const start = hp();
		run(w, 60, () => hp() < start);
		expect(hp()).toBeLessThan(start);
	});

	it('sends kamikaze drones from its own runway at our vehicles', () => {
		const w = both();
		w.allies.deploy(w, ['tank'], 2100);
		const tank = w.allies.list[0];
		tank.stun = 1e4;
		tank.hp = 1e5;
		expect(w.enemyCommand.order(w, 'fpv')).toBeNull();
		expect(w.drones.every((d) => d.side === 'enemy' && d.x > WORLD.hqMaxX)).toBe(true);
		// Theirs are not ours: our count and the enemy's guns leave them alone.
		expect(w.command.drones(w)).toBe(0);
		expect(w.enemyCommand.drones(w)).toBe(COMMANDS.fpv.count);
		expect(w.jets().length).toBe(0);
		run(w, 90, () => tank.hp < 1e5);
		expect(tank.hp).toBeLessThan(1e5);
	});

	it('has our AA shoot their drones down', () => {
		const w = both();
		w.allies.deploy(w, ['spaag', 'spaag'], 2300);
		for (const u of w.allies.list) u.stun = 1e4;
		w.enemyCommand.order(w, 'delta');
		const n = w.drones.length;
		run(w, 90, () => w.drones.length < n);
		expect(w.drones.length).toBeLessThan(n);
	});
});
