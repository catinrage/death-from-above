import type { MeshName } from '../models';
import type { GunSpec } from './defs-aircraft';
import type { BombId } from './types';

export interface BlastSpec {
	radius: number;
	damage: number;
	pierce: number;
	/** Crater radius and depth in metres. */
	crater: [number, number];
	/** Visual scale of the explosion. */
	size: number;
	shake: number;
}

export interface BombDef {
	id: BombId;
	name: string;
	short: string;
	desc: string;
	/** One plain line for new pilots: what it is good for and how to use it. Shown on selection. */
	tip: string;
	mesh: MeshName;
	/** Fraction of gravity cancelled by wings (glide bombs). */
	lift?: number;
	/** Quadratic drag coefficient. */
	drag: number;
	cooldown: number;
	blast: BlastSpec;
	color: string;
	/** Keyboard slot shown in the HUD. */
	slot: number;
}

export const BOMBS: Record<BombId, BombDef> = {
	gp: {
		id: 'gp',
		name: 'GP-250 General Purpose',
		short: 'GP-250',
		desc: 'Reliable high-explosive bomb. Regenerates over time.',
		tip: 'All-rounder. Drop it on anything; it comes back over time.',
		mesh: 'bombGP',
		drag: 0.0009,
		cooldown: 0.28,
		blast: { radius: 15, damage: 150, pierce: 0.45, crater: [5, 1.6], size: 1, shake: 0.35 },
		color: '#e8c45a',
		slot: 1
	},
	cluster: {
		id: 'cluster',
		name: 'CB-12 Cluster',
		short: 'CLUSTER',
		desc: 'Bursts mid-air into a carpet of bomblets. Shreds infantry and trucks.',
		tip: 'Best vs soldiers and trucks. Covers a wide strip.',
		mesh: 'bombCluster',
		drag: 0.0011,
		cooldown: 0.6,
		blast: { radius: 7.5, damage: 70, pierce: 0.3, crater: [2.4, 0.7], size: 0.55, shake: 0.12 },
		color: '#9bd0ff',
		slot: 2
	},
	napalm: {
		id: 'napalm',
		name: 'IN-7 Incendiary',
		short: 'NAPALM',
		desc: 'Splashes a river of fire along the ground. Burns everything it touches.',
		tip: 'Best vs soldiers. Leaves fire burning along your path.',
		mesh: 'bombNapalm',
		drag: 0.0016,
		cooldown: 0.6,
		blast: { radius: 10, damage: 60, pierce: 0.2, crater: [3, 0.4], size: 0.8, shake: 0.25 },
		color: '#ff7a2e',
		slot: 3
	},
	penetrator: {
		id: 'penetrator',
		name: 'BX-900 Bunker Buster',
		short: 'BUSTER',
		desc: 'Hardened penetrator. Digs in before detonating — cracks bunkers and armour.',
		tip: 'Best vs bunkers and tanks. Hit them directly.',
		mesh: 'bombPenetrator',
		drag: 0.0005,
		cooldown: 0.8,
		blast: { radius: 20, damage: 420, pierce: 1, crater: [9, 4.2], size: 1.6, shake: 0.6 },
		color: '#c7a2ff',
		slot: 4
	},
	guided: {
		id: 'guided',
		name: 'LGB-4 Guided',
		short: 'GUIDED',
		desc: 'Glides onto the nearest target below. Precise and devastating.',
		tip: 'Best vs single tanks. Aim near a target and it steers itself.',
		mesh: 'bombGuided',
		drag: 0.0009,
		cooldown: 0.8,
		blast: { radius: 14, damage: 260, pierce: 0.8, crater: [5, 1.8], size: 1.1, shake: 0.4 },
		color: '#ff5a5a',
		slot: 5
	},
	thunder: {
		id: 'thunder',
		name: 'THUNDERCLAP',
		short: 'THUNDER',
		desc: 'Massive thermobaric device. Levels everything in a wide radius. Fly high.',
		tip: 'Huge blast. Drop it, then climb away fast.',
		mesh: 'bombThunder',
		drag: 0.0007,
		cooldown: 2,
		blast: { radius: 70, damage: 1400, pierce: 1, crater: [17, 6], size: 4, shake: 1 },
		color: '#ffffff',
		slot: 6
	},
	chemical: {
		id: 'chemical',
		name: 'CHEMICAL CANISTER',
		short: 'CHEM',
		desc: 'Bursts into a drifting toxic cloud. Deadly to infantry, eats at crews in vehicles.',
		tip: 'Best vs soldiers. Leaves a cloud that drifts with the wind.',
		mesh: 'bombChem',
		drag: 0.0011,
		cooldown: 0.8,
		blast: { radius: 6, damage: 20, pierce: 0, crater: [0, 0], size: 0.35, shake: 0.08 },
		color: '#9ad14a',
		slot: 7
	},
	emp: {
		id: 'emp',
		name: 'EMP BURST',
		short: 'EMP',
		desc: 'Airburst pulse. Kills engines, radar and guidance for seconds; drops helicopters.',
		tip: 'Stops vehicles, radar and helicopters for a while.',
		mesh: 'bombEmp',
		drag: 0.0011,
		cooldown: 1.5,
		blast: { radius: 0, damage: 0, pierce: 0, crater: [0, 0], size: 0, shake: 0.3 },
		color: '#7fd8ff',
		slot: 8
	},
	cruise: {
		id: 'cruise',
		name: 'CRUISE MISSILE',
		short: 'CRUISE',
		desc: 'Hugs the terrain to the target, pops up and dives. Heavy warhead, long reach.',
		tip: 'Long range. Fire it and it flies to the target for you.',
		mesh: 'cruiseMissile',
		drag: 0,
		cooldown: 1.2,
		blast: { radius: 24, damage: 520, pierce: 0.9, crater: [7, 2.4], size: 1.8, shake: 0.5 },
		color: '#c9d1d6',
		slot: 9
	},
	ballistic: {
		id: 'ballistic',
		name: 'BALLISTIC STRIKE',
		short: 'BALLISTIC',
		desc: 'Calls a missile down from space onto the target. Arrives seconds later at Mach 6.',
		tip: 'Mark a target; a missile falls on it a few seconds later.',
		mesh: 'warhead',
		drag: 0,
		cooldown: 3,
		blast: { radius: 42, damage: 1000, pierce: 1, crater: [13, 5], size: 2.8, shake: 0.9 },
		color: '#ff9b3d',
		slot: 10
	},
	para: {
		id: 'para',
		name: 'PARATROOPERS',
		short: 'PARA',
		desc: 'Drops a squad that lands behind the lines and fights the enemy infantry.',
		tip: 'Drops friendly soldiers to fight for you.',
		mesh: 'crates',
		drag: 0,
		cooldown: 2,
		blast: { radius: 0, damage: 0, pierce: 0, crater: [0, 0], size: 0, shake: 0 },
		color: '#d8c38a',
		slot: 11
	},
	nuke: {
		id: 'nuke',
		name: 'TACTICAL NUKE',
		short: 'NUKE',
		desc: 'A small sun. Erases a kilometre of battlefield. Be far away and high up.',
		tip: 'Wipes out everything nearby. Get high and far away first.',
		mesh: 'bombNuke',
		drag: 0.0006,
		cooldown: 4,
		blast: { radius: 150, damage: 4000, pierce: 1, crater: [30, 9], size: 6, shake: 1.6 },
		color: '#fff27a',
		slot: 12
	},
	rockets: {
		id: 'rockets',
		name: 'RP-7 ROCKET POD',
		short: 'ROCKETS',
		desc: 'Ripples seven unguided rockets along the nose. Point, shoot, walk them onto the target.',
		tip: 'Point the nose at the target and fire.',
		mesh: 'missile',
		drag: 0,
		cooldown: 0.65,
		blast: { radius: 6, damage: 70, pierce: 0.55, crater: [2, 0.6], size: 0.45, shake: 0.08 },
		color: '#ffb14a',
		slot: 13
	},
	arm: {
		id: 'arm',
		name: 'ARM-88 ANTI-RADIATION',
		short: 'ARM',
		desc: 'Homes on SAM and radar emitters, but only while they radiate. Shut-down sites are hit where they were last heard.',
		tip: 'Best vs SAM sites. Fire it while they are switched on.',
		mesh: 'missile',
		drag: 0,
		cooldown: 1,
		blast: { radius: 12, damage: 340, pierce: 0.9, crater: [4, 1.3], size: 1, shake: 0.3 },
		color: '#5affc8',
		slot: 14
	},
	gunpod: {
		id: 'gunpod',
		name: 'GP-30 GUN POD',
		short: 'GUN POD',
		desc: 'Heavy 30 mm cannon under the belly. Hold to fire: shreds armour, then overheats.',
		tip: 'Hold to fire. Strong vs armour; let it cool down.',
		mesh: 'missile',
		drag: 0,
		cooldown: 0,
		blast: { radius: 0, damage: 0, pierce: 0, crater: [0, 0], size: 0, shake: 0 },
		color: '#ff6a3d',
		slot: 15
	},
	stick: {
		id: 'stick',
		name: 'ST-6 STICK',
		short: 'STICK',
		desc: 'Six small bombs released one after another. They land in a neat line along your flight path.',
		tip: 'Best vs a column on the road. Fly along it and drop.',
		mesh: 'bombGP',
		drag: 0.0009,
		cooldown: 0.7,
		blast: { radius: 11, damage: 125, pierce: 0.4, crater: [3.4, 1.1], size: 0.7, shake: 0.2 },
		color: '#f0a860',
		slot: 16
	},
	frag: {
		id: 'frag',
		name: 'FR-40 AIRBURST',
		short: 'AIRBURST',
		desc: 'Bursts a few metres above the ground and sprays shrapnel over a wide circle. No crater, no use against armour.',
		tip: 'Best vs soldiers in the open. Wide and quick.',
		mesh: 'bombFrag',
		drag: 0.001,
		cooldown: 0.5,
		blast: { radius: 30, damage: 170, pierce: 0.1, crater: [0, 0], size: 0.9, shake: 0.2 },
		color: '#e0e070',
		slot: 17
	},
	skip: {
		id: 'skip',
		name: 'SK-3 SKIP BOMB',
		short: 'SKIP',
		desc: 'A drum that bounces along the ground or the river, popping on every bounce before the big final blast.',
		tip: 'Drop it low and fast. It bounces forward into targets.',
		mesh: 'bombSkip',
		drag: 0.0012,
		cooldown: 0.6,
		blast: { radius: 16, damage: 260, pierce: 0.6, crater: [5, 1.6], size: 1.1, shake: 0.35 },
		color: '#6fc2b0',
		slot: 18
	},
	glide: {
		id: 'glide',
		name: 'GB-500 GLIDE',
		short: 'GLIDE',
		desc: 'Pops out wings and glides a long way before it lands. Lets you bomb from far outside the flak.',
		tip: 'Drop it from far away and high up. Follow the sight.',
		mesh: 'bombGlide',
		drag: 0.0004,
		lift: 0.8,
		cooldown: 0.9,
		blast: { radius: 17, damage: 300, pierce: 0.7, crater: [5.5, 2], size: 1.2, shake: 0.4 },
		color: '#a8c8ff',
		slot: 19
	},
	hunter: {
		id: 'hunter',
		name: 'HK-4 HUNTER',
		short: 'HUNTER',
		desc: 'Splits into four seekers that each dive onto a different vehicle below.',
		tip: 'Best vs groups of tanks. Drop it over the armour.',
		mesh: 'bombHunter',
		drag: 0.0011,
		cooldown: 1,
		blast: { radius: 6, damage: 330, pierce: 1, crater: [2.6, 1], size: 0.75, shake: 0.2 },
		color: '#ff8fb8',
		slot: 20
	},
	mines: {
		id: 'mines',
		name: 'MN-6 MINEFIELD',
		short: 'MINES',
		desc: 'Scatters six mines on the ground. They wait and blow up under the next enemy to roll over them.',
		tip: 'Drop it on the road ahead of the enemy. They drive into it.',
		mesh: 'bombCluster',
		drag: 0.0011,
		cooldown: 0.8,
		blast: { radius: 7, damage: 300, pierce: 0.85, crater: [2.4, 0.8], size: 0.7, shake: 0.2 },
		color: '#c8b070',
		slot: 21
	},
	cryo: {
		id: 'cryo',
		name: 'CR-1 CRYO',
		short: 'CRYO',
		desc: 'Flash-freezes everything around it. Frozen enemies stop dead and take double damage until they thaw.',
		tip: 'Freeze them first, then hit them with something else.',
		mesh: 'bombCryo',
		drag: 0.0011,
		cooldown: 1,
		blast: { radius: 34, damage: 20, pierce: 0, crater: [0, 0], size: 0, shake: 0.25 },
		color: '#bff4ff',
		slot: 22
	},
	tesla: {
		id: 'tesla',
		name: 'TS-9 TESLA',
		short: 'TESLA',
		desc: 'Lightning jumps from the impact to the nearest enemy, then the next, and the next, up to eight of them.',
		tip: 'Best vs a crowd spread out along the road.',
		mesh: 'bombTesla',
		drag: 0.0011,
		cooldown: 1,
		blast: { radius: 6, damage: 60, pierce: 0.3, crater: [1.5, 0.4], size: 0.4, shake: 0.15 },
		color: '#c49bff',
		slot: 23
	}
};

export const BOMB_ORDER: BombId[] = [
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
	'cruise',
	'ballistic',
	'para',
	'thunder',
	'nuke'
];

/** Ordnance that is launched or called in rather than dropped. */
export const LAUNCHED: ReadonlySet<BombId> = new Set<BombId>([
	'cruise',
	'ballistic',
	'para',
	'rockets',
	'arm'
]);

export const BOMBLET_BLAST = BOMBS.cluster.blast;

/** How many bombs a stick drops, and the gap between them along the ground in metres. */
export const STICK_COUNT = 6;
export const STICK_GAP = 8;
/** Seekers a hunter splits into, and how far from the split point they look for vehicles. */
export const HUNTER_SEEKERS = 4;
export const HUNTER_REACH = 110;
/** Mines a minefield scatters, how long they lie armed, and the trip distance past a hull. */
export const MINE_COUNT = 6;
export const MINE_LIFE = 60;
export const MINE_TRIP = 1.5;
/** Bounces a skip bomb makes before the final blast, and the small blast on each bounce. */
export const SKIP_HOPS = 3;
export const SKIP_POP: BlastSpec = {
	radius: 8,
	damage: 80,
	pierce: 0.4,
	crater: [2, 0.5],
	size: 0.5,
	shake: 0.12
};
/** Airburst height of the frag bomb. */
export const FRAG_FUZE = 7;
/** Cryo: how long the freeze lasts and the damage multiplier while frozen. */
export const FREEZE_TIME = 7;
export const FROZEN_DAMAGE = 2;
/** Tesla: enemies the lightning can jump through, the longest jump and the damage per strike. */
export const TESLA_JUMPS = 8;
export const TESLA_REACH = 32;
export const TESLA_DAMAGE = 190;

/** Unguided rockets: muzzle speed added to the aircraft's, and how many leave one pod per press. */
export const ROCKET_SPEED = 240;
export const ROCKETS_PER_POD = 7;

/**
 * The gun pod: a heavy cannon slung under the belly. Far harder hitting than
 * the built-in guns, but it cooks off its heat budget in a couple of seconds.
 */
export const GUN_POD: GunSpec = {
	rate: 30,
	damage: 30,
	pierce: 0.85,
	speed: 820,
	spread: 0.014,
	heatPerShot: 1.4,
	muzzles: [[1.2, -1.9, 0]],
	tracerEvery: 2,
	color: [12, 5, 1.6],
	explosive: 2.6
};
/** Gun pod heat shed per second, and the level an overheated pod must cool to before it fires again. */
export const POD_COOLING = 20;
export const POD_RESET = 10;
