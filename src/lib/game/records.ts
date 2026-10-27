import type { AircraftId } from './types';

/** One finished endless run on the local leaderboard. */
export interface EndlessRun {
	score: number;
	wave: number;
	kills: number;
	aircraft: AircraftId;
	/** Epoch ms. */
	date: number;
}

const BEST_KEY = 'dfa.best';
const BOARD_KEY = 'dfa.endless';
export const BOARD_SIZE = 5;

export function readBest(): number {
	try {
		return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
	} catch {
		return 0;
	}
}

export function writeBest(v: number): void {
	try {
		localStorage.setItem(BEST_KEY, String(v));
	} catch {
		// Storage may be unavailable (private mode); the best score just won't persist.
	}
}

export function readBoard(): EndlessRun[] {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(BOARD_KEY) ?? '[]');
		if (!Array.isArray(raw)) return [];
		return raw
			.filter(
				(r): r is EndlessRun =>
					!!r &&
					typeof r === 'object' &&
					typeof r.score === 'number' &&
					typeof r.wave === 'number' &&
					typeof r.kills === 'number' &&
					typeof r.aircraft === 'string' &&
					typeof r.date === 'number'
			)
			.slice(0, BOARD_SIZE);
	} catch {
		return [];
	}
}

/**
 * Inserts a run into a leaderboard sorted by score (then wave). Returns the
 * new board and the run's 1-based rank, or 0 when it didn't make the cut.
 */
export function placeRun(
	board: EndlessRun[],
	run: EndlessRun
): { board: EndlessRun[]; rank: number } {
	const next = [...board, run]
		.sort((a, b) => b.score - a.score || b.wave - a.wave || a.date - b.date)
		.slice(0, BOARD_SIZE);
	return { board: next, rank: next.indexOf(run) + 1 };
}

export function saveBoard(board: EndlessRun[]): void {
	try {
		localStorage.setItem(BOARD_KEY, JSON.stringify(board));
	} catch {
		// Best-effort.
	}
}

const TRAINED_KEY = 'dfa.trained';

/** Whether the pilot has finished flight training. */
export function readTrained(): boolean {
	try {
		return localStorage.getItem(TRAINED_KEY) === '1';
	} catch {
		return false;
	}
}

export function writeTrained(): void {
	try {
		localStorage.setItem(TRAINED_KEY, '1');
	} catch {
		// Best-effort.
	}
}
