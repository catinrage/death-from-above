import { loadProgress } from './campaign';
import { AIRCRAFT, AIRCRAFT_ORDER, type AircraftDef } from './defs-aircraft';
import { capacityOf } from './loadout';
import type { AircraftId } from './types';

/**
 * Persistent progression: credits earned from sorties, spent in the hangar on
 * new airframes and per-aircraft upgrades. Everything here is pure except the
 * load/save pair at the bottom, so other systems (a campaign map, daily
 * challenges) can award credits with `grant` and save the result.
 */

export type UpgradeId = 'armor' | 'engine' | 'payload' | 'flares' | 'guns' | 'missiles';

export interface UpgradeDef {
	id: UpgradeId;
	name: string;
	/** What one level does, shown on the hangar card. */
	blurb: string;
	/** Credits for each level in turn; its length is the max level. */
	costs: readonly number[];
}

export const UPGRADES: readonly UpgradeDef[] = [
	{ id: 'armor', name: 'Armour plating', blurb: '+12% airframe strength', costs: [300, 700, 1400] },
	{ id: 'engine', name: 'Engine tuning', blurb: '+6% thrust and boost', costs: [300, 700, 1400] },
	{ id: 'payload', name: 'Extra racks', blurb: '+10% payload points', costs: [400, 900, 1800] },
	{ id: 'flares', name: 'Flare dispenser', blurb: '+1 flare', costs: [200, 450, 900] },
	{ id: 'guns', name: 'Gun barrels', blurb: '+8% damage, less heat', costs: [300, 700, 1400] },
	{ id: 'missiles', name: 'Missile rails', blurb: '+1 guided missile', costs: [350, 800, 1600] }
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<
	UpgradeId,
	UpgradeDef
>;

/** Levels bought for one aircraft. */
export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

/** Hangar price of each airframe; 0 means it is owned from the start. */
export const AIRCRAFT_PRICE: Record<AircraftId, number> = {
	kestrel: 0,
	grizzly: 0,
	su25: 1200,
	a10: 1800,
	f16: 2200,
	f4: 2600,
	wraith: 3500,
	albatross: 4000,
	b1: 6000,
	mq9: 1500,
	stuka: 1600,
	a1: 2000,
	apache: 3800,
	tu95: 4500,
	ac130: 5000
};

export const STARTERS: readonly AircraftId[] = AIRCRAFT_ORDER.filter(
	(id) => AIRCRAFT_PRICE[id] === 0
);

export interface Progression {
	/** Credits available to spend. */
	credits: number;
	/** Every credit ever earned (never goes down). */
	earned: number;
	/** Airframes the pilot can fly, in hangar order. */
	owned: AircraftId[];
	upgrades: Partial<Record<AircraftId, UpgradeLevels>>;
}

export function newProgression(): Progression {
	return { credits: 0, earned: 0, owned: [...STARTERS], upgrades: {} };
}

/** Whether an upgrade does anything on this airframe (no rails on a missile-less bomber). */
export function upgradeApplies(id: AircraftId, u: UpgradeId): boolean {
	if (u === 'missiles') return AIRCRAFT[id].missiles > 0;
	if (u === 'guns') return AIRCRAFT[id].gun !== null;
	return true;
}

export function levelOf(p: Progression, id: AircraftId, u: UpgradeId): number {
	return p.upgrades[id]?.[u] ?? 0;
}

/** Credits for the next level, or null when maxed out or not fitted to this airframe. */
export function nextCost(p: Progression, id: AircraftId, u: UpgradeId): number | null {
	if (!upgradeApplies(id, u)) return null;
	return UPGRADE_BY_ID[u].costs[levelOf(p, id, u)] ?? null;
}

export function owns(p: Progression, id: AircraftId): boolean {
	return p.owned.includes(id);
}

/** Adds credits (negative or fractional amounts are ignored). */
export function grant(p: Progression, amount: number): Progression {
	const n = Math.floor(amount);
	if (!(n > 0)) return p;
	return { ...p, credits: p.credits + n, earned: p.earned + n };
}

/** Buys an airframe. Returns the same object when it can't be bought. */
export function buyAircraft(p: Progression, id: AircraftId): Progression {
	const price = AIRCRAFT_PRICE[id];
	if (owns(p, id) || p.credits < price) return p;
	return {
		...p,
		credits: p.credits - price,
		owned: AIRCRAFT_ORDER.filter((a) => a === id || p.owned.includes(a))
	};
}

/** Buys the next level of an upgrade. Returns the same object when it can't be bought. */
export function buyUpgrade(p: Progression, id: AircraftId, u: UpgradeId): Progression {
	const cost = nextCost(p, id, u);
	if (cost === null || !owns(p, id) || p.credits < cost) return p;
	const levels = { ...p.upgrades[id], [u]: levelOf(p, id, u) + 1 };
	return { ...p, credits: p.credits - cost, upgrades: { ...p.upgrades, [id]: levels } };
}

/** Extra payload points the racks upgrade adds on top of the stock budget. */
export function payloadBonus(stock: number, levels: UpgradeLevels | undefined): number {
	const lv = levels?.payload ?? 0;
	return lv > 0 ? Math.max(lv * 2, Math.ceil(stock * 0.1 * lv)) : 0;
}

/** Extra payload points this pilot's upgrades give an airframe. */
export function extraPayload(p: Progression, id: AircraftId): number {
	return payloadBonus(capacityOf(id), p.upgrades[id]);
}

/** The airframe as flown with its upgrades. The stock def is never modified. */
export function upgradedDef(def: AircraftDef, levels: UpgradeLevels | undefined): AircraftDef {
	if (!levels) return def;
	const lv = (u: UpgradeId): number => levels[u] ?? 0;
	const armor = 1 + 0.12 * lv('armor');
	const engine = 1 + 0.06 * lv('engine');
	const guns = lv('guns');
	return {
		...def,
		hp: Math.round(def.hp * armor),
		thrust: def.thrust * engine,
		boost: def.boost * engine,
		flares: def.flares + lv('flares'),
		missiles: def.missiles > 0 ? def.missiles + lv('missiles') : 0,
		gun: def.gun && {
			...def.gun,
			damage: def.gun.damage * (1 + 0.08 * guns),
			heatPerShot: def.gun.heatPerShot * (1 - 0.06 * guns)
		}
	};
}

// ------------------------------------------------------------ earning

export interface CreditLine {
	label: string;
	amount: number;
}

export interface CreditAward {
	lines: CreditLine[];
	total: number;
}

function award(lines: CreditLine[]): CreditAward {
	const kept = lines
		.filter((l) => l.amount > 0)
		.map((l) => ({ ...l, amount: Math.floor(l.amount) }));
	return { lines: kept, total: kept.reduce((s, l) => s + l.amount, 0) };
}

/** Credits per star the first time it is earned on a mission. */
export const STAR_CREDITS = 150;

/**
 * A finished campaign mission. Wins pay a base that grows with the mission's
 * place in the campaign, plus a bonus for stars not earned there before, so
 * replays still pay but can't farm the star bonus. Failures pay a little for
 * the damage done.
 */
export function missionCredits(o: {
	index: number;
	won: boolean;
	score: number;
	stars: number;
	prevStars: number;
}): CreditAward {
	if (!o.won) return award([{ label: 'Damage done', amount: o.score / 50 }]);
	const newStars = Math.max(0, o.stars - o.prevStars);
	return award([
		{ label: 'Mission pay', amount: 100 + 60 * o.index },
		{ label: 'Score', amount: o.score / 25 },
		{ label: `New stars ×${newStars}`, amount: newStars * STAR_CREDITS }
	]);
}

/** A finished endless run: score plus a bonus for every wave held. */
export function endlessCredits(o: { score: number; wavesCleared: number }): CreditAward {
	return award([
		{ label: 'Score', amount: o.score / 25 },
		{ label: `Waves held ×${o.wavesCleared}`, amount: o.wavesCleared * 50 }
	]);
}

// ------------------------------------------------------------ storage

const KEY = 'dfa.progression';

/** Accepts a stored progression, dropping anything malformed. */
export function sanitizeProgression(raw: unknown): Progression {
	const out = newProgression();
	if (!raw || typeof raw !== 'object') return out;
	const r = raw as Record<string, unknown>;
	const whole = (v: unknown): number =>
		typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
	out.credits = whole(r.credits);
	out.earned = Math.max(out.credits, whole(r.earned));
	const owned: unknown[] = Array.isArray(r.owned) ? r.owned : [];
	out.owned = AIRCRAFT_ORDER.filter((id) => STARTERS.includes(id) || owned.includes(id));
	if (r.upgrades && typeof r.upgrades === 'object') {
		for (const id of AIRCRAFT_ORDER) {
			const v = (r.upgrades as Record<string, unknown>)[id];
			if (!v || typeof v !== 'object' || !out.owned.includes(id)) continue;
			const levels: UpgradeLevels = {};
			for (const u of UPGRADES) {
				if (!upgradeApplies(id, u.id)) continue;
				const n = Math.min(u.costs.length, whole((v as Record<string, unknown>)[u.id]));
				if (n > 0) levels[u.id] = n;
			}
			if (Object.keys(levels).length) out.upgrades[id] = levels;
		}
	}
	return out;
}

/**
 * Pilots from before progression existed keep the aircraft they were flying
 * and get paid for the stars they already earned.
 */
export function migrateProgression(starsEarned: number, flying: AircraftId): Progression {
	const p = grant(newProgression(), starsEarned * STAR_CREDITS);
	return { ...p, owned: AIRCRAFT_ORDER.filter((id) => STARTERS.includes(id) || id === flying) };
}

/** Reads saved progression. `legacy` is used only when nothing has been saved yet. */
export function loadProgression(legacy?: { stars: number; flying: AircraftId }): Progression {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw === null)
			return legacy ? migrateProgression(legacy.stars, legacy.flying) : newProgression();
		return sanitizeProgression(JSON.parse(raw));
	} catch {
		return newProgression();
	}
}

/** Reads saved progression, migrating an older save's campaign stars and aircraft. */
export function loadOrMigrate(flying: AircraftId): Progression {
	const stars = Object.values(loadProgress()).reduce((s, m) => s + m.stars, 0);
	return loadProgression({ stars, flying });
}

export function saveProgression(p: Progression): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Best-effort: private browsing may block storage.
	}
}
