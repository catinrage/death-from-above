import type { PointLight } from '../engine/lights';
import type { MeshName } from '../models';

export type Vec3T = [number, number, number];
export type Owner = 'player' | 'enemy';

export type BombId =
	| 'gp'
	| 'cluster'
	| 'napalm'
	| 'penetrator'
	| 'guided'
	| 'thunder'
	| 'chemical'
	| 'emp'
	| 'cruise'
	| 'ballistic'
	| 'para'
	| 'nuke'
	| 'rockets'
	| 'arm'
	| 'gunpod'
	| 'stick'
	| 'frag'
	| 'skip'
	| 'glide'
	| 'hunter'
	| 'mines'
	| 'cryo'
	| 'tesla';
export type AircraftId =
	| 'kestrel'
	| 'wraith'
	| 'grizzly'
	| 'albatross'
	| 'a10'
	| 'f16'
	| 'su25'
	| 'f4'
	| 'b1'
	| 'ac130'
	| 'apache'
	| 'mq9'
	| 'stuka'
	| 'a1'
	| 'tu95'
	| 'f22'
	| 'f35'
	| 'su24'
	| 'su27';

export type UnitKind =
	| 'rifleman'
	| 'manpads'
	| 'sniper'
	| 'atTrooper'
	| 'mortar'
	| 'medic'
	| 'mgTeam'
	| 'jeep'
	| 'truck'
	| 'engineer'
	| 'tank'
	| 'lightTank'
	| 'ifv'
	| 'tankDestroyer'
	| 'rocketTruck'
	| 'apc'
	| 'spaag'
	| 'sam'
	| 'radarTruck'
	| 'artillery'
	| 'flak'
	| 'bunker'
	| 'radar'
	| 'depot'
	| 'searchlight'
	| 'superTank'
	| 'cruiser'
	| 'railGun'
	| 'locomotive'
	| 'gunWagon'
	| 'flakWagon'
	| 'boxcar';

export type WeaponKind =
	| 'rifle'
	| 'sniper'
	| 'rpg'
	| 'mortar'
	| 'mg'
	| 'autocannon'
	| 'flak'
	| 'sam'
	| 'manpads'
	| 'cannon'
	| 'artillery'
	| 'rockets';

export type PartDrive =
	| 'yaw'
	| 'pitch'
	| 'wheel'
	| 'spin'
	| 'legL'
	| 'legR'
	| 'armL'
	| 'armR'
	| 'rack'
	| 'aim'
	/** A boss's secondary mounts, aimed apart from the main gun (`Unit.aux`). */
	| 'auxYaw'
	| 'auxPitch';

export interface PartSpec {
	mesh: MeshName;
	/** Index of the parent part; omitted = attached to the unit root. */
	parent?: number;
	at: Vec3T;
	drive?: PartDrive;
	/** Flies off as debris when the unit dies (turret pop). */
	detach?: boolean;
}

export type DeathStyle = 'ragdoll' | 'flip' | 'turretPop' | 'collapse' | 'blast' | 'sink';

export interface UnitDef {
	kind: UnitKind;
	name: string;
	hp: number;
	/** Fraction of non-penetrating damage that armour absorbs. */
	armor: number;
	speed: number;
	/** Hitbox half extents; the box sits on the ground. */
	half: Vec3T;
	score: number;
	cost: number;
	minWave: number;
	isStatic: boolean;
	category: 'infantry' | 'vehicle' | 'armor' | 'aa' | 'structure';
	weapon: WeaponKind | null;
	range: number;
	parts: PartSpec[];
	death: DeathStyle;
	/** Scales the death explosion. 0 = no explosion. */
	boom: number;
	/** Damage per second dealt to the airbase once in range. */
	siege: number;
	/** Supply bonus when destroyed. */
	supply?: boolean;
	/** A one-off heavy unit with its own health bar and secondary weapons. */
	boss?: boolean;
	/** Runs on the railway, coupled into a train, instead of driving the road. */
	rail?: boolean;
}

/** Anything a missile can chase or a gunner can aim at. */
export interface Trackable {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	alive: boolean;
	/** Infrared brightness for heat seekers. */
	heat: number;
}

export interface Unit {
	id: number;
	def: UnitDef;
	x: number;
	y: number;
	z: number;
	dir: 1 | -1;
	speed: number;
	hp: number;
	alive: boolean;
	remove: boolean;
	deadTime: number;
	pitch: number;
	yaw: number;
	aimYaw: number;
	aimPitch: number;
	cooldown: number;
	burst: number;
	lock: number;
	anim: number;
	spin: number;
	flash: number;
	state: 'advance' | 'hold' | 'siege' | 'flee' | 'deploy';
	stateTime: number;
	turretGone: boolean;
	char: number;
	fire: FireHandle | null;
	panic: number;
	lastHitBy: Owner;
	/** Light carried by searchlights / vehicle headlights. */
	lamp: PointLight | null;
	/** Troops already unloaded (APCs) or timer scratch for other behaviours. */
	deployed: number;
	/** Gap timer between rounds of a burst. */
	gap: number;
	/** Searchlight beam currently illuminating the player. */
	spotting: boolean;
	/** Fall speed of a wreck whose footing gave way. */
	fall: number;
	/** Seconds left knocked out by an EMP. */
	stun: number;
	/** Seconds left frozen solid by a cryo bomb (also stunned); frozen units take extra damage. */
	frost?: number;
	/** Bosses only: aim and timers of the secondary weapon mounts. */
	aux?: AuxMount;
}

export interface AuxMount {
	yaw: number;
	pitch: number;
	/** Secondary gun: time to the next burst, rounds left in it, gap between rounds. */
	cooldown: number;
	burst: number;
	gap: number;
	/** A second main mount firing between the first one's rounds. */
	second: number;
	/** Radar lock build-up and reload of a boss's missile battery. */
	lock: number;
	salvo: number;
	/** Where the unit is along a scripted route (the cruiser's distance up the river). */
	route: number;
}

/** Where a guided weapon should go: a tracked target, or a fixed point on the battlefield. */
export interface Designation {
	track: Trackable;
	unit: Unit | null;
	x: number;
	y: number;
}

export interface FireHandle {
	intensity: number;
	life: number;
	age: number;
	x: number;
	y: number;
	z: number;
	dead: boolean;
}
