const BEST_KEY = 'dfa.best';
/** Command mode keeps a best score of its own: it plays too differently to share one. */
const COMMAND_BEST_KEY = 'dfa.best.command';

const bestKey = (command: boolean): string => (command ? COMMAND_BEST_KEY : BEST_KEY);

export function readBest(command = false): number {
	try {
		return Number(localStorage.getItem(bestKey(command)) ?? 0) || 0;
	} catch {
		return 0;
	}
}

export function writeBest(v: number, command = false): void {
	try {
		localStorage.setItem(bestKey(command), String(v));
	} catch {
		// Storage may be unavailable (private mode); the best score just won't persist.
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

const TIMES_KEY = 'dfa.command.times';
/** Fastest wins kept on each command board. */
export const BOARD_SIZE = 5;

const boardKey = (difficulty: string, challenge: string): string => `${difficulty}/${challenge}`;

function readBoards(): Record<string, number[]> {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(TIMES_KEY) ?? '{}');
		return raw && typeof raw === 'object' ? (raw as Record<string, number[]>) : {};
	} catch {
		return {};
	}
}

/** The fastest wins (seconds, fastest first) on one difficulty and challenge. */
export function readTimes(difficulty: string, challenge: string): number[] {
	const list = readBoards()[boardKey(difficulty, challenge)];
	if (!Array.isArray(list)) return [];
	return list
		.filter((t) => typeof t === 'number' && Number.isFinite(t) && t > 0)
		.slice(0, BOARD_SIZE);
}

/**
 * Adds a win to its board. Returns the board after it and where the win
 * placed (0 is the record), or null when it was too slow to make the board.
 */
export function writeTime(
	difficulty: string,
	challenge: string,
	seconds: number
): { times: number[]; rank: number | null } {
	const times = [...readTimes(difficulty, challenge), seconds]
		.sort((a, b) => a - b)
		.slice(0, BOARD_SIZE);
	const rank = times.indexOf(seconds);
	try {
		const boards = readBoards();
		localStorage.setItem(
			TIMES_KEY,
			JSON.stringify({ ...boards, [boardKey(difficulty, challenge)]: times })
		);
	} catch {
		// Best-effort, like the best score.
	}
	return { times, rank: rank < 0 ? null : rank };
}

/** "12:05" from seconds. */
export function clockTime(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
