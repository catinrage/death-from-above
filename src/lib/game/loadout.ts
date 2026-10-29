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
	nuke: 10,
	rockets: 1,
	arm: 3,
	gunpod: 4,
	stick: 2,
	frag: 1,
	skip: 2,
	glide: 3,
	hunter: 3,
	mines: 2,
	cryo: 2,
	tesla: 2
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
	nuke: 1,
	rockets: 8,
	arm: 4,
	gunpod: 1,
	stick: 6,
	frag: 10,
	skip: 6,
	glide: 4,
	hunter: 4,
	mines: 5,
	cryo: 3,
	tesla: 4
};

/** What each airframe can physically carry (the stock loadout is always a subset). */
export const ALLOWED: Record<AircraftId, readonly BombId[]> = {
	kestrel: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'guided',
		'glide',
		'hunter',
		'arm',
		'chemical',
		'cryo',
		'tesla',
		'emp',
		'cruise'
	],
	wraith: [
		'gp',
		'penetrator',
		'guided',
		'glide',
		'hunter',
		'arm',
		'cryo',
		'tesla',
		'emp',
		'cruise',
		'nuke'
	],
	grizzly: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'guided',
		'chemical',
		'cryo',
		'tesla',
		'para'
	],
	albatross: [
		'gp',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'mines',
		'penetrator',
		'glide',
		'chemical',
		'ballistic',
		'para',
		'thunder'
	],
	a10: [
		'gp',
		'rockets',
		'gunpod',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'guided',
		'hunter',
		'chemical',
		'cryo',
		'tesla',
		'para'
	],
	f16: [
		'gp',
		'rockets',
		'gunpod',
		'frag',
		'cluster',
		'penetrator',
		'guided',
		'glide',
		'hunter',
		'arm',
		'cryo',
		'tesla',
		'emp',
		'cruise'
	],
	su25: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'guided',
		'hunter',
		'arm',
		'chemical'
	],
	f4: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'cluster',
		'napalm',
		'skip',
		'penetrator',
		'guided',
		'glide',
		'hunter',
		'arm',
		'ballistic'
	],
	b1: [
		'gp',
		'stick',
		'cluster',
		'mines',
		'penetrator',
		'glide',
		'hunter',
		'cruise',
		'ballistic',
		'thunder',
		'nuke'
	],
	ac130: ['gp', 'frag', 'guided', 'tesla', 'para'],
	apache: [
		'gp',
		'rockets',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'guided',
		'hunter',
		'chemical',
		'tesla'
	],
	mq9: ['guided', 'glide'],
	stuka: ['gp', 'stick', 'frag', 'cluster', 'napalm', 'skip', 'penetrator'],
	a1: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'chemical',
		'cryo',
		'para'
	],
	tu95: [
		'gp',
		'stick',
		'cluster',
		'napalm',
		'mines',
		'penetrator',
		'glide',
		'cruise',
		'thunder',
		'nuke'
	],
	f22: ['gp', 'penetrator', 'guided', 'glide', 'hunter', 'arm', 'cryo', 'emp'],
	f35: [
		'gp',
		'penetrator',
		'guided',
		'glide',
		'hunter',
		'arm',
		'cryo',
		'tesla',
		'emp',
		'cruise',
		'nuke'
	],
	su24: [
		'gp',
		'rockets',
		'gunpod',
		'stick',
		'frag',
		'cluster',
		'napalm',
		'skip',
		'mines',
		'penetrator',
		'guided',
		'hunter',
		'arm',
		'chemical'
	],
	su27: ['gp', 'rockets', 'gunpod', 'frag', 'cluster', 'napalm', 'penetrator']
};

export function weightOf(l: Loadout): number {
	let w = 0;
	for (const id of BOMB_ORDER) w += (l[id] ?? 0) * WEIGHT[id];
	return w;
}

/** Payload budget: what the stock loadout weighs, plus any `extra` points from hangar upgrades. */
export function capacityOf(id: AircraftId, extra = 0): number {
	return weightOf(AIRCRAFT[id].loadout) + extra;
}

export function stockLoadout(id: AircraftId): Loadout {
	return { ...AIRCRAFT[id].loadout };
}

/** Rack order of a loadout's non-empty entries. */
export function carriedOf(l: Loadout): BombId[] {
	return BOMB_ORDER.filter((b) => (l[b] ?? 0) > 0);
}

/** Can one more of `bomb` go on? */
export function canAdd(id: AircraftId, l: Loadout, bomb: BombId, extra = 0): boolean {
	if (!ALLOWED[id].includes(bomb)) return false;
	if ((l[bomb] ?? 0) >= MAX_COUNT[bomb]) return false;
	return weightOf(l) + WEIGHT[bomb] <= capacityOf(id, extra);
}

/** A new loadout with `delta` more (or fewer) of `bomb`, or the same one if not allowed. */
export function adjust(
	id: AircraftId,
	l: Loadout,
	bomb: BombId,
	delta: number,
	extra = 0
): Loadout {
	const now = l[bomb] ?? 0;
	if (delta > 0 && !canAdd(id, l, bomb, extra)) return l;
	const next = Math.max(0, now + Math.sign(delta));
	if (next === now) return l;
	const out: Loadout = { ...l, [bomb]: next };
	if (next === 0) delete out[bomb];
	return out;
}

/** Accepts a stored loadout only if every entry is legal for the aircraft; otherwise stock. */
export function sanitize(id: AircraftId, raw: unknown, extra = 0): Loadout {
	if (!raw || typeof raw !== 'object') return stockLoadout(id);
	const out: Loadout = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const bomb = k as BombId;
		if (!ALLOWED[id].includes(bomb)) return stockLoadout(id);
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_COUNT[bomb])
			return stockLoadout(id);
		if (v > 0) out[bomb] = v;
	}
	if (weightOf(out) > capacityOf(id, extra) || carriedOf(out).length === 0) return stockLoadout(id);
	return out;
}
