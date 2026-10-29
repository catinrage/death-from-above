import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BOARD_SIZE,
	clockTime,
	readBest,
	readTimes,
	readTrained,
	writeBest,
	writeTime,
	writeTrained
} from './records';

afterEach(() => vi.unstubAllGlobals());

describe('records', () => {
	it('persists through localStorage and degrades without it', () => {
		expect(readBest()).toBe(0);
		expect(readTrained()).toBe(false);
		writeBest(10);
		writeTrained();
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		writeBest(1234);
		writeTrained();
		expect(readBest()).toBe(1234);
		expect(readTrained()).toBe(true);
	});
});

describe('command boards', () => {
	function stubStorage(): void {
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
	}

	it('keeps the fastest wins per difficulty and challenge, fastest first', () => {
		stubStorage();
		for (const t of [300, 200, 500, 250, 400, 600, 150]) writeTime('veteran', 'standard', t);
		expect(readTimes('veteran', 'standard')).toEqual([150, 200, 250, 300, 400]);
		expect(readTimes('veteran', 'standard')).toHaveLength(BOARD_SIZE);
		expect(readTimes('legend', 'standard')).toEqual([]);
		expect(readTimes('veteran', 'ground')).toEqual([]);
	});

	it('says where a win placed, or null when it missed the board', () => {
		stubStorage();
		expect(writeTime('elite', 'infantry', 400).rank).toBe(0);
		expect(writeTime('elite', 'infantry', 300).rank).toBe(0);
		expect(writeTime('elite', 'infantry', 350).rank).toBe(1);
		for (let i = 0; i < 3; i++) writeTime('elite', 'infantry', 100 + i);
		expect(writeTime('elite', 'infantry', 999).rank).toBeNull();
	});

	it('formats seconds as a clock', () => {
		expect(clockTime(0)).toBe('0:00');
		expect(clockTime(725.9)).toBe('12:05');
	});
});
