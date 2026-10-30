import { AIRCRAFT } from './defs-aircraft';
import { UNITS } from './defs-units';
import type { AircraftId, Unit } from './types';
import type { Side } from './war';
import type { World } from './world';

/**
 * Veterancy: ground units and jets that kill earn experience worth what they killed,
 * and climb up to five ranks. Each rank makes a unit tougher (it shrugs off
 * more of every hit, and is patched up on promotion), hit harder, reload
 * faster and see further. Experience is measured against the unit's own
 * worth, so a rifleman is a veteran after a kill or two while a tank has to
 * earn its stripes against armour.
 */

export const MAX_RANK = 5;
export const RANK_NAMES = [
	'Recruit',
	'Veteran',
	'Hardened',
	'Elite',
	'Heroic',
	'Legendary'
] as const;

/** Experience for each rank, in multiples of the unit's own worth. */
const RANK_XP = [1, 2.5, 4.5, 7, 10] as const;
/** Per rank: less damage taken, more dealt, quicker reloads, further sight. */
const TOUGH = 0.12;
const POWER = 0.12;
const CADENCE = 0.06;
const SIGHT = 0.06;
/** Share of full health patched up on each promotion. */
const PROMOTION_HEAL = 0.25;

/**
 * Anything that fights and can earn rank: a ground unit, or one of the jets
 * (its pilot). Jets say which side they fly for; units are ours if they are
 * in our army.
 */
export interface Veteran {
	xp?: number;
	rank?: number;
	/** Jets: whose they are. */
	readonly side?: Side;
}

/** A jet (or its pilot) is worth this much: what the enemy commander is paid for one. */
export const PILOT_WORTH = 300;
/** Per rank, jets also turn a little tighter. */
const AGILITY = 0.04;

const rankOf = (v: Veteran): number => v.rank ?? 0;

const isUnit = (v: Veteran): v is Unit & Veteran => 'def' in v && 'category' in (v as Unit).def;

/** What it is worth to kill, and what a unit measures its own experience against. */
function worth(v: Veteran): number {
	return isUnit(v) ? Math.max(10, UNITS[v.def.kind].score) : PILOT_WORTH;
}

function sideOf(w: World, v: Veteran): Side {
	if (v.side) return v.side;
	return w.allies.list.includes(v as Unit) ? 'player' : 'enemy';
}

/** Still in the fight: alive and (for a jet) not falling out of the sky. */
function fighting(v: Veteran): boolean {
	const f = v as { alive?: boolean; dying?: boolean };
	return f.alive !== false && !f.dying;
}

/** Patches a promoted unit or jet up by `share` of its full health. */
function heal(v: Veteran, share: number): void {
	const h = v as { hp: number; def?: { hp: number }; maxHp?: number; profile?: { hp: number } };
	const full = isUnit(v) ? (v as Unit).def.hp : (h.maxHp ?? h.profile?.hp ?? h.hp);
	h.hp = Math.min(full, h.hp + full * share);
}

/** Multiplier on the damage it deals. */
export function power(v: Veteran): number {
	return 1 + POWER * rankOf(v);
}

/** Multiplier on the damage it takes. */
export function toughness(v: Veteran): number {
	return 1 / (1 + TOUGH * rankOf(v));
}

/** Multiplier on its reload time. */
export function cadence(v: Veteran): number {
	return 1 - CADENCE * rankOf(v);
}

/** Multiplier on how far it sees (fog of war). */
export function sight(v: Veteran): number {
	return 1 + SIGHT * rankOf(v);
}

/** Multiplier on a jet's turn rate. */
export function agility(v: Veteran): number {
	return 1 + AGILITY * rankOf(v);
}

/** Experience needed to reach the rank after `rank`, or Infinity at the top. */
export function nextRankXp(v: Veteran, rank = rankOf(v)): number {
	return rank >= MAX_RANK ? Infinity : RANK_XP[rank] * worth(v);
}

/**
 * Credits `killer` with `victim`: experience worth the victim, and a
 * promotion (or several) when it has earned one. Kills of its own side earn
 * nothing. Returns the ranks gained.
 */
export function credit(w: World, killer: Veteran | null | undefined, victim: Veteran): number {
	if (!killer || killer === victim || !fighting(killer)) return 0;
	const side = sideOf(w, killer);
	if (side === sideOf(w, victim)) return 0;
	killer.xp = (killer.xp ?? 0) + worth(victim);
	const before = rankOf(killer);
	let rank = before;
	while (rank < MAX_RANK && killer.xp >= nextRankXp(killer, rank)) rank++;
	if (rank === before) return 0;
	killer.rank = rank;
	heal(killer, PROMOTION_HEAL * (rank - before));
	if (side === 'player') {
		const who = isUnit(killer)
			? killer.def.name.replace(/^Friendly /, '')
			: `${title((killer as { aircraft: AircraftId }).aircraft)} pilot`;
		w.events.message(
			'PROMOTED',
			`${who.charAt(0).toUpperCase()}${who.slice(1)}: now ${RANK_NAMES[rank]}`,
			'good'
		);
	}
	return rank - before;
}

const title = (id: AircraftId): string => {
	const n = AIRCRAFT[id].name;
	return n.charAt(0) + n.slice(1).toLowerCase();
};
