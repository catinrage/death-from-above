import type { Systems } from './damage';
import type { BigKill } from './killcam';
import type { CommandGroup, CommandId, CommandTab, Refusal } from './command';
import type { CreditAward } from './progression';
import type { TutorialCard } from './tutorial';
import type { AircraftId, BombId } from './types';
import type { BiomeId } from './biomes';
import type { Challenge, Difficulty } from './command-setup';
import type { WingOrder } from './wingman';

/** How a sortie is played: flight training, the war itself, or the war run from the ground. */
export type GameMode = 'tutorial' | 'war' | 'command';

export type ModeStart = (
	| { mode: 'tutorial' }
	/** The war, on a given map (a random one when left out). */
	| { mode: 'war'; biome?: BiomeId }
	/** The same war with the player as its commander instead of a pilot. */
	| {
			mode: 'command';
			biome?: BiomeId;
			difficulty?: Difficulty;
			challenge?: Challenge;
			/** Fog of war: each side sees only what its sensors pick up. */
			fog?: boolean;
	  }
) & {
	/** Local two-player co-op: a second aircraft flown from a gamepad (not in training). */
	coop?: boolean;
};

/** One line of the objectives panel. */
export interface ObjectiveStatus {
	label: string;
	/** "3/6", or empty for yes/no goals. */
	count: string;
	done: boolean;
	/** A constraint that is broken. */
	failed?: boolean;
}

export type GamePhase = 'loading' | 'title' | 'playing' | 'paused' | 'gameover';
export type Tone = 'info' | 'warn' | 'good';

export interface HudBomb {
	id: BombId;
	short: string;
	count: number;
	max: number;
	color: string;
	slot: number;
	/** Gun pod: barrel heat 0..1 and whether it has cooked off. */
	heat?: number;
	hot?: boolean;
}

export interface HudFeedItem {
	id: number;
	text: string;
	points: number;
}

export interface HudMessage {
	id: number;
	text: string;
	sub: string;
	tone: Tone;
}

/** Player two's compact panel. */
export interface Player2Hud {
	hp: number;
	hpMax: number;
	boost: number;
	flares: number;
	flaresMax: number;
	missiles: number;
	missilesMax: number;
	/** Selected ordnance. */
	weapon: string;
	weaponCount: number;
	weaponColor: string;
	/** Seconds until the next airframe (0 = flying or none left). */
	respawn: number;
	/** Shot down with no aircraft left to fly. */
	out: boolean;
	/** A missile is chasing player two, or a launcher is locking it. */
	threat: boolean;
	/** No gamepad is connected to fly it. */
	noPad: boolean;
	/** Flying clear of the runway with the gear still down. */
	gearDown: boolean;
}

/** One checkpoint on the HUD's front-line strip. */
export interface WarPointHud {
	name: string;
	/** Position from our airfield (0) to the enemy HQ (1). */
	at: number;
	owner: 'player' | 'enemy' | null;
	/** Capture state, -1 (theirs) to +1 (ours). */
	hold: number;
	contested: boolean;
}

export interface WarHud {
	/** Enemy HQ strength 0..1. */
	hq: number;
	hqDown: boolean;
	hqUnderFire: boolean;
	/** Friendly units in the field. */
	army: number;
	/** Seconds to the next reinforcement group. */
	next: number;
	points: WarPointHud[];
}

/** One button of the commander's order bar. */
export interface CommandItemHud {
	id: CommandId;
	name: string;
	short: string;
	tip: string;
	group: CommandGroup;
	/** Its page of the order bar; null for the strikes, which are always shown. */
	tab: CommandTab | null;
	cost: number;
	key: string;
	/** Share of its cooldown still to run, 0 when ready. */
	cooldown: number;
	/** Why it can't be ordered right now, or null. */
	refusal: Refusal | null;
}

/** The commander's panel: the war chest and every order on offer. */
export interface CommandHud {
	funds: number;
	/** Funds per second. */
	income: number;
	/** The open page of the order bar, and every page. */
	tab: CommandTab;
	tabs: readonly { id: CommandTab; label: string }[];
	/** Seconds from firing the strike being aimed to its impact, or null. */
	eta: number | null;
	items: CommandItemHud[];
	/** The strike waiting for a spot to be clicked, or null. */
	aiming: CommandId | null;
	army: number;
	armyMax: number;
	air: number;
	airMax: number;
	drones: number;
	dronesMax: number;
	/** Groups paid for and waiting to leave the rally point. */
	queued: number;
	/** The enemy commander, who has the same chest and orders. */
	enemy: { funds: number; army: number; air: number };
}

/** Everything the HUD shows, refreshed ~15 times a second. */
export interface HudSnapshot {
	hp: number;
	hpMax: number;
	boost: number;
	heat: number;
	overheated: boolean;
	flares: number;
	flaresMax: number;
	bombs: HudBomb[];
	selected: BombId;
	score: number;
	combo: number;
	multiplier: number;
	comboTime: number;
	wave: number;
	/** "WAVE 3" or "TRAINING". */
	waveLabel: string;
	waveState: string;
	mode: GameMode;
	/** Heading over the objectives panel. */
	mission: string;
	objectives: ObjectiveStatus[];
	/** The boss on the field and how much of it is left. */
	boss: { name: string; frac: number } | null;
	tutorial: TutorialCard | null;
	enemies: number;
	/** The front line, or null outside a war (training). */
	war: WarHud | null;
	/** What we must keep standing: the airfield, or our HQ in command mode. */
	home: 'airfield' | 'hq';
	baseHp: number;
	baseMax: number;
	baseUnderAttack: boolean;
	altitude: number;
	speed: number;
	lives: number;
	/** Aircraft the sortie started with (3 solo, 6 shared in co-op). */
	livesMax: number;
	/** Player two, or null flying solo. */
	player2: Player2Hud | null;
	lock: number;
	inbound: boolean;
	stall: boolean;
	pullUp: boolean;
	/** Metres of runway left when a take-off or landing roll is running out of room; 0 otherwise. */
	runwayEnd: number;
	/** Flying clear of the runway with the gear still down. */
	gearDown: boolean;
	boundary: number;
	ceiling: boolean;
	rearming: boolean;
	landed: boolean;
	/** Down at the airfield, where the aircraft can be traded for another. */
	canSwap: boolean;
	/** Undercarriage lamp ('none' for rotors and the gunship). */
	gear: 'down' | 'up' | 'transit' | 'none';
	/** Fresh on the runway and not yet airborne: show how to take off. */
	takeoff: boolean;
	/** Engine, wing and hydraulic damage, 0..1 each. */
	systems: Systems;
	/** A bomb release just stuck in the bay. */
	bayJammed: boolean;
	damageDir: number;
	damageFlash: number;
	aircraft: AircraftId;
	timeOfDay: string;
	/** Weather name and mean wind (m/s, + blows toward +x). */
	weather: string;
	wind: number;
	respawn: number;
	feed: HudFeedItem[];
	fps: number;
	/** Bullet-time meter 0..1 and whether it is running. */
	focus: number;
	focusActive: boolean;
	/** Kill cam rolling, and what it is showing. */
	killCam: BigKill | null;
	missiles: number;
	missilesMax: number;
	/** Targets painted for the next missile salvo. */
	locks: number;
	/** Airbrake deployed. */
	braking: boolean;
	/** Nearest missile chasing the aircraft: range in metres (0 = none) and screen bearing (radians, 0 = right, clockwise). */
	missileDist: number;
	missileDir: number;
	/** Screen bearing of the launcher closest to completing its radar lock (radians, 0 = right, clockwise). */
	lockDir: number;
	/** Range inside which a flare can fool it. */
	flareWindow: number;
	/** The AI wingman: current order, armour 0..1, and whether it is down (until the next wave). */
	wingman: { order: WingOrder; hp: number; down: boolean } | null;
	/** Name of the no-fire zone under the bomb sight ('' = clear to drop). */
	noFire: string;
	/** The commander's panel (command mode only). */
	command: CommandHud | null;
}

export interface GameOverStats {
	mode: GameMode;
	outcome: 'failed' | 'complete';
	/** The mode's name. */
	title: string;
	/** Credits this sortie paid, line by line, and the wallet after it (not for training). */
	credits?: CreditAward & { balance: number };
	score: number;
	wave: number;
	kills: number;
	/** Civilians the player killed. */
	civilians: number;
	bestCombo: number;
	time: number;
	best: number;
	newBest: boolean;
	reason: string;
	/** Command mode: the setup fought, and its fastest wins (seconds, fastest first). */
	command?: {
		difficulty: string;
		challenge: string;
		times: number[];
		/** Where this win placed on the board (0 is the record), or null if it didn't. */
		rank: number | null;
	};
}

export function emptyHud(): HudSnapshot {
	return {
		hp: 1,
		hpMax: 1,
		boost: 1,
		heat: 0,
		overheated: false,
		flares: 0,
		flaresMax: 0,
		bombs: [],
		selected: 'gp',
		score: 0,
		combo: 0,
		multiplier: 1,
		comboTime: 0,
		wave: 0,
		waveLabel: '',
		waveState: 'idle',
		mode: 'war',
		mission: '',
		objectives: [],
		boss: null,
		tutorial: null,
		enemies: 0,
		war: null,
		home: 'airfield',
		baseHp: 1,
		baseMax: 1,
		baseUnderAttack: false,
		altitude: 0,
		speed: 0,
		lives: 3,
		livesMax: 3,
		player2: null,
		lock: 0,
		inbound: false,
		stall: false,
		pullUp: false,
		runwayEnd: 0,
		gearDown: false,
		boundary: 0,
		ceiling: false,
		rearming: false,
		landed: false,
		canSwap: false,
		gear: 'none',
		takeoff: false,
		systems: { engine: 0, wing: 0, hydraulics: 0 },
		bayJammed: false,
		damageDir: 0,
		damageFlash: 0,
		aircraft: 'kestrel',
		timeOfDay: '',
		weather: 'Clear',
		wind: 0,
		respawn: 0,
		feed: [],
		fps: 0,
		focus: 1,
		focusActive: false,
		killCam: null,
		missiles: 0,
		missilesMax: 0,
		locks: 0,
		braking: false,
		missileDist: 0,
		missileDir: 0,
		lockDir: 0,
		flareWindow: 450,
		wingman: null,
		noFire: '',
		command: null
	};
}
