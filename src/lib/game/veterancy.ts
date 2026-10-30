import { UNITS } from './defs-units';
import type { Unit } from './types';
import type { World } from './world';

/**
 * Veterancy: ground units that kill earn experience worth what they killed,
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

const rankOf = (u: Unit): number => u.rank ?? 0;

/** What a unit is worth: our own units score nothing in their defs, so use the base unit's. */
const worth = (u: Unit): number => Math.max(10, UNITS[u.def.kind].score);

/** Multiplier on the damage a unit deals. */
export function power(u: Unit): number {
	return 1 + POWER * rankOf(u);
}

/** Multiplier on the damage a unit takes. */
export function toughness(u: Unit): number {
	return 1 / (1 + TOUGH * rankOf(u));
}

/** Multiplier on a unit's reload time. */
export function cadence(u: Unit): number {
	return 1 - CADENCE * rankOf(u);
}

/** Multiplier on how far a unit sees (fog of war). */
export function sight(u: Unit): number {
	return 1 + SIGHT * rankOf(u);
}

/** Experience needed to reach the rank after `rank`, or Infinity at the top. */
export function nextRankXp(u: Unit, rank = rankOf(u)): number {
	return rank >= MAX_RANK ? Infinity : RANK_XP[rank] * worth(u);
}

/**
 * Credits `killer` with `victim`: experience worth the victim, and a
 * promotion (or several) when it has earned one. Kills of its own side earn
 * nothing. Returns the ranks gained.
 */
export function credit(w: World, killer: Unit | null | undefined, victim: Unit): number {
	if (!killer || killer === victim || !killer.alive) return 0;
	const ours = w.allies.list.includes(killer);
	if (ours === w.allies.list.includes(victim)) return 0;
	killer.xp = (killer.xp ?? 0) + worth(victim);
	const before = rankOf(killer);
	let rank = before;
	while (rank < MAX_RANK && killer.xp >= nextRankXp(killer, rank)) rank++;
	if (rank === before) return 0;
	killer.rank = rank;
	killer.hp = Math.min(killer.def.hp, killer.hp + killer.def.hp * PROMOTION_HEAL * (rank - before));
	if (ours) {
		const name = killer.def.name.replace(/^Friendly /, '');
		w.events.message(
			'PROMOTED',
			`${name.charAt(0).toUpperCase()}${name.slice(1)}: now ${RANK_NAMES[rank]}`,
			'good'
		);
	}
	return rank - before;
}
