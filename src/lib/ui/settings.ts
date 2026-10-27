import { AIRCRAFT_ORDER } from '../game/defs-aircraft';
import { sanitize, type Loadout } from '../game/loadout';
import { extraPayload, loadProgression } from '../game/progression';
import type { AircraftId } from '../game/types';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface Settings {
	quality: QualityLevel;
	volume: number;
	aircraft: AircraftId;
	/** Hangar loadouts the pilot customised, per aircraft. */
	loadouts: Partial<Record<AircraftId, Loadout>>;
}

const KEY = 'dfa.settings';
const DEFAULTS: Settings = {
	quality: 'high',
	volume: 0.75,
	aircraft: 'kestrel',
	loadouts: {}
};
const QUALITIES: QualityLevel[] = ['low', 'medium', 'high'];
const AIRCRAFT: readonly AircraftId[] = AIRCRAFT_ORDER;

/** Reads persisted settings, falling back to defaults for anything missing or invalid. */
export function loadSettings(): Settings {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
		const r = raw as Record<string, unknown>;
		return {
			quality: QUALITIES.includes(r.quality as QualityLevel)
				? (r.quality as QualityLevel)
				: DEFAULTS.quality,
			volume:
				typeof r.volume === 'number' && r.volume >= 0 && r.volume <= 1 ? r.volume : DEFAULTS.volume,
			aircraft: AIRCRAFT.includes(r.aircraft as AircraftId)
				? (r.aircraft as AircraftId)
				: DEFAULTS.aircraft,
			loadouts: readLoadouts(r.loadouts)
		};
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveSettings(s: Settings): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		// Persisting is best-effort; private browsing may block storage.
	}
}

export function readBestScore(): number {
	try {
		return Number(localStorage.getItem('dfa.best') ?? 0) || 0;
	} catch {
		return 0;
	}
}

function readLoadouts(raw: unknown): Partial<Record<AircraftId, Loadout>> {
	if (!raw || typeof raw !== 'object') return {};
	const out: Partial<Record<AircraftId, Loadout>> = {};
	// Upgraded racks hold more than stock, so check against what this pilot has bought.
	const prog = loadProgression();
	for (const id of AIRCRAFT) {
		const v = (raw as Record<string, unknown>)[id];
		if (v !== undefined) out[id] = sanitize(id, v, extraPayload(prog, id));
	}
	return out;
}
