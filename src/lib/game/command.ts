import { clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { allyDef, type AllyKind } from './allies';
import { explode } from './combat';
import { WORLD } from './constants';
import { AIRCRAFT } from './defs-aircraft';
import { BOMBS, type BlastSpec } from './defs-bombs';
import { BATTERY_PITCH, BATTERY_REACH, OUR_SITES, RACK_PITCH, THEIR_SITES } from './base';
import { UNITS } from './defs-units';
import { AirUnit } from './enemy-air';
import { Drone, type DroneKind } from './drones';
import { BALLISTIC_SPEED, CRUISE_SPEED, groundPoint, seek, seekAlly } from './specials';
import type { AircraftId, Unit } from './types';
import type { Side } from './war';
import { dropBomb, predictImpact } from './weapons';
import { TACTICS, wingProfile, type WingTactic } from './wing-profile';
import { Wingman, type WingOrder } from './wingman';
import type { World } from './world';

/**
 * Command mode: the player runs the war from the airfield instead of flying
 * it. A war chest fills with time, with every checkpoint held and with every
 * kill; it pays for troops and vehicles that roll up the road, jets that fly
 * their own sorties, and strikes launched from the base onto a chosen spot.
 * The enemy commander has exactly the same chest and orders, run from their
 * airfield at the far end.
 */

/** Orders that send troops or vehicles up the road. */
export type GroundOrder =
	| 'rifles'
	| 'assault'
	| 'platoon'
	| 'antiTank'
	| 'aaTeam'
	| 'snipers'
	| 'medics'
	| 'mortars'
	| 'mgTeam'
	| 'jeep'
	| 'apc'
	| 'lightTank'
	| 'ifv'
	| 'tankDestroyer'
	| 'tank'
	| 'column'
	| 'behemoth'
	| 'aa'
	| 'sam'
	| 'rockets'
	| 'howitzer';
export type DroneOrder = 'fpv' | 'delta';
export type StrikeOrder = 'barrage' | 'cruise' | 'carpet' | 'ballistic' | 'para' | 'nuke';
/** Every order: troops, drones, strikes, and one air order per airframe. */
export type CommandId = GroundOrder | DroneOrder | StrikeOrder | AircraftId;

export type CommandGroup = 'ground' | 'air' | 'drone' | 'strike';

/** The order bar's pages. Strikes sit beside them on fixed keys. */
export type CommandTab = 'infantry' | 'vehicles' | 'support' | 'air' | 'heavy';

export const COMMAND_TABS: readonly { id: CommandTab; label: string }[] = [
	{ id: 'infantry', label: 'Infantry' },
	{ id: 'vehicles', label: 'Vehicles' },
	{ id: 'support', label: 'Support' },
	{ id: 'air', label: 'Air' },
	{ id: 'heavy', label: 'Heavy air' }
];

/** Keys for the orders on the open tab, in order, and the labels printed on the buttons. */
export const TAB_KEYS: readonly (readonly [code: string, key: string])[] = [
	['Digit1', '1'],
	['Digit2', '2'],
	['Digit3', '3'],
	['Digit4', '4'],
	['Digit5', '5'],
	['Digit6', '6'],
	['Digit7', '7'],
	['Digit8', '8'],
	['Digit9', '9'],
	['Digit0', '0'],
	['Minus', '-'],
	['Equal', '=']
];

export interface CommandDef {
	id: CommandId;
	name: string;
	/** A word or two for the button. */
	short: string;
	/** One plain line on what it is for. */
	tip: string;
	group: CommandGroup;
	/** The order bar page it sits on; strikes sit on none (always shown). */
	tab: CommandTab | null;
	cost: number;
	/** Seconds before it can be ordered again. */
	cooldown: number;
	/** Keyboard code of its hotkey, and the label printed on the button. */
	code: string;
	key: string;
	/** Ground orders: who sets off up the road. */
	units?: readonly AllyKind[];
	/** Air orders: the airframe and its standing order. */
	aircraft?: AircraftId;
	order?: WingOrder;
	/** Drone orders: what is launched, and how many. */
	drone?: DroneKind;
	count?: number;
	/** Strikes: how far around the aim point it hurts (for the aiming ring). */
	radius?: number;
}

type Spec = Omit<CommandDef, 'id' | 'code' | 'key' | 'group' | 'tab'>;

const r = (n: number): AllyKind[] => Array<AllyKind>(n).fill('rifleman');

const INFANTRY: Partial<Record<GroundOrder, Spec>> = {
	rifles: {
		name: 'Rifle squad',
		short: 'Rifles',
		tip: 'Four riflemen. Cheap, and they take checkpoints.',
		cost: 100,
		cooldown: 0,
		units: r(4)
	},
	assault: {
		name: 'Assault squad',
		short: 'Assault',
		tip: 'Five riflemen, a rocket trooper and a medic: a squad that can hold.',
		cost: 240,
		cooldown: 0,
		units: [...r(3), 'atTrooper', 'medic', ...r(2)]
	},
	platoon: {
		name: 'Rifle platoon',
		short: 'Platoon',
		tip: 'Twelve men: riflemen with rockets, a missile man and a medic.',
		cost: 470,
		cooldown: 0,
		units: [...r(4), 'atTrooper', 'medic', ...r(3), 'atTrooper', 'manpads', 'rifleman']
	},
	antiTank: {
		name: 'Anti-tank team',
		short: 'AT team',
		tip: 'Two rocket troopers and a medic. They go for armour first.',
		cost: 170,
		cooldown: 0,
		units: ['atTrooper', 'atTrooper', 'medic']
	},
	aaTeam: {
		name: 'AA missile team',
		short: 'AA team',
		tip: 'Two shoulder-launched missiles and a rifleman to keep gunships off.',
		cost: 190,
		cooldown: 0,
		units: ['rifleman', 'manpads', 'manpads']
	},
	snipers: {
		name: 'Sniper pair',
		short: 'Snipers',
		tip: 'Pick off enemy troops from well beyond rifle range.',
		cost: 150,
		cooldown: 0,
		units: ['sniper', 'sniper']
	},
	medics: {
		name: 'Medic team',
		short: 'Medics',
		tip: 'Two medics who patch up our hurt soldiers at the front.',
		cost: 90,
		cooldown: 0,
		units: ['medic', 'medic']
	},
	mortars: {
		name: 'Mortar team',
		short: 'Mortars',
		tip: 'Two mortars that shell the enemy from behind our line.',
		cost: 180,
		cooldown: 0,
		units: ['mortar', 'mortar']
	},
	mgTeam: {
		name: 'Machine-gun team',
		short: 'MG team',
		tip: 'Two machine gunners: they pin down and mow through enemy infantry.',
		cost: 160,
		cooldown: 0,
		units: ['mgTeam', 'mgTeam']
	}
};

const VEHICLES: Partial<Record<GroundOrder, Spec>> = {
	jeep: {
		name: 'Gun jeep',
		short: 'Jeep',
		tip: 'Fast and lightly armed. Good for a quick grab at a flag.',
		cost: 90,
		cooldown: 0,
		units: ['jeep']
	},
	apc: {
		name: 'APC with riflemen',
		short: 'APC',
		tip: 'An armoured carrier with a cannon, and four riflemen behind it.',
		cost: 260,
		cooldown: 0,
		units: ['apc', ...r(4)]
	},
	lightTank: {
		name: 'Light tank',
		short: 'Lt tank',
		tip: 'Quick, thin-skinned tank with a light gun.',
		cost: 170,
		cooldown: 0,
		units: ['lightTank']
	},
	ifv: {
		name: 'Fighting vehicle with riflemen',
		short: 'IFV',
		tip: 'Tracked, well armoured, a quick-firing cannon, and four riflemen with it.',
		cost: 360,
		cooldown: 0,
		units: ['ifv', ...r(4)]
	},
	tankDestroyer: {
		name: 'Tank destroyer',
		short: 'Destroyer',
		tip: 'A long gun on a light, fast hull: kills tanks, but can’t take much back.',
		cost: 280,
		cooldown: 0,
		units: ['tankDestroyer']
	},
	tank: {
		name: 'Battle tank',
		short: 'Tank',
		tip: 'Heavy armour and a big gun. The backbone of a push.',
		cost: 300,
		cooldown: 0,
		units: ['tank']
	},
	column: {
		name: 'Armoured column',
		short: 'Column',
		tip: 'Two battle tanks, a light tank and an APC rolling together.',
		cost: 820,
		cooldown: 20,
		units: ['tank', 'lightTank', 'tank', 'apc']
	},
	behemoth: {
		name: 'Behemoth',
		short: 'Behemoth',
		tip: 'Our own super-heavy tank: twin 130 mm guns, armour like a bunker.',
		cost: 1500,
		cooldown: 90,
		units: ['superTank']
	}
};

const SUPPORT: Partial<Record<GroundOrder | DroneOrder, Spec>> = {
	aa: {
		name: 'AA carrier',
		short: 'AA gun',
		tip: 'Mobile flak that keeps gunships and jets off the column.',
		cost: 260,
		cooldown: 0,
		units: ['spaag']
	},
	sam: {
		name: 'SAM launcher',
		short: 'SAM',
		tip: 'Radar missiles that reach enemy aircraft over a kilometre out.',
		cost: 420,
		cooldown: 10,
		units: ['sam']
	},
	rockets: {
		name: 'Rocket artillery',
		short: 'Rockets',
		tip: 'Long-range rocket salvos from well behind the front.',
		cost: 320,
		cooldown: 0,
		units: ['rocketTruck']
	},
	howitzer: {
		name: 'Howitzer battery',
		short: 'Howitzers',
		tip: 'Two big guns that shell anything within a kilometre of them.',
		cost: 380,
		cooldown: 0,
		units: ['artillery', 'artillery']
	},
	fpv: {
		name: 'FPV drone swarm',
		short: 'FPV swarm',
		tip: 'Six small kamikaze drones that each fly into a vehicle near the front.',
		cost: 220,
		cooldown: 6,
		drone: 'fpv',
		count: 6
	},
	delta: {
		name: 'Delta attack drones',
		short: 'Delta drones',
		tip: 'Three one-way drones that cruise high, then dive on the best target.',
		cost: 360,
		cooldown: 10,
		drone: 'delta',
		count: 3
	}
};

/** Air orders: one per airframe, flown by an AI pilot with its tactic. */
const AIR: Partial<Record<AircraftId, Pick<Spec, 'tip' | 'cost' | 'cooldown' | 'order'>>> = {
	f16: {
		tip: 'Fighter: clears enemy aircraft, then strafes near the front.',
		cost: 420,
		cooldown: 8
	},
	wraith: { tip: 'Stealth fighter: fast, hard to lock, guided bombs.', cost: 520, cooldown: 8 },
	f22: {
		tip: 'Stealth air-superiority fighter: owns the sky, light bombs.',
		cost: 560,
		cooldown: 8
	},
	su27: {
		tip: 'Agile heavy fighter: hunts aircraft with a long missile reach.',
		cost: 470,
		cooldown: 8
	},
	f4: {
		tip: 'Heavy fighter-bomber: dogfights and drops bombs on the way.',
		cost: 440,
		cooldown: 8
	},
	kestrel: { tip: 'Fighter-bomber that goes for the ground first.', cost: 400, cooldown: 8 },
	a10: {
		tip: 'Goes after SAMs, flak and radars first, then armour.',
		cost: 480,
		cooldown: 8,
		order: 'sams'
	},
	su25: { tip: 'Armoured attack jet with bombs and rocket pods.', cost: 430, cooldown: 8 },
	f35: { tip: 'Stealth striker: slips past SAMs to drop guided bombs.', cost: 540, cooldown: 8 },
	grizzly: { tip: 'Tough ground-attack jet with a heavy cannon.', cost: 450, cooldown: 8 },
	stuka: { tip: 'Dive bomber: cheap, slow and deadly on a column.', cost: 300, cooldown: 8 },
	a1: { tip: 'Propeller attack plane with rockets and napalm.', cost: 320, cooldown: 8 }
};
const HEAVY: Partial<Record<AircraftId, Pick<Spec, 'tip' | 'cost' | 'cooldown'>>> = {
	apache: {
		tip: 'Attack helicopter that hovers off the front with Hellfires.',
		cost: 380,
		cooldown: 10
	},
	mq9: {
		tip: 'Drone that circles high and fires missiles, then goes home for more.',
		cost: 340,
		cooldown: 10
	},
	ac130: {
		tip: 'Gunship that circles the front pouring aimed fire down.',
		cost: 680,
		cooldown: 20
	},
	albatross: {
		tip: 'Heavy bomber: level runs over the enemy, home to rearm.',
		cost: 600,
		cooldown: 16
	},
	su24: {
		tip: 'Swing-wing strike jet: fast low runs with a heavy bomb load.',
		cost: 520,
		cooldown: 12
	},
	b1: { tip: 'Strategic bomber with the longest bomb load of all.', cost: 720, cooldown: 20 },
	tu95: { tip: 'Big turboprop bomber: slow, tough, carpets a wide strip.', cost: 640, cooldown: 20 }
};

/** Paratroopers: how many jump, how far along the road they land, and the transport's run. */
export const PARA_SQUAD = 8;
const PARA_SPREAD = 40;
const PARA_ALT = 90;
const PARA_SPEED = 140;
/** Seconds between jumpers leaving the door: the stick spans the drop zone. */
const PARA_GAP = (2 * PARA_SPREAD) / (PARA_SPEED * (PARA_SQUAD - 1));
/** Seconds of free fall before the canopy opens, and the rate under it. */
const PARA_FREEFALL = 1.2;
const PARA_SINK = 11;
/** Share of the transport's speed a jumper leaves the door with, and how fast it bleeds off. */
const PARA_THROW = 0.15;
const PARA_DRAG_FALL = 0.4;
const PARA_DRAG_CHUTE = 1.5;
/** How far forward a jumper drifts before the canopy stops it (so the stick is let go that much early). */
const PARA_DRIFT =
	PARA_SPEED *
	PARA_THROW *
	((1 - Math.exp(-PARA_DRAG_FALL * PARA_FREEFALL)) / PARA_DRAG_FALL +
		Math.exp(-PARA_DRAG_FALL * PARA_FREEFALL) / PARA_DRAG_CHUTE);

const STRIKES: Record<StrikeOrder, Spec & { code: string; key: string }> = {
	barrage: {
		name: 'Artillery barrage',
		short: 'Barrage',
		tip: 'Ten heavy shells scattered around the spot you click.',
		cost: 300,
		cooldown: 25,
		code: 'KeyZ',
		key: 'Z',
		radius: 30
	},
	cruise: {
		name: 'Cruise missile',
		short: 'Cruise',
		tip: 'Skims the ground from the base and picks the best target near the spot.',
		cost: 240,
		cooldown: 12,
		code: 'KeyX',
		key: 'X',
		radius: 24
	},
	carpet: {
		name: 'Carpet bombing',
		short: 'Carpet',
		tip: 'A B-1 lays a line of bombs across the spot.',
		cost: 450,
		cooldown: 40,
		code: 'KeyC',
		key: 'C',
		radius: 80
	},
	ballistic: {
		name: 'Ballistic missile',
		short: 'Ballistic',
		tip: 'Climbs out of sight and comes down at Mach 6. A few seconds’ warning.',
		cost: 520,
		cooldown: 35,
		code: 'KeyV',
		key: 'V',
		radius: BOMBS.ballistic.blast.radius
	},
	para: {
		name: 'Paratroopers',
		short: 'Para',
		tip: 'A transport drops eight riflemen on the spot. They land and join the army.',
		cost: 420,
		cooldown: 30,
		code: 'KeyB',
		key: 'B',
		radius: PARA_SPREAD
	},
	nuke: {
		name: 'Tactical nuke',
		short: 'Nuke',
		tip: 'Flattens everything for 150 m, our own troops included.',
		cost: 1600,
		cooldown: 150,
		code: 'KeyN',
		key: 'N',
		radius: BOMBS.nuke.blast.radius
	}
};

const title = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

function buildCommands(): Record<CommandId, CommandDef> {
	const out = {} as Record<CommandId, CommandDef>;
	const page = (tab: CommandTab, specs: Partial<Record<CommandId, Spec>>): void => {
		(Object.entries(specs) as [CommandId, Spec][]).forEach(([id, spec], i) => {
			const [code, key] = TAB_KEYS[i];
			const group: CommandGroup = spec.drone ? 'drone' : spec.aircraft ? 'air' : 'ground';
			out[id] = { ...spec, id, group, tab, code, key };
		});
	};
	const air = (specs: typeof AIR): Partial<Record<CommandId, Spec>> => {
		const o: Partial<Record<CommandId, Spec>> = {};
		for (const [id, a] of Object.entries(specs) as [AircraftId, (typeof AIR)[AircraftId]][]) {
			const def = AIRCRAFT[id];
			o[id] = {
				...a!,
				name: `${title(def.name)} (${def.real ?? def.role})`,
				short: title(def.name),
				aircraft: id
			};
		}
		return o;
	};
	page('infantry', INFANTRY);
	page('vehicles', VEHICLES);
	page('support', SUPPORT);
	page('air', air(AIR));
	page('heavy', air(HEAVY));
	for (const [id, spec] of Object.entries(STRIKES) as [
		StrikeOrder,
		(typeof STRIKES)[StrikeOrder]
	][])
		out[id] = { ...spec, id, group: 'strike', tab: null };
	return out;
}

export const COMMANDS: Record<CommandId, CommandDef> = buildCommands();

/** Every order, tab by tab and then the strikes. */
export const COMMAND_ORDER: readonly CommandId[] = Object.keys(COMMANDS) as CommandId[];

/** The orders on one page of the bar. */
export function tabOrders(tab: CommandTab): CommandId[] {
	return COMMAND_ORDER.filter((id) => COMMANDS[id].tab === tab);
}

/** Funds the war chest opens with. */
export const START_FUNDS = 600;
/** Funds per second from the airfield, and on top for every checkpoint held. */
export const BASE_INCOME = 16;
export const CHECKPOINT_INCOME = 6;
/**
 * The enemy's war chest fills this much faster: their troops are weaker
 * than ours one for one (they were made to come in bigger waves), so they
 * need more of them to hold the road.
 */
export const ENEMY_INCOME = 1.6;
/** Share of a kill's score paid into the war chest. */
export const BOUNTY = 0.35;
/** Most of our units on the road at once (queued ones count). */
export const ARMY_LIMIT = 80;
/** Most of our aircraft in the air at once. */
export const AIR_LIMIT = 12;
/** Most kamikaze drones in the air at once. */
export const DRONE_LIMIT = 24;
/** Seconds between groups leaving the rally point, so they don't pile up. */
const DEPLOY_GAP = 1.4;
/** What one of our jets shot down pays into the enemy's war chest (as their interceptor does ours). */
const JET_SCORE = 300;
/** What we hear when the enemy commander sends heavy ground units out. */
const ENEMY_INTEL: Partial<Record<CommandId, string>> = {
	tank: 'Enemy tank moving up the road',
	rockets: 'Enemy rocket artillery moving up',
	aa: 'Enemy AA carrier moving up'
};

/** Why an order can't be given right now. */
export type Refusal =
	'funds' | 'cooldown' | 'army' | 'air' | 'drones' | 'target' | 'inactive' | 'locked';

/** How a side's commander is set up for a game (difficulty and challenge). */
export interface CommandRules {
	/** The war chest fills this many times the usual rate. */
	income?: number;
	/** Orders this side may give (all of them when left out). */
	allows?: (def: CommandDef) => boolean;
}

const BARRAGE_ROUNDS = 10;
const BARRAGE_SCATTER = 14;
const BARRAGE_BLAST: BlastSpec = {
	radius: 10,
	damage: 85,
	pierce: 0.55,
	crater: [2.6, 0.8],
	size: 0.75,
	shake: 0.16
};
/** The heavier warhead on the base's cruise missiles. */
const CRUISE_BLAST: BlastSpec = { ...BOMBS.cruise.blast, radius: 20, damage: 380 };
/** Seconds of flight a base-launched cruise missile is allowed (the road is long). */
const CRUISE_LIFE = 45;
/** The ballistic missile's boost before it turns over, and the nuke's (a heavier rocket). */
/** Seconds a cruise missile takes to clear the rack and reach cruise speed, net. */
const CRUISE_SPOOL = 0.3;
const BALLISTIC_BOOST = 3;
const NUKE_BOOST = 4;
/** Height and speed of the carpet bomber's run, how fast it climbs, and how much of the road its stick covers. */
const BOMBER_ALT = 165;
const BOMBER_SPEED = 150;
const BOMBER_CLIMB = 20;
const CARPET_HALF = 70;
const CARPET_INTERVAL = 0.1;
/**
 * A barrage shell's time of flight (a moment plus this many seconds per metre
 * of range), and the pull that bends it into a tall arc over the hills.
 */
const SHELL_TIME = 2.5;
const SHELL_PACE = 1 / 600;
const SHELL_G = 40;

/**
 * A bomber on a scripted run: it takes off from its side's runway, climbs
 * out over the road and lays its stick across the target. Enemy guns can't
 * reach it.
 */
export interface Flyby {
	aircraft: AircraftId;
	x: number;
	y: number;
	z: number;
	/** Climb rate, until it reaches its bombing height over the target. */
	vy: number;
	dir: 1 | -1;
	speed: number;
	/** Where the stick should land, and the height it bombs from. */
	target: number;
	cruise: number;
	nextDrop: number;
	/** A transport: paratroopers still to jump (bombers carry none). */
	cargo?: number;
}

/** A paratrooper on the way down. They join the army as they touch down. */
export interface Jumper {
	unit: Unit;
	vx: number;
	vy: number;
	/** Canopy deployment 0..1. */
	chute: number;
	age: number;
}

/** A strike on its way: where it lands and how long until it does (for the countdown marker). */
export interface PendingStrike {
	id: StrikeOrder;
	x: number;
	t: number;
}

/** What each of our aircraft is up to, for the radio call as it climbs out. */
const TASKING: Record<WingTactic, string> = {
	fighter: 'Hunting near the front',
	attack: 'Going after ground targets at the front',
	bomber: 'Bombing runs over the enemy, home to rearm when empty',
	gunship: 'Circling the front with its guns',
	helo: 'Hovering off the front line',
	drone: 'Circling high over the front with missiles'
};

/** The radio call when one of theirs takes off. */
const ENEMY_TASKING: Record<WingTactic, string> = {
	fighter: 'Scrambled from their airfield',
	attack: 'Inbound on our troops',
	bomber: 'A bomber is heading for our lines',
	gunship: 'A gunship is heading for our lines',
	helo: 'An attack helicopter is coming for our spearhead',
	drone: 'An armed drone is heading for our lines'
};

/** A barrage shell: waiting for its gun to fire (`delay`), then flying its arc to `tx`. */
interface Round {
	/** The gun it is fired from, and where it is in flight. */
	gx: number;
	gy: number;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	tx: number;
	/** Seconds of flight to the target, and since firing. */
	time: number;
	age: number;
	delay: number;
	fired: boolean;
}

export class Command {
	/** Off unless a command game is running. */
	active = false;
	funds = 0;
	/** Funds earned and spent this game (for the debrief). */
	earned = 0;
	spent = 0;
	/** Orders given this game. */
	orders = 0;
	/** Seconds left before each order can be given again. */
	readonly cooldowns: Partial<Record<CommandId, number>> = {};
	/** Groups paid for and waiting to set off. */
	readonly queue: { id: CommandId; units: readonly AllyKind[] }[] = [];
	readonly flybys: Flyby[] = [];
	/** Paratroopers in the air. */
	readonly jumpers: Jumper[] = [];
	/** Strikes launched and not yet landed, with a countdown each. */
	readonly pending: PendingStrike[] = [];
	private readonly rounds: Round[] = [];
	private nextDeploy = 0;
	/** Our jets and what was ordered for each, so a loss can be reported. */
	private readonly jets = new Map<Wingman, CommandId>();
	/** The enemy commander's jets. */
	private readonly planes = new Set<AirUnit>();
	/** Those of them on their way home to the airfield. */
	private readonly homeward = new Set<Wingman>();
	private patrolClock = 0;
	/** How many times the usual rate this side's chest fills. */
	private edge = 1;
	private allows: ((def: CommandDef) => boolean) | null = null;

	/** `side`: whose army this commander runs. The enemy's mirrors ours from the far end. */
	constructor(readonly side: Side = 'player') {
		this.edge = side === 'player' ? 1 : ENEMY_INCOME;
	}

	private get ours(): boolean {
		return this.side === 'player';
	}

	/** Which way this side's road runs: +1 from our airfield, -1 from theirs. */
	private get dir(): 1 | -1 {
		return this.ours ? 1 : -1;
	}

	start(funds = START_FUNDS, rules: CommandRules = {}): void {
		this.active = true;
		this.funds = funds;
		this.edge = rules.income ?? (this.ours ? 1 : ENEMY_INCOME);
		this.allows = rules.allows ?? null;
		this.earned = this.spent = this.orders = 0;
		for (const id of COMMAND_ORDER) delete this.cooldowns[id];
		this.queue.length = 0;
		this.flybys.length = 0;
		this.jumpers.length = 0;
		this.pending.length = 0;
		this.rounds.length = 0;
		this.jets.clear();
		this.planes.clear();
		this.homeward.clear();
		this.nextDeploy = 0;
		this.patrolClock = 0;
	}

	stop(): void {
		this.active = false;
		this.queue.length = 0;
		this.flybys.length = 0;
		this.jumpers.length = 0;
		this.pending.length = 0;
		this.rounds.length = 0;
		this.jets.clear();
		this.planes.clear();
	}

	/** Funds per second right now. */
	income(w: World): number {
		return (BASE_INCOME + CHECKPOINT_INCOME * w.war.held(this.side)) * this.edge;
	}

	/** A kill by this side pays a share of its score into the war chest. */
	reward(score: number): void {
		if (!this.active || score <= 0) return;
		const pay = score * BOUNTY;
		this.funds += pay;
		this.earned += pay;
	}

	/** This side's units on the road plus those waiting to leave. */
	armySize(w: World): number {
		let n = this.ours ? w.allies.alive() : enemyArmy(w);
		for (const q of this.queue) n += q.units.length;
		// Paratroopers in the air, and those still in the transport.
		n += this.jumpers.length;
		for (const f of this.flybys) n += f.cargo ?? 0;
		return n;
	}

	airborne(w: World): number {
		let n = 0;
		if (this.ours) {
			for (const e of w.escorts) if (e.active) n++;
		} else {
			for (const a of this.planes) if (a.alive && !a.dying) n++;
		}
		return n;
	}

	/** This side's kamikaze drones in the air. */
	drones(w: World): number {
		let n = 0;
		for (const d of w.drones) if (d.side === this.side) n++;
		return n;
	}

	/** Whether an order can be given now, or why not. */
	refusal(w: World, id: CommandId): Refusal | null {
		if (!this.active) return 'inactive';
		const def = COMMANDS[id];
		if (this.allows && !this.allows(def)) return 'locked';
		if ((this.cooldowns[id] ?? 0) > 0) return 'cooldown';
		if (this.funds < def.cost) return 'funds';
		if (def.units && this.armySize(w) + def.units.length > ARMY_LIMIT) return 'army';
		if (id === 'para' && this.armySize(w) + PARA_SQUAD > ARMY_LIMIT) return 'army';
		if (def.group === 'air' && this.airborne(w) >= AIR_LIMIT) return 'air';
		if (def.drone && this.drones(w) + (def.count ?? 1) > DRONE_LIMIT) return 'drones';
		return null;
	}

	/**
	 * Gives an order and pays for it. Strikes need the battlefield x to hit.
	 * Returns why it was refused, or null once it is under way.
	 */
	order(w: World, id: CommandId, x?: number): Refusal | null {
		const why = this.refusal(w, id);
		if (why) return why;
		const def = COMMANDS[id];
		if (def.group === 'strike') {
			if (x === undefined || !Number.isFinite(x)) return 'target';
			this.strike(w, id as StrikeOrder, clamp(x, WORLD.arenaMinX, WORLD.arenaMaxX));
		} else if (def.group === 'air') this.launch(w, def);
		else if (def.drone) this.launchDrones(w, def.drone, def.count ?? 1);
		else this.queue.push({ id, units: def.units ?? [] });
		this.funds -= def.cost;
		this.spent += def.cost;
		this.orders++;
		if (def.cooldown > 0) this.cooldowns[id] = def.cooldown;
		return null;
	}

	/** Where this side's fighting is: just ahead of its spearhead, or its furthest checkpoint. */
	front(w: World): number {
		if (!this.ours) return enemyFront(w);
		const lead = w.allies.spearhead();
		let x = lead ? lead.x + 120 : (w.war.rally(w).from ?? WORLD.baseMaxX + 300);
		if (!lead) for (const c of w.war.checkpoints) if (c.owner === 'player') x = Math.max(x, c.x);
		return clamp(x, WORLD.baseMaxX + 250, WORLD.hqMinX - 80);
	}

	update(w: World, dt: number): void {
		if (!this.active) return;
		const pay = this.income(w) * dt;
		this.funds += pay;
		this.earned += pay;
		for (const id of COMMAND_ORDER) {
			const c = this.cooldowns[id];
			if (c !== undefined) this.cooldowns[id] = Math.max(0, c - dt);
		}
		this.deploy(w, dt);
		this.patrol(w, dt);
		this.updateRounds(w, dt);
		this.updateFlybys(w, dt);
		this.updateJumpers(w, dt);
		for (let i = this.pending.length - 1; i >= 0; i--) {
			this.pending[i].t -= dt;
			if (this.pending[i].t < -0.6) this.pending.splice(i, 1);
		}
	}

	/**
	 * Seconds from giving a strike order on `x` to the first of it landing
	 * there (the aiming ring and the countdown show it).
	 */
	eta(w: World, id: StrikeOrder, x: number): number {
		const site = this.ours ? OUR_SITES : THEIR_SITES;
		if (id === 'barrage') {
			// The first gun fires after a moment; its shell flies for a set time plus a bit per metre.
			return 0.2 + SHELL_TIME + Math.abs(x - site.battery[0]) * SHELL_PACE;
		}
		if (id === 'cruise') {
			// Off the rack and up to speed, then a straight run down the road and the pop-up.
			return CRUISE_SPOOL + Math.abs(x - site.launcher) / CRUISE_SPEED;
		}
		if (id === 'carpet') {
			// Takeoff roll and climb at full speed, then the release lead short of the target.
			const startX = this.ours ? WORLD.runwayMinX + 40 : WORLD.enemyRunwayMaxX - 40;
			const y = w.ground(x) + BOMBER_ALT;
			const hit = predictImpact(w, x, y, this.dir * BOMBER_SPEED, 0, BOMBS.gp.drag, null);
			const lead = Math.abs(hit.x - x);
			return Math.max(0, Math.abs(x - startX) - CARPET_HALF - lead) / BOMBER_SPEED + hit.t;
		}
		if (id === 'para') {
			// The transport's run to the spot, then the fall: a short drop, then the canopy.
			const startX = this.ours ? WORLD.runwayMinX + 40 : WORLD.enemyRunwayMaxX - 40;
			const run = Math.max(0, Math.abs(x - startX) - PARA_SPREAD - PARA_DRIFT) / PARA_SPEED;
			return run + PARA_FREEFALL + PARA_ALT / PARA_SINK;
		}
		// Ballistic: the boost, then straight down from 900 m up and 120 m short.
		const nuke = id === 'nuke';
		const drop = Math.hypot(120, 900 - (nuke ? 30 : 0));
		return (nuke ? NUKE_BOOST : BALLISTIC_BOOST) + drop / BALLISTIC_SPEED;
	}

	/** Sends the next paid-for group up the road once the last one has cleared the rally point. */
	private deploy(w: World, dt: number): void {
		this.nextDeploy -= dt;
		if (this.nextDeploy > 0 || this.queue.length === 0) return;
		const next = this.queue.shift()!;
		this.nextDeploy = DEPLOY_GAP + next.units.length * 0.25;
		if (!this.ours) return this.deployEnemy(w, next);
		const { from, note } = w.war.rally(w);
		w.allies.deploy(w, next.units, from, note, COMMANDS[next.id].name.toUpperCase());
	}

	/** Their group forms up behind their foremost checkpoint, lead unit first, like a wave column. */
	private deployEnemy(w: World, next: { id: CommandId; units: readonly AllyKind[] }): void {
		let x = w.war.enemyStaging();
		next.units.forEach((kind, i) => {
			const infantry = UNITS[kind].category === 'infantry';
			const z = infantry ? rnd.range(-3.2, 3.2) : i % 2 ? -1.8 : 1.6;
			w.spawnUnit(kind, x, z, -1);
			x += infantry ? 3 : 16;
		});
		const intel = ENEMY_INTEL[next.id];
		if (intel) w.events.message('', intel, 'warn');
	}

	/** An aircraft climbs out from the end of the runway and takes up its standing order. */
	private launch(w: World, def: CommandDef): void {
		if (!this.ours) return this.launchEnemy(w, def);
		const id = def.aircraft ?? 'f16';
		const profile = wingProfile(id);
		const x = WORLD.runwayMaxX;
		const helo = profile.tactic === 'helo';
		const jet = new Wingman(x, w.ground(x) + (helo ? 6 : 30), {
			aircraft: id,
			callsign: null,
			profile,
			autoRearm: true
		});
		jet.angle = helo ? 0 : 0.22;
		jet.vx = helo ? 0 : Math.cos(jet.angle) * jet.speed;
		jet.vy = helo ? 0 : Math.sin(jet.angle) * jet.speed;
		jet.patrol = this.front(w);
		if (def.order && def.order !== 'attack') jet.command(w, def.order);
		w.escorts.push(jet);
		this.jets.set(jet, def.id);
		w.sound.play('missileLaunch', x, jet.y, 0.4, 0.5);
		w.events.message(
			`${AIRCRAFT[id].name} AIRBORNE`,
			def.order === 'sams' ? 'Hunting their air defences' : TASKING[profile.tactic],
			'good'
		);
	}

	/**
	 * Their aircraft takes off from the near end of their runway, toward us,
	 * as the airframe ordered: fighters hunt our aircraft, the helicopter
	 * hunts our spearhead, and everything else flies attack runs on our troops.
	 */
	private launchEnemy(w: World, def: CommandDef): void {
		const id = def.aircraft ?? 'f16';
		const tactic = TACTICS[id];
		const kind = tactic === 'helo' ? 'heli' : tactic === 'fighter' ? 'fighter' : 'striker';
		const x = WORLD.enemyRunwayMinX;
		const sams = def.order === 'sams';
		const jet = new AirUnit(w.newId(), kind, x, w.ground(x) + (kind === 'heli' ? 8 : 30), id);
		if (kind !== 'heli') {
			jet.angle = Math.PI - 0.22;
			jet.vx = Math.cos(jet.angle) * 85;
			jet.vy = Math.sin(jet.angle) * 85;
		}
		jet.role = sams ? 'sams' : 'attack';
		jet.patrol = this.front(w);
		w.air.push(jet);
		this.planes.add(jet);
		w.sound.play('missileLaunch', x, jet.y, 0.4, 0.5);
		w.events.message(
			`ENEMY ${AIRCRAFT[id].name}`,
			sams ? 'Taking off to hunt our AA' : ENEMY_TASKING[tactic],
			'warn'
		);
	}

	/** A batch of kamikaze drones lifts off the near end of this side's runway and heads for the front. */
	private launchDrones(w: World, kind: DroneKind, count: number): void {
		const front = this.front(w);
		const x0 = this.ours ? WORLD.runwayMaxX : WORLD.enemyRunwayMinX;
		for (let i = 0; i < count; i++) {
			const x = x0 - this.dir * i * 6;
			const d = new Drone(kind, x, w.ground(x) + 4 + i * 1.5, rnd.range(-6, 6), front, this.side);
			w.drones.push(d);
		}
		w.sound.play('missileLaunch', x0, w.ground(x0), 0.3, 1.6);
		if (this.ours)
			w.events.message(
				kind === 'fpv' ? 'FPV SWARM AWAY' : 'DELTA DRONES AWAY',
				'Heading for the front to find targets',
				'good'
			);
		else
			w.events.message(
				kind === 'fpv' ? 'ENEMY FPV SWARM' : 'ENEMY DELTA DRONES',
				'Kamikaze drones inbound on our troops',
				'warn'
			);
	}

	/**
	 * Keeps this side's aircraft over its front as it moves, and reports any
	 * of ours that go down, turn for home to rearm or repair, or rejoin the fight.
	 */
	private patrol(w: World, dt: number): void {
		for (const [jet, id] of this.jets) {
			const name = AIRCRAFT[jet.aircraft].name;
			if (!jet.active) {
				this.jets.delete(jet);
				this.homeward.delete(jet);
				w.events.message(`${name} DOWN`, 'We lost an aircraft', 'warn');
				w.enemyCommand.reward(JET_SCORE);
				continue;
			}
			const home = jet.order === 'rearm';
			if (home === this.homeward.has(jet)) continue;
			if (home) {
				this.homeward.add(jet);
				w.events.message(
					`${name} RTB`,
					jet.homeFor === 'repair'
						? 'Badly damaged: heading home for repairs'
						: 'Out of ammo: heading home to rearm',
					'info'
				);
			} else {
				this.homeward.delete(jet);
				w.events.message(
					`${name} BACK IN THE FIGHT`,
					COMMANDS[id].short + ' repaired and rearmed',
					'good'
				);
			}
		}
		for (const a of this.planes) if (!a.alive || a.dying) this.planes.delete(a);
		this.patrolClock -= dt;
		if (this.patrolClock > 0) return;
		this.patrolClock = 1;
		const x = this.front(w);
		if (this.ours) for (const jet of w.escorts) jet.patrol = x;
		else for (const a of this.planes) a.patrol = x;
		for (const d of w.drones) if (d.side === this.side) d.patrol = x;
	}

	private strike(w: World, id: StrikeOrder, x: number): void {
		const ours = this.ours;
		const dir = this.dir;
		const site = ours ? OUR_SITES : THEIR_SITES;
		this.pending.push({ id, x, t: this.eta(w, id, x) });
		if (id === 'barrage') {
			for (let i = 0; i < BARRAGE_ROUNDS; i++) {
				// The battery's guns take it in turns.
				const gx = site.battery[i % site.battery.length];
				const gy = w.terrain.heightAtXZ(gx, site.z) + 1.1;
				const mx = gx + dir * (0.2 + Math.cos(BATTERY_PITCH) * BATTERY_REACH);
				const my = gy + Math.sin(BATTERY_PITCH) * BATTERY_REACH;
				const tx = x + rnd.gauss(BARRAGE_SCATTER);
				const time = SHELL_TIME + Math.abs(tx - mx) * SHELL_PACE;
				this.rounds.push({
					gx,
					gy,
					x: mx,
					y: my,
					z: site.z,
					vx: (tx - mx) / time,
					vy: (w.ground(tx) - my) / time + (SHELL_G * time) / 2,
					tx,
					time,
					age: 0,
					delay: 0.2 + i * 0.22 + rnd.range(0, 0.1),
					fired: false
				});
			}
			if (ours) w.events.message('BARRAGE INBOUND', 'Shells landing in a few seconds', 'info');
			else w.events.message('ENEMY BARRAGE', 'Shells coming down on our lines', 'warn');
			return;
		}
		if (id === 'cruise') {
			const target = (ours ? seek(w, x, 1, true) : seekAlly(w, x)) ?? groundPoint(w, x);
			// The seeker picked its own target near the spot: count down to that.
			const p = this.pending[this.pending.length - 1];
			p.x = target.x;
			p.t = this.eta(w, id, target.x);
			// Off the rail at the front of the rack, at the rack's angle.
			const rx = site.launcher - dir * 2.4;
			const ry = w.terrain.heightAtXZ(site.launcher, site.z) + 1.3;
			const lx = rx + dir * Math.cos(RACK_PITCH) * 5.4;
			const ly = ry + Math.sin(RACK_PITCH) * 5.4;
			const angle = ours ? RACK_PITCH : Math.PI - RACK_PITCH;
			w.strikes.push({
				kind: 'cruise',
				x: lx,
				y: ly,
				z: site.z,
				vx: Math.cos(angle) * 70,
				vy: Math.sin(angle) * 70,
				angle,
				target,
				delay: 0,
				age: 0,
				trail: 0,
				alive: true,
				owner: this.side,
				blast: CRUISE_BLAST,
				life: CRUISE_LIFE
			});
			w.sound.play('missileLaunch', lx, ly, 1.2, 0.7);
			w.fx.muzzleFlash(lx, ly, site.z, -Math.cos(angle), -Math.sin(angle), 2.4, [10, 6, 3]);
			if (ours) w.events.message('CRUISE MISSILE AWAY', 'Skimming the road to the target', 'info');
			else w.events.message('ENEMY CRUISE MISSILE', 'Inbound on our troops', 'warn');
			return;
		}
		if (id === 'carpet') {
			// It rolls from the far end of the runway and climbs out toward the target.
			const startX = ours ? WORLD.runwayMinX + 40 : WORLD.enemyRunwayMaxX - 40;
			this.flybys.push({
				aircraft: ours ? 'b1' : 'tu95',
				x: startX,
				y: w.ground(startX) + 3,
				z: 0,
				vy: BOMBER_CLIMB,
				dir,
				speed: BOMBER_SPEED,
				target: x,
				cruise: w.ground(x) + BOMBER_ALT,
				nextDrop: 0
			});
			w.sound.play('missileLaunch', startX, w.ground(startX), 0.8, 0.35);
			if (ours)
				w.events.message('BOMBER TAKING OFF', 'A B-1 is climbing out toward the target', 'info');
			else w.events.message('ENEMY BOMBER', 'A bomber has taken off for our troops', 'warn');
			return;
		}
		if (id === 'para') {
			// A transport climbs out from the runway and drops its stick over the spot.
			const startX = ours ? WORLD.runwayMinX + 40 : WORLD.enemyRunwayMaxX - 40;
			this.flybys.push({
				aircraft: 'ac130',
				x: startX,
				y: w.ground(startX) + 3,
				z: 0,
				vy: BOMBER_CLIMB,
				dir,
				speed: PARA_SPEED,
				target: x,
				cruise: w.ground(x) + PARA_ALT,
				nextDrop: 0,
				cargo: PARA_SQUAD
			});
			w.sound.play('missileLaunch', startX, w.ground(startX), 0.6, 0.3);
			if (ours)
				w.events.message('PARATROOPERS', 'A transport is on its way to the drop zone', 'info');
			else w.events.message('ENEMY PARATROOPERS', 'A transport is heading over our lines', 'warn');
			return;
		}
		const nuke = id === 'nuke';
		const sy = w.terrain.heightAtXZ(site.silo, site.z);
		w.strikes.push({
			kind: 'ballistic',
			x: site.silo,
			y: sy + 1,
			z: site.z,
			vx: 0,
			vy: 30,
			angle: Math.PI / 2,
			target: groundPoint(w, x),
			delay: nuke ? NUKE_BOOST : BALLISTIC_BOOST,
			age: 0,
			trail: 0,
			alive: true,
			owner: this.side,
			nuke
		});
		w.sound.play('missileLaunch', site.silo, sy, 1.4, 0.55);
		w.fx.muzzleFlash(site.silo, sy + 1, site.z, 0, -1, 3, [10, 6, 3]);
		if (ours)
			w.events.message(
				nuke ? 'TACTICAL NUKE LAUNCHED' : 'BALLISTIC MISSILE AWAY',
				nuke ? 'Get our troops clear of the blast' : 'Climbing for re-entry: clear the target area',
				'warn'
			);
		else
			w.events.message(
				nuke ? 'ENEMY NUKE LAUNCHED' : 'ENEMY BALLISTIC MISSILE',
				'Pull our troops back from the marked spot',
				'warn'
			);
	}

	private updateRounds(w: World, dt: number): void {
		const site = this.ours ? OUR_SITES : THEIR_SITES;
		for (let i = this.rounds.length - 1; i >= 0; i--) {
			const r = this.rounds[i];
			if (!r.fired) {
				r.delay -= dt;
				if (r.delay > 0) continue;
				r.fired = true;
				const ca = Math.cos(BATTERY_PITCH) * this.dir,
					sa = Math.sin(BATTERY_PITCH);
				w.fx.muzzleFlash(r.x, r.y, r.z, ca, sa, 2.2, [12, 7, 3]);
				w.fx.trail(r.x, r.y, r.z, 1.6, 0.6, 0.55, 3, 0.1);
				w.sound.play('artillery', r.gx, r.gy, 0.9);
				continue;
			}
			r.age += dt;
			r.vy -= SHELL_G * dt;
			r.x += r.vx * dt;
			r.y += r.vy * dt;
			// Out of the gun pit and onto the battle line by the time it lands.
			r.z = site.z * Math.max(0, 1 - r.age / r.time);
			w.fx.immediateGlow(r.x, r.y, r.z, 0.8, 12, 6, 2);
			w.fx.trail(r.x, r.y, r.z, 0.5, 0.5, 0.5, 1.4, 0.25);
			const g = w.ground(r.x);
			if (r.y > g || r.age < r.time * 0.5) continue;
			explode(w, r.x, g, 0, BARRAGE_BLAST, this.side);
			this.rounds.splice(i, 1);
		}
	}

	private updateFlybys(w: World, dt: number): void {
		for (let i = this.flybys.length - 1; i >= 0; i--) {
			const f = this.flybys[i];
			f.x += f.dir * f.speed * dt;
			f.vy = f.y < f.cruise ? BOMBER_CLIMB : 0;
			f.y = Math.max(f.y + f.vy * dt, Math.min(f.cruise, w.surface.clearance(f.x) + 60));
			w.fx.immediateGlow(f.x - f.dir * 14, f.y, f.z, 1.2, 9, 5, 2);
			f.nextDrop -= dt;
			if (f.cargo !== undefined) this.jump(w, f);
			else if (f.nextDrop <= 0 && Math.abs(f.x - f.target) < 1500) {
				// Release whenever a bomb let go now would land across the target.
				const vx = f.dir * f.speed;
				const hit = predictImpact(w, f.x, f.y - 2, vx, f.vy, BOMBS.gp.drag, null).x;
				if (Math.abs(hit - f.target) <= CARPET_HALF) {
					f.nextDrop = CARPET_INTERVAL;
					dropBomb(w, BOMBS.gp, f.x, f.y - 2, 0, vx, f.vy, 0).owner = this.side;
				}
			}
			if (f.x > WORLD.terrainMaxX - 200 || f.x < WORLD.terrainMinX + 200) this.flybys.splice(i, 1);
		}
	}

	/** Over the drop zone, a transport lets its paratroopers go one at a time. */
	private jump(w: World, f: Flyby): void {
		if (!f.cargo || f.nextDrop > 0) return;
		// Let go short of the spot by the drift, so the stick lands across it.
		if (f.dir * (f.x - f.target) < -PARA_SPREAD - PARA_DRIFT) return;
		f.nextDrop = PARA_GAP;
		f.cargo--;
		const u = w.makeUnit('rifleman', f.x - f.dir * 4, rnd.range(-3, 3), f.dir);
		if (this.ours) u.def = allyDef('rifleman');
		u.hp = u.def.hp;
		u.y = f.y - 2;
		this.jumpers.push({ unit: u, vx: f.dir * f.speed * PARA_THROW, vy: 0, chute: 0, age: 0 });
	}

	/** Paratroopers drifting down; each joins its side's army as it lands. */
	private updateJumpers(w: World, dt: number): void {
		for (let i = this.jumpers.length - 1; i >= 0; i--) {
			const j = this.jumpers[i];
			const u = j.unit;
			j.age += dt;
			if (j.age > PARA_FREEFALL) j.chute = Math.min(1, j.chute + dt * 1.6);
			// Free fall speeds up; under the canopy it settles to a steady sink and the drift dies away.
			j.vy = j.chute > 0 ? -(PARA_SINK + (1 - j.chute) * 12) : j.vy - WORLD.gravity * dt;
			j.vx *= Math.exp(-(j.chute > 0 ? PARA_DRAG_CHUTE : PARA_DRAG_FALL) * dt);
			u.x += j.vx * dt;
			u.y += j.vy * dt;
			const ground = w.surface.support(u.x, Infinity, u.z);
			if (u.y > ground) continue;
			u.y = ground;
			this.jumpers.splice(i, 1);
			if (this.ours) w.allies.enlist(u);
			else w.units.push(u);
		}
	}
}

/** The enemy's mobile army on the road: what counts toward their army limit. */
export function enemyArmy(w: World): number {
	let n = 0;
	for (const u of w.units)
		if (u.alive && !u.def.isStatic && !u.def.rail && !u.def.boss && u.def.kind !== 'cruiser') n++;
	return n;
}

/** Where the enemy's fighting is: just ahead of their lead unit, or their foremost checkpoint. */
function enemyFront(w: World): number {
	let lead: number | null = null;
	for (const u of w.units) {
		if (!u.alive || u.def.isStatic || u.def.rail || u.x > WORLD.hqMinX) continue;
		if (lead === null || u.x < lead) lead = u.x;
	}
	let x = lead !== null ? lead - 120 : w.war.enemyStaging() - 300;
	if (lead === null)
		for (const c of w.war.checkpoints) if (c.owner === 'enemy') x = Math.min(x, c.x);
	return clamp(x, WORLD.baseMaxX + 80, WORLD.hqMinX - 250);
}
