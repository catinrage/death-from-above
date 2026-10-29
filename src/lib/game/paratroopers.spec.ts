import { describe, expect, it } from 'vitest';
import { ARMY_LIMIT, COMMANDS, PARA_SQUAD } from './command';
import { challengeDef } from './command-setup';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { HQ_HP } from './war';
import type { World } from './world';

const STEP = 1 / 60;

function commandWorld(): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false }, 5);
	w.units.length = 0;
	w.command.start(99_999);
	w.enemyCommand.start(99_999);
	return w;
}

function run(w: World, seconds: number, until?: () => boolean): void {
	for (let t = 0; t < seconds && !until?.(); t += STEP) simulateWorld(w, STEP, null);
}

describe('paratroopers', () => {
	it('a transport drops a stick of riflemen who land near the spot and join our army', () => {
		const w = commandWorld();
		const spot = 1400;
		const before = w.allies.list.length;
		expect(w.command.order(w, 'para', spot)).toBeNull();
		expect(w.command.flybys[0].aircraft).toBe('ac130');
		let canopies = false;
		const touchdown = new Map<number, number>();
		run(w, 60, () => {
			canopies ||= w.command.jumpers.some((j) => j.chute > 0.9);
			for (const u of w.allies.list.slice(before)) {
				if (touchdown.has(u.id)) continue;
				touchdown.set(u.id, u.x);
				expect(u.y).toBeCloseTo(w.surface.support(u.x, Infinity, u.z), 0);
			}
			return touchdown.size >= PARA_SQUAD && w.command.jumpers.length === 0;
		});
		expect(canopies).toBe(true);
		const landed = w.allies.list.slice(before);
		expect(landed).toHaveLength(PARA_SQUAD);
		for (const u of landed) expect(u.def.kind).toBe('rifleman');
		// They come down across the drop zone the aiming ring shows.
		for (const x of touchdown.values())
			expect(Math.abs(x - spot)).toBeLessThan(COMMANDS.para.radius! + 8);
	});

	it('lands within a few seconds of the countdown it shows', () => {
		const w = commandWorld();
		const spot = 1600;
		const eta = w.command.eta(w, 'para', spot);
		w.command.order(w, 'para', spot);
		let t = 0;
		const before = w.allies.list.length;
		while (w.allies.list.length === before && t < 90) {
			simulateWorld(w, STEP, null);
			t += STEP;
		}
		expect(Math.abs(t - eta)).toBeLessThan(4);
	});

	it('the enemy commander drops theirs onto our side of the road', () => {
		const w = commandWorld();
		expect(w.enemyCommand.order(w, 'para', 2600)).toBeNull();
		run(w, 60, () => w.enemyCommand.jumpers.length === 0 && w.enemyCommand.flybys.length === 0);
		const theirs = w.units.filter((u) => u.alive && u.def.kind === 'rifleman');
		expect(theirs.length).toBeGreaterThanOrEqual(PARA_SQUAD - 1);
		for (const u of theirs) expect(u.dir).toBe(-1);
	});

	it('counts the stick toward the army limit from the moment it is ordered', () => {
		const w = commandWorld();
		const size = w.command.armySize(w);
		w.command.order(w, 'para', 1400);
		expect(w.command.armySize(w)).toBe(size + PARA_SQUAD);
		run(w, 8);
		expect(w.command.armySize(w)).toBe(size + PARA_SQUAD);
	});

	it('is refused when the army has no room for the whole stick', () => {
		const w = commandWorld();
		const squad = COMMANDS.rifles.units!.length;
		// Leave room for one more rifle squad, but not for the whole stick.
		while (w.command.armySize(w) + squad <= ARMY_LIMIT - squad) {
			w.command.order(w, 'rifles');
			w.command.cooldowns.rifles = 0;
		}
		expect(ARMY_LIMIT - w.command.armySize(w)).toBeLessThan(PARA_SQUAD);
		expect(w.command.refusal(w, 'rifles')).toBeNull();
		expect(w.command.refusal(w, 'para')).toBe('army');
	});

	it('is ruled out by the no air power challenge', () => {
		const w = commandWorld();
		const noAir = challengeDef('noAir');
		w.command.start(99_999, { allows: noAir.allows });
		expect(w.command.order(w, 'para', 1400)).toBe('locked');
	});
});
