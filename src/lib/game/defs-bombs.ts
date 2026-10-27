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
	mesh: MeshName;
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
		mesh: 'missile',
		drag: 0,
		cooldown: 0,
		blast: { radius: 0, damage: 0, pierce: 0, crater: [0, 0], size: 0, shake: 0 },
		color: '#ff6a3d',
		slot: 15
	}
};

export const BOMB_ORDER: BombId[] = [
	'gp',
	'rockets',
	'gunpod',
	'cluster',
	'napalm',
	'penetrator',
	'guided',
	'arm',
	'chemical',
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
