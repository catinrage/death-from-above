const BEST_KEY = 'dfa.best';

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
