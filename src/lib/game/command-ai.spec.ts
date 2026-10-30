import { describe, expect, it } from 'vitest';
import { COMMANDS, type CommandId } from './command';
import { CommandAutopilot } from './command-ai';
import { DIFFICULTIES, difficultyDef } from './command-setup';
import { testWorld } from './test-world';
import { HQ_HP } from './war';
import { Wingman } from './wingman';
import { wingProfile } from './wing-profile';
import type { World } from './world';

const DT = 1 / 30;

function battle(enemyFunds = 99_999): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false, ourHq: true }, 5);
	w.units.length = 0;
	w.command.start(0);
	w.enemyCommand.start(enemyFunds);
	return w;
}

/** Runs the enemy commander for a while and counts what it ordered. */
function orders(w: World, ai: CommandAutopilot, seconds: number): CommandId[] {
	const out: CommandId[] = [];
	const order = w.enemyCommand.order.bind(w.enemyCommand);
	w.enemyCommand.order = (ww, id, x) => {
		const why = order(ww, id, x);
		if (!why) out.push(id);
		return why;
	};
	for (let t = 0; t < seconds; t += DT) {
		ai.update(w, DT);
		// Cooldowns tick as in a game; the chest stays at a working level, not a fortune.
		w.enemyCommand.update(w, DT);
		w.enemyCommand.funds = 1500;
	}
	return out;
}

describe('the enemy commander', () => {
	it('earns N times our income at difficulty level N', () => {
		DIFFICULTIES.forEach((d, i) => {
			const w = battle(0);
			w.enemyCommand.start(0, { income: d.enemyIncome });
			expect(w.enemyCommand.income(w) / w.command.income(w)).toBeCloseTo(i + 1);
		});
	});

	it('answers our armour with anti-tank units', () => {
		const w = battle();
		w.allies.deploy(w, ['tank', 'tank', 'tank', 'tank', 'lightTank', 'ifv'], 1500);
		const ai = new CommandAutopilot('enemy', 0.5, 1);
		const got = orders(w, ai, 30).filter((id) => COMMANDS[id].group === 'ground');
		const anti = got.filter((id) => ['tankDestroyer', 'antiTank', 'tank', 'ifv'].includes(id));
		expect(got.length).toBeGreaterThan(5);
		expect(anti.length / got.length).toBeGreaterThan(0.7);
	});

	it('answers our infantry with guns that mow it down', () => {
		const w = battle();
		w.allies.deploy(w, Array(20).fill('rifleman'), 1500);
		const ai = new CommandAutopilot('enemy', 0.5, 1);
		const got = orders(w, ai, 30).filter((id) => COMMANDS[id].group === 'ground');
		const anti = got.filter((id) =>
			['mgTeam', 'ifv', 'apc', 'mortars', 'assault', 'lightTank'].includes(id)
		);
		expect(anti.length / got.length).toBeGreaterThan(0.7);
	});

	it('puts fighters up against our aircraft', () => {
		const w = battle();
		for (const id of ['a10', 'f16', 'su25'] as const) {
			const j = new Wingman(1500, w.ground(1500) + 150, {
				aircraft: id,
				callsign: null,
				profile: wingProfile(id),
				autoRearm: true
			});
			w.escorts.push(j);
		}
		const ai = new CommandAutopilot('enemy', 0.5, 1);
		const got = orders(w, ai, 10);
		expect(got.some((id) => ['f22', 'su27', 'f16', 'wraith'].includes(id))).toBe(true);
		expect(got.some((id) => ['sam', 'aa'].includes(id))).toBe(true);
	});

	it('strikes our troops at its own HQ first', () => {
		const w = battle();
		w.allies.deploy(w, ['tank', 'tank', 'apc', 'rifleman', 'rifleman'], w.war.hq.x0 - 60);
		const ai = new CommandAutopilot('enemy', 0.5, 1);
		const strikes: number[] = [];
		const order = w.enemyCommand.order.bind(w.enemyCommand);
		w.enemyCommand.order = (ww, id, x) => {
			const why = order(ww, id, x);
			if (!why && COMMANDS[id].group === 'strike' && x !== undefined) strikes.push(x);
			return why;
		};
		for (let t = 0; t < 3; t += DT) ai.update(w, DT);
		expect(strikes.length).toBeGreaterThan(0);
		expect(Math.abs(strikes[0] - (w.war.hq.x0 - 60))).toBeLessThan(80);
	});

	it('plays sharper the harder the difficulty', () => {
		const skills = DIFFICULTIES.map((d) => d.skill);
		for (let i = 1; i < skills.length; i++) expect(skills[i]).toBeGreaterThan(skills[i - 1]);
		expect(difficultyDef('legend').skill).toBe(1);
	});
});
