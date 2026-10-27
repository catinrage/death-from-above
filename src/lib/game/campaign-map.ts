import { MISSIONS, type CampaignProgress, type Mission } from './campaign';
import type { UnitKind } from './types';
import type { WaveTweaks } from './waves';

/**
 * The campaign map: a front line pushed east across a strip of sectors, one
 * mission at a time, and the strike flown behind it before each sortie.
 */

export type StrikeId = 'depot' | 'bridge' | 'radar';

export interface Strike {
	id: StrikeId;
	name: string;
	/** What the bombers go after, on the map and the strike card. */
	target: string;
	/** What it changes about the next mission, in a line. */
	effect: string;
	tweak: (t: WaveTweaks, wave: number) => WaveTweaks;
}

/** Scales the lead weights a mission already sets. */
function lead(t: WaveTweaks, scale: Partial<Record<UnitKind, number>>): WaveTweaks['lead'] {
	const out = { ...t.lead };
	for (const [k, v] of Object.entries(scale) as [UnitKind, number][]) out[k] = (out[k] ?? 1) * v;
	return out;
}

export const STRIKES: Record<StrikeId, Strike> = {
	depot: {
		id: 'depot',
		name: 'Fuel depot',
		target: 'Fuel and ammunition dump',
		effect: 'Fewer tanks and APCs, and every column is smaller',
		tweak: (t) => ({
			...t,
			budget: (t.budget ?? 1) * 0.85,
			lead: lead(t, { tank: 0.5, apc: 0.5 })
		})
	},
	bridge: {
		id: 'bridge',
		name: 'Supply bridge',
		target: 'Rail bridge behind the lines',
		effect: 'Reinforcements are cut off: waves after the first are much lighter',
		tweak: (t, wave) => (wave >= 2 ? { ...t, budget: (t.budget ?? 1) * 0.7 } : t)
	},
	radar: {
		id: 'radar',
		name: 'Radar site',
		target: 'Early-warning radar',
		effect: 'Fewer SAMs and AA guns, and one fewer interceptor and gunship a wave',
		tweak: (t) => ({
			...t,
			lead: lead(t, { sam: 0.4, spaag: 0.5 }),
			airCut: (t.airCut ?? 0) + 1
		})
	}
};

export const STRIKE_IDS = Object.keys(STRIKES) as StrikeId[];

export function isStrike(v: unknown): v is StrikeId {
	return typeof v === 'string' && v in STRIKES;
}

/**
 * The mission as it plays after the strike. Forced units and dug-in
 * emplacements are left alone, so every destroy goal stays reachable.
 */
export function withStrike(m: Mission, strike: StrikeId | null | undefined): Mission {
	if (!strike) return m;
	const s = STRIKES[strike];
	const base = m.waves.tweaks;
	return { ...m, waves: { ...m.waves, tweaks: (wave) => s.tweak(base?.(wave) ?? {}, wave) } };
}

/** The first mission has nothing in front of it to strike yet. */
export function canStrike(missionId: string): boolean {
	return MISSIONS.findIndex((m) => m.id === missionId) > 0;
}

export interface Sector {
	id: string;
	name: string;
	/** Missions fought over this ground, west to east. */
	missions: string[];
}

/** The front, from the home airfield to the enemy's heartland. */
export const SECTORS: readonly Sector[] = [
	{ id: 'home', name: 'Home Ridge', missions: ['first-light'] },
	{ id: 'river', name: 'River Line', missions: ['the-crossing', 'iron-column'] },
	{ id: 'valley', name: 'The Valley', missions: ['flak-alley', 'night-watch'] },
	{ id: 'heights', name: 'Radar Heights', missions: ['wild-weasel', 'contested-skies'] },
	{ id: 'heartland', name: 'Heartland', missions: ['death-from-above'] }
];

export function sectorOf(missionId: string): Sector | undefined {
	return SECTORS.find((s) => s.missions.includes(missionId));
}

/** Missions won in a row from the start: how far the front has moved. */
export function advance(progress: CampaignProgress): number {
	let n = 0;
	while (n < MISSIONS.length && progress[MISSIONS[n].id]) n++;
	return n;
}

/** Where a mission sits along the map, 0 (home) to 1 (enemy rear). */
export function missionX(missionId: string): number {
	const i = MISSIONS.findIndex((m) => m.id === missionId);
	return (i + 0.5) / MISSIONS.length;
}

/** Where the front line runs, 0 to 1: just past the last mission won. */
export function frontX(progress: CampaignProgress): number {
	return advance(progress) / MISSIONS.length;
}

/** The share of the map a sector covers, 0 to 1. */
export function sectorSpan(s: Sector): [number, number] {
	const first = MISSIONS.findIndex((m) => m.id === s.missions[0]);
	return [first / MISSIONS.length, (first + s.missions.length) / MISSIONS.length];
}

export type SectorState = 'held' | 'contested' | 'enemy';

export function sectorState(s: Sector, progress: CampaignProgress): SectorState {
	const [a, b] = sectorSpan(s);
	const f = frontX(progress);
	return f >= b ? 'held' : f >= a ? 'contested' : 'enemy';
}

export type StrikePlan = Partial<Record<string, StrikeId>>;

const KEY = 'dfa.strikes';

export function sanitizeStrikes(raw: unknown): StrikePlan {
	const out: StrikePlan = {};
	if (!raw || typeof raw !== 'object') return out;
	for (const m of MISSIONS) {
		const v = (raw as Record<string, unknown>)[m.id];
		if (isStrike(v) && canStrike(m.id)) out[m.id] = v;
	}
	return out;
}

/** Strike picked for each mission, so a retry keeps the same plan. */
export function loadStrikes(): StrikePlan {
	try {
		return sanitizeStrikes(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
	} catch {
		return {};
	}
}

export function saveStrike(missionId: string, strike: StrikeId | null): StrikePlan {
	const plan = loadStrikes();
	if (strike && canStrike(missionId)) plan[missionId] = strike;
	else delete plan[missionId];
	try {
		localStorage.setItem(KEY, JSON.stringify(plan));
	} catch {
		// Best-effort.
	}
	return plan;
}
