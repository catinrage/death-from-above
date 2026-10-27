import type { PartSpec, UnitDef, UnitKind, Vec3T, WeaponKind } from './types';
import type { MeshName } from '../models';

const soldierParts = (body: MeshName): PartSpec[] => [
	{ mesh: body, at: [0, 0, 0] },
	{ mesh: 'soldierLeg', at: [0, 0.95, 0.12], drive: 'legL' },
	{ mesh: 'soldierLeg', at: [0, 0.95, -0.12], drive: 'legR' },
	{ mesh: 'soldierArm', at: [0.02, 1.48, 0.27], drive: 'armL' },
	{ mesh: 'soldierArm', at: [0.02, 1.48, -0.27], drive: 'armR' }
];

const wheels = (mesh: MeshName, xs: number[], y: number, z: number): PartSpec[] =>
	xs.flatMap((x) => [
		{ mesh, at: [x, y, z] as Vec3T, drive: 'wheel' as const },
		{ mesh, at: [x, y, -z] as Vec3T, drive: 'wheel' as const }
	]);

export const UNITS: Record<UnitKind, UnitDef> = {
	rifleman: {
		kind: 'rifleman',
		name: 'Rifleman',
		hp: 12,
		armor: 0,
		speed: 3.3,
		half: [0.35, 0.9, 0.35],
		score: 10,
		cost: 3,
		minWave: 1,
		isStatic: false,
		category: 'infantry',
		weapon: 'rifle',
		range: 260,
		parts: soldierParts('soldierBody'),
		death: 'ragdoll',
		boom: 0,
		siege: 1.2
	},
	manpads: {
		kind: 'manpads',
		name: 'Missile Trooper',
		hp: 14,
		armor: 0,
		speed: 2.9,
		half: [0.35, 0.9, 0.35],
		score: 45,
		cost: 12,
		minWave: 3,
		isStatic: false,
		category: 'infantry',
		weapon: 'manpads',
		range: 480,
		parts: soldierParts('soldierBodyAA'),
		death: 'ragdoll',
		boom: 0,
		siege: 0.5
	},
	jeep: {
		kind: 'jeep',
		name: 'Gun Jeep',
		hp: 45,
		armor: 0.2,
		speed: 13,
		half: [2.0, 0.9, 0.95],
		score: 30,
		cost: 9,
		minWave: 1,
		isStatic: false,
		category: 'vehicle',
		weapon: 'mg',
		range: 380,
		parts: [
			{ mesh: 'jeepBody', at: [0, 0, 0] },
			...wheels('wheelSmall', [1.25, -1.25], 0.4, 0.85),
			{ mesh: 'jeepGun', at: [-1.2, 1.65, 0], drive: 'aim' }
		],
		death: 'flip',
		boom: 0.55,
		siege: 2.5
	},
	truck: {
		kind: 'truck',
		name: 'Supply Truck',
		hp: 60,
		armor: 0.1,
		speed: 10,
		half: [3.6, 1.4, 1.2],
		score: 40,
		cost: 8,
		minWave: 1,
		isStatic: false,
		category: 'vehicle',
		weapon: null,
		range: 0,
		parts: [{ mesh: 'truck', at: [0, 0, 0] }, ...wheels('wheel', [2.9, -0.8, -2.0], 0.5, 1.0)],
		death: 'flip',
		boom: 0.75,
		siege: 0,
		supply: true
	},
	engineer: {
		kind: 'engineer',
		name: 'Bridging Engineers',
		hp: 70,
		armor: 0.15,
		speed: 11,
		half: [3.8, 1.5, 1.25],
		score: 90,
		cost: 0,
		// Never planned into a wave: the bridge calls them up when a column is stranded.
		minWave: 99,
		isStatic: false,
		category: 'vehicle',
		weapon: null,
		range: 0,
		parts: [
			{ mesh: 'engineerTruck', at: [0, 0, 0] },
			...wheels('wheel', [2.9, -0.8, -2.2], 0.5, 1.05)
		],
		death: 'flip',
		boom: 0.8,
		siege: 0
	},
	tank: {
		kind: 'tank',
		name: 'Battle Tank',
		hp: 270,
		armor: 0.85,
		speed: 7,
		half: [3.9, 1.3, 2.0],
		score: 120,
		cost: 26,
		minWave: 2,
		isStatic: false,
		category: 'armor',
		weapon: 'cannon',
		range: 460,
		parts: [
			{ mesh: 'tankHull', at: [0, 0, 0] },
			{ mesh: 'tankTurret', at: [-0.3, 1.65, 0], drive: 'yaw', detach: true },
			{ mesh: 'tankBarrel', parent: 1, at: [1.7, 0.5, 0], drive: 'pitch', detach: true }
		],
		death: 'turretPop',
		boom: 1.1,
		siege: 9
	},
	apc: {
		kind: 'apc',
		name: 'Troop Carrier',
		hp: 160,
		armor: 0.6,
		speed: 9,
		half: [3.7, 1.15, 1.45],
		score: 80,
		cost: 18,
		minWave: 3,
		isStatic: false,
		category: 'armor',
		weapon: 'autocannon',
		range: 420,
		parts: [
			{ mesh: 'apcHull', at: [0, 0, 0] },
			...wheels('wheelBig', [2.2, 0.8, -1.0, -2.5], 0.58, 1.35),
			{ mesh: 'apcTurret', at: [0.3, 2.15, 0], drive: 'yaw' },
			{ mesh: 'apcGun', parent: 9, at: [0.5, 0.3, 0], drive: 'pitch' }
		],
		death: 'blast',
		boom: 0.9,
		siege: 4
	},
	spaag: {
		kind: 'spaag',
		name: 'AA Gun Carrier',
		hp: 170,
		armor: 0.6,
		speed: 6.5,
		half: [3.4, 1.4, 1.9],
		score: 150,
		cost: 28,
		minWave: 2,
		isStatic: false,
		category: 'aa',
		weapon: 'autocannon',
		range: 600,
		parts: [
			{ mesh: 'spaagHull', at: [0, 0, 0] },
			{ mesh: 'spaagTurret', at: [0, 1.5, 0], drive: 'yaw', detach: true },
			{ mesh: 'spaagGuns', parent: 1, at: [0.9, 0.75, 0], drive: 'pitch', detach: true },
			{ mesh: 'radarDish', parent: 1, at: [-1.0, 1.8, -0.4], drive: 'spin', detach: true }
		],
		death: 'turretPop',
		boom: 1.0,
		siege: 3
	},
	sam: {
		kind: 'sam',
		name: 'SAM Launcher',
		hp: 140,
		armor: 0.35,
		speed: 6,
		half: [3.9, 1.6, 1.4],
		score: 250,
		cost: 38,
		minWave: 4,
		isStatic: false,
		category: 'aa',
		weapon: 'sam',
		range: 1150,
		parts: [
			{ mesh: 'samChassis', at: [0, 0, 0] },
			...wheels('wheelBig', [2.6, -0.6, -2.0], 0.58, 1.15),
			{ mesh: 'samRack', at: [-3.0, 1.45, 0], drive: 'rack' }
		],
		death: 'blast',
		boom: 1.5,
		siege: 0
	},
	artillery: {
		kind: 'artillery',
		name: 'Howitzer',
		hp: 80,
		armor: 0.3,
		speed: 4.5,
		half: [2.2, 1.2, 1.3],
		score: 90,
		cost: 16,
		minWave: 4,
		isStatic: false,
		category: 'vehicle',
		weapon: 'artillery',
		range: 0,
		parts: [
			{ mesh: 'artilleryCarriage', at: [0, 0, 0] },
			{ mesh: 'wheelBig', at: [0, 0.58, 1.05], drive: 'wheel' },
			{ mesh: 'wheelBig', at: [0, 0.58, -1.05], drive: 'wheel' },
			{ mesh: 'artilleryBarrel', at: [0.2, 1.1, 0], drive: 'pitch' }
		],
		death: 'flip',
		boom: 0.8,
		siege: 11
	},
	flak: {
		kind: 'flak',
		name: 'Flak Battery',
		hp: 170,
		armor: 0.45,
		speed: 0,
		half: [3.8, 1.2, 3.8],
		score: 130,
		cost: 24,
		minWave: 3,
		isStatic: true,
		category: 'aa',
		weapon: 'flak',
		range: 980,
		parts: [
			{ mesh: 'flakBase', at: [0, 0, 0] },
			{ mesh: 'flakMount', at: [0, 1.2, 0], drive: 'yaw', detach: true },
			{ mesh: 'flakBarrel', parent: 1, at: [0, 1.0, 0], drive: 'pitch', detach: true }
		],
		death: 'turretPop',
		boom: 1.2,
		siege: 0
	},
	bunker: {
		kind: 'bunker',
		name: 'Pillbox',
		hp: 260,
		armor: 0.85,
		speed: 0,
		half: [3.4, 1.1, 2.4],
		score: 180,
		cost: 22,
		minWave: 1,
		isStatic: true,
		category: 'structure',
		weapon: 'mg',
		range: 430,
		parts: [{ mesh: 'bunker', at: [0, 0, 0] }],
		death: 'collapse',
		boom: 1.0,
		siege: 0
	},
	radar: {
		kind: 'radar',
		name: 'Radar Station',
		hp: 160,
		armor: 0.3,
		speed: 0,
		half: [3.6, 2.6, 1.8],
		score: 200,
		cost: 20,
		minWave: 4,
		isStatic: true,
		category: 'structure',
		weapon: null,
		range: 0,
		parts: [
			{ mesh: 'radarStation', at: [0, 0, 0] },
			{ mesh: 'radarDishBig', at: [1.6, 5.4, 0], drive: 'spin', detach: true }
		],
		death: 'collapse',
		boom: 1.0,
		siege: 0
	},
	depot: {
		kind: 'depot',
		name: 'Fuel Depot',
		hp: 200,
		armor: 0.2,
		speed: 0,
		half: [8.6, 2.8, 2.6],
		score: 300,
		cost: 16,
		minWave: 2,
		isStatic: true,
		category: 'structure',
		weapon: null,
		range: 0,
		parts: [{ mesh: 'fuelDepot', at: [0, 0, 0] }],
		death: 'blast',
		boom: 3.2,
		siege: 0,
		supply: true
	},
	searchlight: {
		kind: 'searchlight',
		name: 'Searchlight',
		hp: 40,
		armor: 0.1,
		speed: 0,
		half: [1.3, 1.0, 1.3],
		score: 40,
		cost: 5,
		minWave: 3,
		isStatic: true,
		category: 'structure',
		weapon: null,
		range: 900,
		parts: [
			{ mesh: 'searchlightBase', at: [0, 0, 0] },
			{ mesh: 'searchlightLamp', at: [0, 1.6, 0], drive: 'aim', detach: true }
		],
		death: 'collapse',
		boom: 0.4,
		siege: 0
	},
	superTank: {
		kind: 'superTank',
		name: 'Behemoth',
		hp: 950,
		armor: 0.9,
		speed: 4.5,
		half: [7.8, 2.3, 3.6],
		score: 1500,
		cost: 0,
		minWave: 99,
		isStatic: false,
		category: 'armor',
		weapon: 'cannon',
		range: 540,
		parts: [
			{ mesh: 'superTankHull', at: [0, 0, 0] },
			{ mesh: 'superTankTurret', at: [-0.6, 2.8, 0], drive: 'yaw', detach: true },
			{ mesh: 'superTankBarrel', parent: 1, at: [3.0, 0.95, 0], drive: 'pitch', detach: true },
			{ mesh: 'superTankAA', at: [-5.4, 2.8, 0], drive: 'auxYaw' },
			{ mesh: 'superTankAAGuns', parent: 3, at: [0.2, 1.3, 0], drive: 'auxPitch' }
		],
		death: 'turretPop',
		boom: 2.2,
		siege: 20,
		boss: true
	},
	cruiser: {
		kind: 'cruiser',
		name: 'River Cruiser',
		hp: 850,
		armor: 0.75,
		speed: 5,
		// Anchored broadside across the river, bow toward the airfield.
		half: [19.4, 5, 4.4],
		score: 2000,
		cost: 0,
		minWave: 99,
		isStatic: false,
		category: 'aa',
		weapon: 'flak',
		range: 1100,
		parts: [
			{ mesh: 'cruiserHull', at: [0, 0, 0] },
			{ mesh: 'radarDishBig', at: [-0.5, 18.4, 0], drive: 'spin', detach: true },
			{ mesh: 'cruiserCiws', at: [5.8, 9.0, 0], drive: 'auxYaw' },
			{ mesh: 'cruiserCiwsGuns', parent: 2, at: [0, 1.5, 0], drive: 'auxPitch' },
			{ mesh: 'cruiserSam', at: [-8.2, 3.0, 0], drive: 'auxYaw' },
			{ mesh: 'cruiserTurret', at: [11.2, 3.5, 0], drive: 'yaw' },
			{ mesh: 'cruiserGuns', parent: 5, at: [0.2, 1.9, 0], drive: 'pitch' },
			{ mesh: 'cruiserTurret', at: [-12, 3.5, 0], drive: 'yaw' },
			{ mesh: 'cruiserGuns', parent: 7, at: [0.2, 1.9, 0], drive: 'pitch' }
		],
		death: 'sink',
		boom: 2.6,
		siege: 0,
		boss: true
	}
};

/** One-off heavy units that lead a campaign act's last wave. */
export const BOSS_KINDS: UnitKind[] = ['superTank', 'cruiser'];

export interface EnemyWeapon {
	/** Seconds between bursts. */
	interval: number;
	burst: number;
	burstGap: number;
	speed: number;
	damage: number;
	spread: number;
	tracer: [number, number, number];
	/** 0 = aims at current position, 1 = perfect lead. */
	lead: number;
	/** Minimum elevation angle (radians) at which it engages aircraft. */
	minElev: number;
	lockTime: number;
}

export const ENEMY_WEAPONS: Record<WeaponKind, EnemyWeapon> = {
	rifle: {
		interval: 2.4,
		burst: 1,
		burstGap: 0,
		speed: 430,
		damage: 0.6,
		spread: 0.075,
		tracer: [2.4, 2.1, 1.4],
		lead: 0.4,
		minElev: 0.12,
		lockTime: 0
	},
	mg: {
		interval: 2.5,
		burst: 5,
		burstGap: 0.1,
		speed: 540,
		damage: 1.0,
		spread: 0.05,
		tracer: [10, 3.5, 1.1],
		lead: 0.6,
		minElev: 0.08,
		lockTime: 0
	},
	autocannon: {
		interval: 2.8,
		burst: 8,
		burstGap: 0.075,
		speed: 800,
		damage: 2.6,
		spread: 0.026,
		tracer: [14, 3.2, 1.1],
		lead: 0.85,
		minElev: 0.1,
		lockTime: 0
	},
	flak: {
		interval: 2.6,
		burst: 1,
		burstGap: 0,
		speed: 440,
		damage: 28,
		spread: 0.018,
		tracer: [0, 0, 0],
		lead: 0.9,
		minElev: 0.15,
		lockTime: 0
	},
	sam: {
		interval: 9,
		burst: 1,
		burstGap: 0,
		speed: 0,
		damage: 58,
		spread: 0,
		tracer: [0, 0, 0],
		lead: 0,
		minElev: 0.1,
		lockTime: 2.6
	},
	manpads: {
		interval: 7.5,
		burst: 1,
		burstGap: 0,
		speed: 0,
		damage: 34,
		spread: 0,
		tracer: [0, 0, 0],
		lead: 0,
		minElev: 0.15,
		lockTime: 1.8
	},
	cannon: {
		interval: 5.5,
		burst: 1,
		burstGap: 0,
		speed: 390,
		damage: 14,
		spread: 0.02,
		tracer: [12, 6, 2],
		lead: 0.5,
		minElev: 0.05,
		lockTime: 0
	},
	artillery: {
		interval: 6,
		burst: 1,
		burstGap: 0,
		speed: 0,
		damage: 0,
		spread: 0,
		tracer: [0, 0, 0],
		lead: 0,
		minElev: 0,
		lockTime: 0
	}
};

export const MOBILE_KINDS: UnitKind[] = [
	'rifleman',
	'manpads',
	'jeep',
	'truck',
	'tank',
	'apc',
	'spaag',
	'sam',
	'artillery'
];
export const STATIC_KINDS: UnitKind[] = ['flak', 'bunker', 'radar', 'depot', 'searchlight'];
