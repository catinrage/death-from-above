import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BOARD_SIZE,
	placeRun,
	readBest,
	readBoard,
	readTrained,
	saveBoard,
	writeBest,
	writeTrained,
	type EndlessRun
} from './records';

const run = (score: number, wave = 1, date = score): EndlessRun => ({
	score,
	wave,
	kills: 0,
	aircraft: 'kestrel',
	date
});

afterEach(() => vi.unstubAllGlobals());

describe('endless leaderboard', () => {
	it('ranks runs by score and keeps the best few', () => {
		let board: EndlessRun[] = [];
		for (const s of [500, 100, 900, 300, 700]) board = placeRun(board, run(s)).board;
		expect(board.map((r) => r.score)).toEqual([900, 700, 500, 300, 100]);
		const placed = placeRun(board, run(800));
		expect(placed.rank).toBe(2);
		expect(placed.board).toHaveLength(BOARD_SIZE);
		expect(placed.board.at(-1)?.score).toBe(300);
		expect(placeRun(placed.board, run(50)).rank).toBe(0);
	});

	it('breaks score ties by wave reached', () => {
		const { rank } = placeRun([run(500, 3, 1)], run(500, 5, 2));
		expect(rank).toBe(1);
	});

	it('persists through localStorage and degrades without it', () => {
		expect(readBoard()).toEqual([]);
		expect(readBest()).toBe(0);
		expect(readTrained()).toBe(false);
		writeBest(10);
		saveBoard([run(1)]);
		writeTrained();
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		writeBest(1234);
		saveBoard([run(1234, 6)]);
		writeTrained();
		expect(readBest()).toBe(1234);
		expect(readBoard()).toEqual([run(1234, 6)]);
		expect(readTrained()).toBe(true);
		data.set('dfa.endless', JSON.stringify([{ score: 'x' }, run(5)]));
		expect(readBoard()).toEqual([run(5)]);
		data.set('dfa.endless', '{}');
		expect(readBoard()).toEqual([]);
	});
});
