import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBest, readTrained, writeBest, writeTrained } from './records';

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
