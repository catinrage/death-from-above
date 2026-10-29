import { clamp } from '../engine/math';
import { AIRCRAFT } from './defs-aircraft';
import { LAUNCHED } from './defs-bombs';
import type { AircraftId, BombId } from './types';

/**
 * How an AI aircraft fights. Fighters and attack jets make gun and missile
 * passes (attack jets go for the ground first and drop bombs on the way);
 * bombers fly level over the target and lay their racks across it; the
 * gunship and the drone circle high over the front, one with aimed guns, the
 * other with missiles; the helicopter hovers off the target and shoots.
 */
export type WingTactic = 'fighter' | 'attack' | 'bomber' | 'gunship' | 'helo' | 'drone';

/**
 * Height a bomber flies its level runs at: the bigger the airframe, the
 * higher, kept clear of the ceiling. Everything else runs in at 150 m.
 */
export function bomberAltitude(id: AircraftId): number {
	return clamp(170 + (AIRCRAFT[id].radius - 6) * 20, 170, 270);
}

/** What an AI aircraft carries and how it flies, drawn from its airframe. */
export interface WingProfile {
	hp: number;
	/** Cruise speed (m/s). */
	cruise: number;
	/** Turn rate in radians per second. */
	turn: number;
	/** Damage per gun round; 0 for airframes that carry no gun. */
	gun: number;
	/** The gun swivels to the target (turrets and side guns) instead of firing along the nose. */
	aimed: boolean;
	/** Rounds burst on impact (the gunship's 40 mm), and a howitzer shell every few seconds. */
	explosive: number;
	heavy: boolean;
	/** Gun rounds carried (and howitzer shells for the gunship); refilled on the runway. */
	rounds: number;
	shells: number;
	missiles: number;
	/** Free-fall bombs, restocked only back at the airfield. */
	rack: Partial<Record<BombId, number>>;
	/** Rocket pods: each one is a ripple of unguided rockets. */
	rockets: number;
	tactic: WingTactic;
}

/** The commander's aircraft are a little tougher-feeling but lighter-hitting than the player's. */
const HP_K = 0.75;
const CRUISE_K = 1.28;
const GUN_K = 0.5;
/** Gun rounds an AI aircraft carries: about thirty bursts, or fifteen of the gunship's 40 mm. */
const ROUNDS = 300;
const EXPLOSIVE_ROUNDS = 60;
const HEAVY_SHELLS = 20;
/** The AI F-16's turn rate; every other airframe turns in proportion to its own. */
const BASE_TURN = 1.9;

/** Ordnance an AI aircraft never carries: launched weapons, the gun pod and the big ones. */
const NOT_RACKED: ReadonlySet<BombId> = new Set<BombId>(['gunpod', 'nuke', 'thunder', ...LAUNCHED]);

export const TACTICS: Record<AircraftId, WingTactic> = {
	kestrel: 'attack',
	wraith: 'fighter',
	grizzly: 'attack',
	albatross: 'bomber',
	a10: 'attack',
	f16: 'fighter',
	su25: 'attack',
	f4: 'fighter',
	b1: 'bomber',
	ac130: 'gunship',
	apache: 'helo',
	mq9: 'drone',
	stuka: 'attack',
	a1: 'attack',
	tu95: 'bomber',
	f22: 'fighter',
	f35: 'attack',
	su24: 'attack',
	su27: 'fighter'
};

export function wingProfile(id: AircraftId): WingProfile {
	const def = AIRCRAFT[id];
	const tactic = TACTICS[id];
	// Only aircraft that make bombing passes carry bombs; the circlers and the hoverer shoot.
	const bombs = tactic === 'fighter' || tactic === 'attack' || tactic === 'bomber';
	const rack: Partial<Record<BombId, number>> = {};
	for (const [bomb, n] of Object.entries(def.loadout) as [BombId, number][])
		if (bombs && !NOT_RACKED.has(bomb) && n > 0) rack[bomb] = n;
	return {
		hp: Math.round(def.hp * HP_K),
		cruise: def.cruise * CRUISE_K,
		turn: BASE_TURN * clamp(def.turnRate / AIRCRAFT.f16.turnRate, 0.45, 1.05),
		gun: def.gun ? def.gun.damage * GUN_K : 0,
		aimed: !!def.gun?.aimed,
		explosive: def.gun?.explosive ?? 0,
		heavy: !!def.gun?.heavy,
		rounds: def.gun ? (def.gun.explosive > 0 ? EXPLOSIVE_ROUNDS : ROUNDS) : 0,
		shells: def.gun?.heavy ? HEAVY_SHELLS : 0,
		missiles: def.missiles,
		rack,
		rockets: def.loadout.rockets ?? 0,
		tactic
	};
}

/** Bombs left in a rack. */
export function rackCount(rack: Partial<Record<BombId, number>>): number {
	let n = 0;
	for (const k in rack) n += rack[k as BombId] ?? 0;
	return n;
}
