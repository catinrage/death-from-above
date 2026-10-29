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
