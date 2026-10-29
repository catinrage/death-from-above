import { describe, expect, it } from 'vitest';
import { COMMANDS, type CommandId } from './command';
import { CHALLENGES, DIFFICULTIES, challengeDef, difficultyDef } from './command-setup';
import { RIVER } from './river';
import { WORLD } from './constants';
import { HQ_HP } from './war';
import { testWorld } from './test-world';

function commandWorld() {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false });
	return w;
}

describe('command setup', () => {
	it('has five difficulties, each harder than the last', () => {
		expect(DIFFICULTIES).toHaveLength(5);
		for (let i = 1; i < DIFFICULTIES.length; i++) {
			const [a, b] = [DIFFICULTIES[i - 1], DIFFICULTIES[i]];
			expect(b.enemyIncome).toBeGreaterThan(a.enemyIncome);
			expect(b.pace).toBeLessThan(a.pace);
		}
	});

	it('pays the enemy by the difficulty', () => {
		const w = commandWorld();
		w.enemyCommand.start(0, { income: difficultyDef('legend').enemyIncome });
		const legend = w.enemyCommand.income(w);
		w.enemyCommand.start(0, { income: difficultyDef('recruit').enemyIncome });
		expect(w.enemyCommand.income(w)).toBeLessThan(legend);
	});

	it('locks the orders a challenge rules out', () => {
		const w = commandWorld();
		const infantry = challengeDef('infantry');
		w.command.start(99_999, { income: infantry.income, allows: infantry.allows });
		expect(w.command.refusal(w, 'rifles')).toBeNull();
		for (const id of ['tank', 'f16', 'fpv', 'barrage'] as CommandId[])
			expect(w.command.order(w, id, 1500)).toBe('locked');
		const ground = challengeDef('ground');
		w.command.start(99_999, { allows: ground.allows });
		expect(w.command.refusal(w, 'tank')).toBeNull();
		expect(w.command.refusal(w, 'nuke')).toBe('locked');
		const noAir = challengeDef('noAir');
		w.command.start(99_999, { allows: noAir.allows });
		expect(w.command.refusal(w, 'barrage')).toBeNull();
		expect(w.command.refusal(w, 'apache')).toBe('locked');
		expect(w.command.refusal(w, 'delta')).toBe('locked');
	});

	it('every challenge still lets troops take the HQ', () => {
		for (const c of CHALLENGES) expect(c.allows(COMMANDS.rifles)).toBe(true);
	});

	it('halves our income on a shoestring', () => {
		const w = commandWorld();
		w.command.start(0);
		const full = w.command.income(w);
		const s = challengeDef('shoestring');
		w.command.start(0, { income: s.income });
		expect(w.command.income(w)).toBeCloseTo(full / 2);
	});
});

describe('the battlefield', () => {
	it('puts the bridge exactly halfway between the two bases', () => {
		const ours = (WORLD.baseMinX + WORLD.baseMaxX) / 2;
		const theirs = (WORLD.enemyBaseMinX + WORLD.enemyBaseMaxX) / 2;
		expect(RIVER.x).toBe((ours + theirs) / 2);
	});
});
