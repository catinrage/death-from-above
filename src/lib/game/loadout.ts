import { AIRCRAFT } from './defs-aircraft';
import { BOMB_ORDER } from './defs-bombs';
import type { AircraftId, BombId } from './types';

export type Loadout = Partial<Record<BombId, number>>;

/** Payload points each round takes on the racks. */
export const WEIGHT: Record<BombId, number> = {
	gp: 1,
	cluster: 2,
	napalm: 2,
	penetrator: 3,
	guided: 2,
	chemical: 2,
	emp: 3,
	cruise: 4,
	ballistic: 5,
	para: 3,
	thunder: 6,
	nuke: 10
};

/** Hard caps per type, whatever the payload left. */
export const MAX_COUNT: Record<BombId, number> = {
	gp: 30,
	cluster: 8,
	napalm: 6,
	penetrator: 4,
	guided: 4,
	chemical: 4,
	emp: 3,
	cruise: 4,
	ballistic: 2,
	para: 3,
	thunder: 2,
	nuke: 1
};

/** What each airframe can physically carry (the stock loadout is always a subset). */
export const ALLOWED: Record<AircraftId, readonly BombId[]> = {
	kestrel: ['gp', 'cluster', 'napalm', 'penetrator', 'guided', 'chemical', 'emp', 'cruise'],
	wraith: ['gp', 'penetrator', 'guided', 'emp', 'cruise', 'nuke'],
	grizzly: ['gp', 'cluster', 'napalm', 'penetrator', 'guided', 'chemical', 'para'],
	albatross: ['gp', 'cluster', 'napalm', 'penetrator', 'chemical', 'ballistic', 'para', 'thunder'],
	a10: ['gp', 'cluster', 'napalm', 'penetrator', 'guided', 'chemical', 'para'],
	f16: ['gp', 'cluster', 'penetrator', 'guided', 'emp', 'cruise'],
	su25: ['gp', 'cluster', 'napalm', 'penetrator', 'guided', 'chemical'],
	f4: ['gp', 'cluster', 'napalm', 'penetrator', 'guided', 'ballistic'],
	b1: ['gp', 'cluster', 'penetrator', 'cruise', 'ballistic', 'thunder', 'nuke']
};

export function weightOf(l: Loadout): number {
	let w = 0;
	for (const id of BOMB_ORDER) w += (l[id] ?? 0) * WEIGHT[id];
	return w;
}

/** Payload budget: exactly what the stock loadout weighs. */
export function capacityOf(id: AircraftId): number {
	return weightOf(AIRCRAFT[id].loadout);
}

export function stockLoadout(id: AircraftId): Loadout {
	return { ...AIRCRAFT[id].loadout };
}

/** Rack order of a loadout's non-empty entries. */
export function carriedOf(l: Loadout): BombId[] {
	return BOMB_ORDER.filter((b) => (l[b] ?? 0) > 0);
}

/** Can one more of `bomb` go on? */
export function canAdd(id: AircraftId, l: Loadout, bomb: BombId): boolean {
	if (!ALLOWED[id].includes(bomb)) return false;
	if ((l[bomb] ?? 0) >= MAX_COUNT[bomb]) return false;
	return weightOf(l) + WEIGHT[bomb] <= capacityOf(id);
}

/** A new loadout with `delta` more (or fewer) of `bomb`, or the same one if not allowed. */
export function adjust(id: AircraftId, l: Loadout, bomb: BombId, delta: number): Loadout {
	const now = l[bomb] ?? 0;
	if (delta > 0 && !canAdd(id, l, bomb)) return l;
	const next = Math.max(0, now + Math.sign(delta));
	if (next === now) return l;
	const out: Loadout = { ...l, [bomb]: next };
	if (next === 0) delete out[bomb];
	return out;
}

/** Accepts a stored loadout only if every entry is legal for the aircraft; otherwise stock. */
export function sanitize(id: AircraftId, raw: unknown): Loadout {
	if (!raw || typeof raw !== 'object') return stockLoadout(id);
	const out: Loadout = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const bomb = k as BombId;
		if (!ALLOWED[id].includes(bomb)) return stockLoadout(id);
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_COUNT[bomb])
			return stockLoadout(id);
		if (v > 0) out[bomb] = v;
	}
	if (weightOf(out) > capacityOf(id) || carriedOf(out).length === 0) return stockLoadout(id);
	return out;
}
