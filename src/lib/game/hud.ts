import type { ObjectiveStatus } from './campaign';
import type { StrikeId } from './campaign-map';
import type { Systems } from './damage';
import type { BigKill } from './killcam';
import type { CreditAward } from './progression';
import type { TutorialCard } from './tutorial';
import type { AircraftId, BombId } from './types';
import type { BiomeId } from './biomes';
import type { WingOrder } from './wingman';

/** How a sortie is played: training, a campaign mission, or endless waves. */
export type GameMode = 'tutorial' | 'campaign' | 'endless';

export type ModeStart = (
	| { mode: 'tutorial' }
	| { mode: 'endless'; biome?: BiomeId }
	/** A campaign mission, softened by the strike flown ahead of it. */
	| { mode: 'campaign'; mission: string; strike?: StrikeId | null }
) & {
	/** Local two-player co-op: a second aircraft flown from a gamepad (not in training). */
	coop?: boolean;
};

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
	/** "WAVE 3", "WAVE 2/4" or "TRAINING". */
	waveLabel: string;
	waveState: string;
	mode: GameMode;
	/** Campaign mission name. */
	mission: string;
	objectives: ObjectiveStatus[];
	/** The boss on the field and how much of it is left. */
	boss: { name: string; frac: number } | null;
	tutorial: TutorialCard | null;
	enemies: number;
	/** Friendly column on the road and its distance to go, or empty. */
	column: string;
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
	boundary: number;
	ceiling: boolean;
	rearming: boolean;
	landed: boolean;
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
}

export interface GameOverStats {
	mode: GameMode;
	outcome: 'failed' | 'complete';
	/** Mission name (campaign), or the mode's name. */
	title: string;
	missionId?: string;
	/** Campaign: stars earned, and what each one was for. */
	stars?: number;
	starNotes?: { label: string; got: boolean }[];
	/** Campaign: the mission this win unlocked (or replays into). */
	nextMission?: string;
	/** Credits this sortie paid, line by line, and the wallet after it (not for training). */
	credits?: CreditAward & { balance: number };
	/** Endless: place on the local leaderboard (0 = off the board). */
	rank?: number;
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
		mode: 'endless',
		mission: '',
		objectives: [],
		boss: null,
		tutorial: null,
		enemies: 0,
		column: '',
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
		boundary: 0,
		ceiling: false,
		rearming: false,
		landed: false,
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
		noFire: ''
	};
}
