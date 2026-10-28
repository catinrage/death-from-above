import type { MeshName } from '../models';
import type { GearLayout } from './gear';
import type { AircraftId, BombId, Vec3T } from './types';

export interface GunSpec {
	/** Rounds per second. */
	rate: number;
	damage: number;
	/** Fraction of armour this round ignores. */
	pierce: number;
	speed: number;
	spread: number;
	heatPerShot: number;
	muzzles: Vec3T[];
	tracerEvery: number;
	color: [number, number, number];
	/** Explosive rounds make small blasts on impact. */
	explosive: number;
	/** Turret or side-firing guns: they aim at the reticle instead of along the nose. */
	aimed?: boolean;
	/** A heavy gun (the gunship's howitzer) that fires a shell every `every` seconds of trigger. */
	heavy?: { every: number; speed: number; muzzle: Vec3T };
}

/**
 * How the airframe moves: wings that need airspeed, a rotor that can hover
 * and land anywhere, or a gunship's fixed left-hand orbit around a point.
 */
export type FlightModel = 'fixed' | 'rotor' | 'orbit';

export interface AircraftDef {
	id: AircraftId;
	name: string;
	role: string;
	blurb: string;
	/** What it does best and where it struggles, shown on the hangar card. */
	pros: readonly string[];
	cons: readonly string[];
	mesh: MeshName;
	scale: number;
	props: Vec3T[];
	hp: number;
	thrust: number;
	boost: number;
	drag: number;
	lift: number;
	turnRate: number;
	stallSpeed: number;
	cruise: number;
	/** Fixed wing unless set. */
	flight?: FlightModel;
	/** Forward guns; null for airframes that carry none (the drone, the Bear). */
	gun: GunSpec | null;
	loadout: Partial<Record<BombId, number>>;
	/** Seconds to regenerate one general-purpose bomb. */
	regen: number;
	/** Guided air-to-ground missiles carried (restocked at the airfield). */
	missiles: number;
	hardpoints: Vec3T[];
	flares: number;
	/** Multiplier on enemy lock time (stealth > 1). */
	stealth: number;
	engine: 'jet' | 'prop' | 'rotor';
	/** Pairs of propellers on each hub that turn in opposite directions. */
	contra?: boolean;
	/** Main and tail rotor hubs (local space) and the rotor mesh scale. */
	rotor?: { main: Vec3T; tail: Vec3T; size: number };
	/** Dive bomber: a siren howls and dive brakes hold `limit` m/s in a steep dive. */
	dive?: { limit: number };
	exhaust: Vec3T[];
	radius: number;
	/** Bombs dropped per trigger pull (bombers ripple-release). */
	salvo: number;
	/** Tail gunner that engages enemy aircraft and missiles. */
	tailGun: boolean;
	/** Where the tail gunner's muzzle sits (local space). */
	tailGunAt?: Vec3T;
	stats: { speed: number; armor: number; payload: number; agility: number };
	/** How the boost looks: afterburner flame, rocket bottles, cold plasma or a smoky push. */
	boostFx: BoostFx;
	/** Wingtip in local space (x, y, half-span) for the navigation lights. */
	tip: Vec3T;
	/** Real-world type this is modelled on, shown on the hangar card. */
	real?: string;
	/** Undercarriage legs (fixed wing); sized from `radius` when left out. */
	gear?: GearLayout;
}

export type BoostFx = 'afterburner' | 'plasma' | 'rocket' | 'smoke' | 'smokyBurner';

export const AIRCRAFT: Record<AircraftId, AircraftDef> = {
	kestrel: {
		id: 'kestrel',
		name: 'KESTREL',
		role: 'Multirole fighter-bomber',
		blurb: 'Fast and forgiving. Twin cannons and a balanced bomb rack.',
		pros: ['Forgiving handling', 'Carries almost every store', 'Fast enough to run'],
		cons: ['Average armour', 'Jack of all trades'],
		mesh: 'kestrel',
		scale: 1,
		props: [],
		hp: 140,
		thrust: 26,
		boost: 22,
		drag: 0.0042,
		lift: 2.6,
		turnRate: 2.3,
		stallSpeed: 38,
		cruise: 74,
		gun: {
			rate: 14,
			damage: 9,
			pierce: 0.12,
			speed: 720,
			spread: 0.012,
			heatPerShot: 1.5,
			muzzles: [
				[1.6, -0.2, 0.95],
				[1.6, -0.2, -0.95]
			],
			tracerEvery: 2,
			color: [9, 6.5, 2.2],
			explosive: 0
		},
		loadout: { gp: 8, stick: 2, cluster: 3, napalm: 2, guided: 2, tesla: 2, emp: 1, cruise: 1 },
		regen: 2.4,
		missiles: 6,
		hardpoints: [
			[-0.4, -0.62, 2.0],
			[-0.4, -0.62, -2.0],
			[-0.8, -0.62, 3.2],
			[-0.8, -0.62, -3.2]
		],
		flares: 6,
		stealth: 1,
		engine: 'jet',
		exhaust: [[-6.6, 0, 0]],
		radius: 5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.75, armor: 0.45, payload: 0.5, agility: 0.8 },
		boostFx: 'afterburner',
		tip: [-2.1, -0.24, 4.95]
	},
	wraith: {
		id: 'wraith',
		name: 'WRAITH',
		role: 'Stealth striker',
		blurb: 'Radar struggles to lock it. Blistering speed, light payload.',
		pros: ['Hardest to lock', 'Top speed and agility', 'Can carry the nuke'],
		cons: ['Thin skin', 'Small rack, no area weapons'],
		mesh: 'wraith',
		scale: 1,
		props: [],
		hp: 110,
		thrust: 31,
		boost: 26,
		drag: 0.0038,
		lift: 2.8,
		turnRate: 2.5,
		stallSpeed: 42,
		cruise: 84,
		gun: {
			rate: 10,
			damage: 10,
			pierce: 0.15,
			speed: 760,
			spread: 0.01,
			heatPerShot: 2,
			muzzles: [[2.5, -0.1, 0.6]],
			tracerEvery: 2,
			color: [6, 7, 10],
			explosive: 0
		},
		loadout: { gp: 6, penetrator: 2, guided: 3, glide: 2, cryo: 1, emp: 2, nuke: 1 },
		regen: 2.6,
		missiles: 8,
		hardpoints: [
			[-0.6, -0.5, 1.2],
			[-0.6, -0.5, -1.2]
		],
		flares: 4,
		stealth: 2.2,
		engine: 'jet',
		exhaust: [[-6.5, 0, 0]],
		radius: 5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.95, armor: 0.3, payload: 0.4, agility: 0.9 },
		boostFx: 'plasma',
		tip: [-2.1, -0.2, 6.35]
	},
	grizzly: {
		id: 'grizzly',
		name: 'GRIZZLY',
		role: 'Armoured ground attack',
		blurb: 'Soaks up flak. Its 30 mm cannon shreds armour on its own.',
		pros: ['Soaks up flak', '30 mm cannon pierces armour'],
		cons: ['Slow to climb and turn', 'No speed to dodge missiles'],
		mesh: 'grizzly',
		scale: 1,
		props: [],
		hp: 240,
		thrust: 21,
		boost: 16,
		drag: 0.0048,
		lift: 2.3,
		turnRate: 1.95,
		stallSpeed: 33,
		cruise: 62,
		gun: {
			rate: 9,
			damage: 22,
			pierce: 0.45,
			speed: 680,
			spread: 0.015,
			heatPerShot: 2.4,
			muzzles: [[8.0, -0.25, 0]],
			tracerEvery: 1,
			color: [10, 4.2, 1.4],
			explosive: 2.5
		},
		loadout: { gp: 10, frag: 3, cluster: 3, napalm: 3, penetrator: 2, chemical: 2, para: 2 },
		regen: 2.2,
		missiles: 4,
		hardpoints: [
			[0.2, -0.9, 2.2],
			[0.2, -0.9, -2.2],
			[-0.1, -0.9, 3.6],
			[-0.1, -0.9, -3.6],
			[-0.4, -0.9, 5.0],
			[-0.4, -0.9, -5.0]
		],
		flares: 6,
		stealth: 0.9,
		engine: 'jet',
		exhaust: [
			[-5.0, 0.62, 1.37],
			[-5.0, 0.62, -1.37]
		],
		radius: 6,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.55, armor: 0.9, payload: 0.7, agility: 0.55 },
		boostFx: 'rocket',
		tip: [-0.3, -0.2, 7.45]
	},
	albatross: {
		id: 'albatross',
		name: 'ALBATROSS',
		role: 'Heavy bomber',
		blurb: 'Ripple-drops sticks of bombs. A tail gunner guards your six.',
		pros: ['Biggest bomb load', 'Tail gunner covers your six', 'Very tough'],
		cons: ['Barely turns', 'Easy target for SAMs'],
		mesh: 'albatross',
		scale: 0.85,
		props: [
			[3.0, 0.5, 4.6],
			[3.0, 0.5, 9.0],
			[3.0, 0.5, -4.6],
			[3.0, 0.5, -9.0]
		],
		hp: 300,
		thrust: 17,
		boost: 11,
		drag: 0.005,
		lift: 2.0,
		turnRate: 1.45,
		stallSpeed: 30,
		cruise: 54,
		gun: {
			rate: 8,
			damage: 8,
			pierce: 0.1,
			speed: 650,
			spread: 0.02,
			heatPerShot: 1.2,
			muzzles: [[10.6, -0.3, 0]],
			tracerEvery: 2,
			color: [9, 6, 2],
			explosive: 0
		},
		loadout: {
			gp: 18,
			cluster: 5,
			napalm: 4,
			mines: 2,
			chemical: 3,
			para: 2,
			thunder: 2,
			ballistic: 1
		},
		regen: 1.3,
		missiles: 4,
		hardpoints: [],
		flares: 8,
		stealth: 0.7,
		engine: 'prop',
		exhaust: [],
		radius: 9,
		salvo: 3,
		tailGun: true,
		stats: { speed: 0.35, armor: 1, payload: 1, agility: 0.3 },
		boostFx: 'smoke',
		tip: [-0.5, -0.2, 15.05]
	},
	a10: {
		id: 'a10',
		name: 'WARTHOG',
		real: 'A-10C Thunderbolt II',
		role: 'Close air support',
		blurb: 'Built around a seven-barrel 30 mm cannon. Slow, tough and terrifying.',
		pros: ['Armour-shredding cannon', 'Very tough', 'Slow, steady gun runs'],
		cons: ['Slow', 'No anti-radar missiles'],
		mesh: 'a10',
		scale: 0.85,
		props: [],
		hp: 280,
		thrust: 20,
		boost: 15,
		drag: 0.0052,
		lift: 2.6,
		turnRate: 1.9,
		stallSpeed: 30,
		cruise: 58,
		gun: {
			rate: 16,
			damage: 26,
			pierce: 0.55,
			speed: 700,
			spread: 0.02,
			heatPerShot: 1.3,
			muzzles: [[9.2, -0.25, 0]],
			tracerEvery: 1,
			color: [10, 4.5, 1.2],
			explosive: 2.2
		},
		loadout: { gp: 6, cluster: 4, napalm: 2, guided: 2, hunter: 2, cryo: 1, para: 1, rockets: 4 },
		regen: 2.4,
		missiles: 6,
		hardpoints: [
			[-0.6, -0.9, 3.2],
			[-0.6, -0.9, -3.2],
			[-0.4, -0.9, 5.0],
			[-0.4, -0.9, -5.0]
		],
		flares: 8,
		stealth: 0.8,
		engine: 'jet',
		exhaust: [
			[-5.5, 1.15, 1.25],
			[-5.5, 1.15, -1.25]
		],
		radius: 6,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.45, armor: 0.95, payload: 0.65, agility: 0.6 },
		boostFx: 'rocket',
		tip: [-1.0, -0.45, 8.8]
	},
	f16: {
		id: 'f16',
		name: 'VIPER',
		real: 'F-16C Fighting Falcon',
		role: 'Air superiority strike',
		blurb: 'Fly-by-wire agility and a huge afterburner. Light hitter, hard to catch.',
		pros: ['Best agility', 'Huge afterburner', 'Outruns missiles'],
		cons: ['Fragile', 'Light-hitting gun'],
		mesh: 'f16',
		scale: 0.85,
		props: [],
		hp: 120,
		thrust: 30,
		boost: 30,
		drag: 0.0039,
		lift: 2.8,
		turnRate: 2.7,
		stallSpeed: 40,
		cruise: 82,
		gun: {
			rate: 17,
			damage: 8,
			pierce: 0.12,
			speed: 760,
			spread: 0.01,
			heatPerShot: 1.6,
			muzzles: [[3.0, 0.3, 0.6]],
			tracerEvery: 2,
			color: [9, 7, 2.5],
			explosive: 0
		},
		loadout: { gp: 6, cluster: 2, guided: 3, glide: 2, cruise: 2, emp: 1, arm: 2 },
		regen: 2.6,
		missiles: 6,
		hardpoints: [
			[-1.0, -0.6, 2.4],
			[-1.0, -0.6, -2.4],
			[-1.6, -0.5, 3.6],
			[-1.6, -0.5, -3.6]
		],
		flares: 6,
		stealth: 1.1,
		engine: 'jet',
		exhaust: [[-7.9, 0, 0]],
		radius: 5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.95, armor: 0.35, payload: 0.45, agility: 1.0 },
		boostFx: 'afterburner',
		tip: [-3.4, -0.15, 4.75]
	},
	su25: {
		id: 'su25',
		name: 'FROGFOOT',
		real: 'Su-25 Frogfoot',
		role: 'Armoured attack',
		blurb: 'Titanium tub, rugged twin engines and a rack full of dumb, dirty ordnance.',
		pros: ['Rugged armour', 'Heavy dirty ordnance', 'Piercing cannon'],
		cons: ['Middling speed', 'Few missiles'],
		mesh: 'su25',
		scale: 0.85,
		props: [],
		hp: 230,
		thrust: 22,
		boost: 18,
		drag: 0.0049,
		lift: 2.5,
		turnRate: 2.0,
		stallSpeed: 33,
		cruise: 64,
		gun: {
			rate: 11,
			damage: 18,
			pierce: 0.4,
			speed: 690,
			spread: 0.016,
			heatPerShot: 2.0,
			muzzles: [[7.6, -0.6, 0.3]],
			tracerEvery: 1,
			color: [10, 5, 1.6],
			explosive: 1.5
		},
		loadout: {
			gp: 8,
			cluster: 3,
			napalm: 3,
			skip: 2,
			penetrator: 1,
			chemical: 2,
			rockets: 4,
			gunpod: 1
		},
		regen: 2.2,
		missiles: 4,
		hardpoints: [
			[-0.8, -0.4, 2.6],
			[-0.8, -0.4, -2.6],
			[-1.1, -0.4, 4.4],
			[-1.1, -0.4, -4.4]
		],
		flares: 7,
		stealth: 0.9,
		engine: 'jet',
		exhaust: [
			[-5.0, -0.05, 1.15],
			[-5.0, -0.05, -1.15]
		],
		radius: 6,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.6, armor: 0.85, payload: 0.75, agility: 0.6 },
		boostFx: 'afterburner',
		tip: [-1.5, 0.35, 7.2]
	},
	f4: {
		id: 'f4',
		name: 'PHANTOM',
		real: 'F-4E Phantom II',
		role: 'Heavy fighter-bomber',
		blurb: 'Two smoky J79s and a truckload of bombs. Brute force, Vietnam-era style.',
		pros: ['Big rack and fast', 'Carries ballistic stores'],
		cons: ['Heavy in turns', 'Only four missiles'],
		mesh: 'f4',
		scale: 0.8,
		props: [],
		hp: 190,
		thrust: 27,
		boost: 26,
		drag: 0.0047,
		lift: 2.4,
		turnRate: 2.1,
		stallSpeed: 38,
		cruise: 74,
		gun: {
			rate: 12,
			damage: 11,
			pierce: 0.2,
			speed: 720,
			spread: 0.014,
			heatPerShot: 1.6,
			muzzles: [[9.4, -0.5, 0]],
			tracerEvery: 2,
			color: [9, 6.5, 2.2],
			explosive: 0
		},
		loadout: {
			gp: 10,
			cluster: 3,
			napalm: 4,
			skip: 2,
			guided: 1,
			hunter: 1,
			ballistic: 1,
			gunpod: 1
		},
		regen: 2.3,
		missiles: 4,
		hardpoints: [
			[-1.4, -0.9, 2.0],
			[-1.4, -0.9, -2.0],
			[-1.8, -0.8, 3.6],
			[-1.8, -0.8, -3.6]
		],
		flares: 6,
		stealth: 0.95,
		engine: 'jet',
		exhaust: [
			[-9.6, -0.15, 0.55],
			[-9.6, -0.15, -0.55]
		],
		radius: 6,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.8, armor: 0.6, payload: 0.75, agility: 0.65 },
		boostFx: 'smokyBurner',
		tip: [-3.4, -0.4, 6.0]
	},
	b1: {
		id: 'b1',
		name: 'LANCER',
		real: 'B-1B Lancer',
		role: 'Strategic bomber',
		blurb: 'Four afterburning engines, ripple-releases sticks of heavy ordnance. Carries the nuke.',
		pros: ['Huge payload, ripple drops', 'Fast for a bomber', 'Carries the nuke'],
		cons: ['No guided missiles', 'Turns like a ship'],
		mesh: 'b1',
		scale: 0.7,
		props: [],
		hp: 330,
		thrust: 24,
		boost: 24,
		drag: 0.0045,
		lift: 2.1,
		turnRate: 1.5,
		stallSpeed: 36,
		cruise: 72,
		gun: {
			rate: 8,
			damage: 8,
			pierce: 0.1,
			speed: 650,
			spread: 0.02,
			heatPerShot: 1.2,
			muzzles: [[14.0, -0.6, 0]],
			tracerEvery: 2,
			color: [9, 6, 2],
			explosive: 0
		},
		loadout: { gp: 24, stick: 3, cluster: 6, penetrator: 3, cruise: 3, thunder: 2, nuke: 1 },
		regen: 1.2,
		missiles: 0,
		hardpoints: [],
		flares: 10,
		stealth: 1.2,
		engine: 'jet',
		exhaust: [
			[-9.8, -1.3, 2.9],
			[-9.8, -1.3, 1.9],
			[-9.8, -1.3, -1.9],
			[-9.8, -1.3, -2.9]
		],
		radius: 10,
		salvo: 3,
		tailGun: false,
		stats: { speed: 0.75, armor: 0.85, payload: 1.0, agility: 0.35 },
		boostFx: 'afterburner',
		tip: [-9.8, -0.1, 15.5]
	},
	ac130: {
		id: 'ac130',
		name: 'SPECTRE',
		real: 'AC-130H Spectre',
		role: 'Orbiting gunship',
		blurb:
			'Circles the target in a slow left-hand pylon turn while a 40 mm Bofors and a 105 mm howitzer fire out of the port side.',
		pros: ['Very tough', 'Aimed 40 mm and 105 mm guns', 'Most flares'],
		cons: ['Locked into a slow orbit', 'Tiny bomb rack'],
		mesh: 'ac130',
		scale: 0.55,
		flight: 'orbit',
		props: [
			[5.2, 1.4, 5.6],
			[5.2, 1.4, 10.6],
			[5.2, 1.4, -5.6],
			[5.2, 1.4, -10.6]
		],
		hp: 360,
		thrust: 14,
		boost: 30,
		drag: 0.005,
		lift: 2,
		turnRate: 1,
		stallSpeed: 20,
		cruise: 34,
		gun: {
			rate: 3,
			damage: 34,
			pierce: 0.55,
			speed: 520,
			spread: 0.006,
			heatPerShot: 6,
			muzzles: [[-1.5, -0.6, -3.6]],
			tracerEvery: 1,
			color: [10, 6, 2],
			explosive: 4.5,
			aimed: true,
			heavy: { every: 2.6, speed: 330, muzzle: [-6, -0.6, -4.4] }
		},
		loadout: { gp: 2, guided: 3, tesla: 1 },
		regen: 3,
		missiles: 6,
		hardpoints: [],
		flares: 12,
		stealth: 0.6,
		engine: 'prop',
		exhaust: [],
		radius: 9,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.2, armor: 1, payload: 0.4, agility: 0.1 },
		boostFx: 'smoke',
		tip: [-0.5, 1.9, 20]
	},
	apache: {
		id: 'apache',
		name: 'LONGBOW',
		real: 'AH-64D Apache Longbow',
		role: 'Attack helicopter',
		blurb:
			'Hovers, strafes and sets down anywhere. The chin gun tracks your reticle and Hellfires do the rest.',
		pros: ['Hovers and lands anywhere', 'Aimed chin gun', 'Eight Hellfires'],
		cons: ['Slow', 'Small rack'],
		mesh: 'apache',
		scale: 1,
		flight: 'rotor',
		props: [],
		hp: 170,
		thrust: 30,
		boost: 20,
		drag: 0.004,
		lift: 2,
		turnRate: 2,
		stallSpeed: 0,
		cruise: 46,
		gun: {
			rate: 10,
			damage: 15,
			pierce: 0.35,
			speed: 640,
			spread: 0.014,
			heatPerShot: 1.8,
			muzzles: [[3.9, -0.8, 0]],
			tracerEvery: 1,
			color: [10, 5, 1.6],
			explosive: 1.2,
			aimed: true
		},
		loadout: { gp: 2, frag: 2, guided: 2, rockets: 4 },
		regen: 3,
		missiles: 8,
		hardpoints: [
			[-0.2, -0.75, 1.55],
			[-0.2, -0.75, -1.55]
		],
		flares: 6,
		stealth: 1,
		engine: 'rotor',
		rotor: { main: [0, 1.95, 0], tail: [-8.65, 1.5, 0.32], size: 1.25 },
		exhaust: [],
		radius: 5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.3, armor: 0.55, payload: 0.35, agility: 1 },
		boostFx: 'smoke',
		tip: [-0.2, -0.05, 1.85]
	},
	mq9: {
		id: 'mq9',
		name: 'REAPER',
		real: 'MQ-9 Reaper',
		role: 'Hunter-killer drone',
		blurb:
			'Slow, fragile and hard for radar to see. No gun: it kills with laser-guided bombs and Hellfires only.',
		pros: ['Stealthy', 'Precise guided weapons only'],
		cons: ['No gun', 'Fragile and slow'],
		mesh: 'mq9',
		scale: 0.9,
		props: [[-5.4, 0, 0]],
		hp: 70,
		thrust: 12,
		boost: 9,
		drag: 0.006,
		lift: 2.6,
		turnRate: 1.7,
		stallSpeed: 22,
		cruise: 42,
		gun: null,
		loadout: { guided: 4 },
		regen: 3,
		missiles: 8,
		hardpoints: [
			[0.1, -0.35, 2.6],
			[0.1, -0.35, -2.6],
			[0.1, -0.3, 4.4],
			[0.1, -0.3, -4.4]
		],
		flares: 3,
		stealth: 1.6,
		engine: 'prop',
		exhaust: [],
		radius: 4.5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.15, armor: 0.1, payload: 0.3, agility: 0.45 },
		boostFx: 'smoke',
		tip: [-0.2, 0.5, 10]
	},
	stuka: {
		id: 'stuka',
		name: 'STUKA',
		real: 'Ju 87 B Stuka',
		role: 'Dive bomber',
		blurb:
			'Point the nose at the target and dive. The siren howls, the dive brakes bite and the bombs fall true.',
		pros: ['Accurate dive bombing', 'Dive brakes hold the dive'],
		cons: ['Weak gun', 'No missiles, few flares'],
		mesh: 'stuka',
		scale: 0.85,
		props: [[5.95, 0, 0]],
		hp: 130,
		thrust: 15,
		boost: 10,
		drag: 0.0049,
		lift: 2.4,
		turnRate: 2,
		stallSpeed: 26,
		cruise: 52,
		gun: {
			rate: 14,
			damage: 6,
			pierce: 0.05,
			speed: 700,
			spread: 0.016,
			heatPerShot: 1.2,
			muzzles: [
				[1.8, -0.95, 3.4],
				[1.8, -0.95, -3.4]
			],
			tracerEvery: 2,
			color: [9, 6.5, 2.2],
			explosive: 0
		},
		loadout: { gp: 6, skip: 2, penetrator: 1 },
		regen: 2.2,
		missiles: 0,
		hardpoints: [
			[0.3, -1.3, 0],
			[-0.3, -1.95, 4.3],
			[-0.3, -1.95, -4.3]
		],
		flares: 3,
		stealth: 0.9,
		engine: 'prop',
		dive: { limit: 92 },
		exhaust: [],
		radius: 5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.35, armor: 0.4, payload: 0.45, agility: 0.6 },
		boostFx: 'smoke',
		tip: [-0.3, -0.9, 8.6]
	},
	a1: {
		id: 'a1',
		name: 'SANDY',
		real: 'A-1H Skyraider',
		role: 'Piston attack',
		blurb:
			'A propeller-driven dump truck: four 20 mm cannons, pylons everywhere and armour that laughs at rifle fire.',
		pros: ['Lots of pylons', 'Four cannons', 'Shrugs off rifle fire'],
		cons: ['Slow', 'Only two missiles'],
		mesh: 'a1',
		scale: 0.85,
		props: [[5.95, 0, 0]],
		hp: 220,
		thrust: 17,
		boost: 12,
		drag: 0.0044,
		lift: 2.5,
		turnRate: 2,
		stallSpeed: 28,
		cruise: 58,
		gun: {
			rate: 16,
			damage: 10,
			pierce: 0.22,
			speed: 700,
			spread: 0.016,
			heatPerShot: 1.4,
			muzzles: [
				[1.7, -0.5, 3.2],
				[1.7, -0.5, -3.2],
				[1.7, -0.5, 3.7],
				[1.7, -0.5, -3.7]
			],
			tracerEvery: 2,
			color: [9, 6, 2],
			explosive: 0.8
		},
		loadout: { gp: 10, frag: 2, cluster: 3, napalm: 3, mines: 2, chemical: 1 },
		regen: 2.2,
		missiles: 2,
		hardpoints: [
			[-0.2, -1.05, 2.4],
			[-0.2, -1.05, -2.4],
			[-0.4, -0.95, 4.0],
			[-0.4, -0.95, -4.0],
			[-0.5, -0.85, 5.4],
			[-0.5, -0.85, -5.4]
		],
		flares: 6,
		stealth: 0.85,
		engine: 'prop',
		exhaust: [],
		radius: 5.5,
		salvo: 1,
		tailGun: false,
		stats: { speed: 0.4, armor: 0.75, payload: 0.85, agility: 0.55 },
		boostFx: 'smoke',
		tip: [-0.6, 0, 7.6]
	},
	tu95: {
		id: 'tu95',
		name: 'BEAR',
		real: 'Tu-95MS Bear',
		role: 'Turboprop strategic bomber',
		blurb:
			'Eight contra-rotating propellers, twin 23 mm cannons in the tail turret and no forward gun at all.',
		pros: ['Huge payload', 'Tail turret', 'Carries the nuke'],
		cons: ['No forward gun', 'Slowest to turn'],
		mesh: 'tu95',
		scale: 0.5,
		props: [
			[5.05, -1.05, 7],
			[4.45, -1.05, 7],
			[1.75, -1.38, 13.5],
			[1.15, -1.38, 13.5],
			[5.05, -1.05, -7],
			[4.45, -1.05, -7],
			[1.75, -1.38, -13.5],
			[1.15, -1.38, -13.5]
		],
		contra: true,
		hp: 360,
		thrust: 20,
		boost: 13,
		drag: 0.004,
		lift: 2,
		turnRate: 1.35,
		stallSpeed: 34,
		cruise: 66,
		gun: null,
		loadout: { gp: 20, cluster: 6, glide: 2, cruise: 3, thunder: 2 },
		regen: 1.3,
		missiles: 0,
		hardpoints: [],
		flares: 10,
		stealth: 0.6,
		engine: 'prop',
		exhaust: [],
		radius: 11,
		salvo: 3,
		tailGun: true,
		tailGunAt: [-25.6, 0.1, 0],
		stats: { speed: 0.6, armor: 0.9, payload: 0.95, agility: 0.25 },
		boostFx: 'smoke',
		tip: [-9.5, -1.65, 25]
	}
};

export const AIRCRAFT_ORDER: AircraftId[] = [
	'kestrel',
	'wraith',
	'grizzly',
	'albatross',
	'a10',
	'f16',
	'su25',
	'f4',
	'b1',
	'ac130',
	'apache',
	'mq9',
	'stuka',
	'a1',
	'tu95'
];
