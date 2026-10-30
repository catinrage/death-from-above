import { AudioEngine } from '../audio/audio';
import { RadioWatch, type RadioCue } from '../audio/radio';
import { clamp, damp, lerp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { Renderer, type PostFrame, type Quality } from '../engine/renderer';
import { createModels } from '../models';
import type { EdgeLayer } from '../ui/edge-layer';
import type { PopupLayer } from '../ui/popups';
import {
	ALLY_SLOTS,
	FOE_SLOTS,
	PLANE_SLOTS,
	STRIKE_SLOTS,
	type AllyMarker,
	type PlaneMarker,
	type StrikeLabel,
	type PilotTagView,
	type PlaceTag,
	type TargetingLayer,
	type TargetingView,
	type ThreatMarker
} from '../ui/targeting-layer';
import { Focus } from './focus';
import { KillCam } from './killcam';
import { Targeting } from './targeting';
import { Autopilot } from './autopilot';
import {
	AIR_LIMIT,
	ARMY_LIMIT,
	COMMAND_ORDER,
	COMMAND_TABS,
	COMMANDS,
	DRONE_LIMIT,
	enemyArmy,
	TAB_KEYS,
	tabOrders,
	type CommandId,
	type CommandTab,
	type StrikeOrder
} from './command';
import { CommandAutopilot } from './command-ai';
import { bossStatus } from './boss';
import { WORLD } from './constants';
import { BOMBS, BOMB_ORDER, ROCKET_SPEED } from './defs-bombs';
import { environmentAt, presetName } from './environment';
import { applyWeather, CLEAR, weatherForWave, type WeatherSpec } from './weather';
import { gradeEnvironment, type BiomeId } from './biomes';
import type {
	CommandHud,
	GameMode,
	GameOverStats,
	GamePhase,
	HudFeedItem,
	HudMessage,
	HudSnapshot,
	ModeStart,
	ObjectiveStatus,
	Player2Hud,
	WarHud
} from './hud';
import { Input, type CommandInput } from './input';
import { pilotTag, Squadron } from './coop';
import { NO_INPUT, Player, type PilotInput } from './player';
import { SceneView } from './scene-view';
import { TerrainView } from './terrain-view';
import type { AircraftId, Owner } from './types';
import { planWave, waveBonus, WaveDirector, warTweaks } from './waves';
import { Tutorial } from './tutorial';
import { readBest, readTimes, writeBest, writeTime, writeTrained } from './records';
import {
	challengeDef,
	DEFAULT_CHALLENGE,
	DEFAULT_DIFFICULTY,
	difficultyDef,
	type Challenge,
	type Difficulty
} from './command-setup';
import { COMMAND_PITCH } from './camera';
import { predictImpact } from './weapons';
import { trainConsist } from './railway';
import { simulateWorld } from './simulate';
import { AIRCRAFT } from './defs-aircraft';
import { engineSources } from './engine-sources';
import type { Loadout } from './loadout';
import {
	battleCredits,
	grant,
	loadOrMigrate,
	saveProgression,
	type UpgradeLevels
} from './progression';
import {
	cockpitAlerts,
	gearUpWarning,
	incomingThreats,
	lockThreat,
	missileThreat,
	runwayEnd
} from './warnings';
import { RESOLVE } from './projectiles';
import { LENS_BARREL } from '../engine/lens';
import { SHOAL } from './river';
import { World } from './world';
import { HQ_HP } from './war';
import { Wingman, WING_HP, type WingOrder } from './wingman';
import { zoneAt } from './no-fire';
import { AirBase } from './base';
import { radioState } from './battle-audio';
import { edgeMarkers, enemyContacts, type EdgeMarker } from './edge-markers';

export interface GameCallbacks {
	hud(h: HudSnapshot): void;
	phase(p: GamePhase): void;
	message(m: HudMessage): void;
	gameOver(s: GameOverStats): void;
}

const STEP = 1 / 60;
/** Time-of-day phase for each wave (see environment presets). */
const ENV_BY_WAVE = [0.9, 0, 0.7, 1.25, 2.1, 3, 3, 3.6, 4.2, 5];
/** Seconds between the HQ falling and the debrief, so the last kills can land. */
const DEBRIEF_DELAY = 3.5;
const NO_EDGES: readonly EdgeMarker[] = [];
/** Radius (CSS px) of the ring of threat chevrons around the aircraft. */
const THREAT_RING = 74;
/** The radio acknowledgement for each wingman order. */
const ORDER_CUE: Record<WingOrder, RadioCue> = {
	attack: 'wingAttack',
	cover: 'wingCover',
	sams: 'wingSams',
	rearm: 'wingRearm'
};
/** Aircraft flown in training: it carries every kind of weapon the lessons use. */
const TRAINER: AircraftId = 'kestrel';

export class Game {
	readonly renderer: Renderer;
	readonly world: World;
	readonly input = new Input();
	readonly audio = new AudioEngine();
	phase: GamePhase = 'title';
	aircraft: AircraftId = 'kestrel';
	private loadout: Loadout | undefined;
	mode: GameMode = 'war';
	private tutorial: Tutorial | null = null;
	/** Airframe and rack actually flown this sortie (training overrides the hangar). */
	private flying: AircraftId = 'kestrel';
	private flyingLoadout: Loadout | undefined;
	/** Hangar upgrades on the chosen aircraft (the trainer flies stock). */
	private upgrades: UpgradeLevels | undefined;
	private flyingUpgrades: UpgradeLevels | undefined;
	private wavesScored = 0;
	private checkpointsScored = 0;
	private hqsScored = 0;
	/** Local two-player co-op: player two flies from the first gamepad. */
	coop = false;
	/** Aircraft pool and respawn timers: seat 0 is the player, seat 1 player two. */
	private squadron = new Squadron(1);
	/** Counts down from the HQ falling to the debrief. */
	private debriefTimer = 0;
	/** The AI wingman launches once the player is off the runway; 'join' also announces him. */
	private wingmanDue: 'plain' | 'join' | null = null;
	/** Enter / pad A pressed this frame, consumed by the first sub-step that reads it. */
	private confirm = false;
	private skip = false;
	/** Hangar open: the camera holds a close showcase shot of the aircraft. */
	showcase = false;
	popups: PopupLayer | null = null;
	/** Simulation speed multiplier (debug / testing). */
	timeScale = 1;
	/** Lets the autopilot fly a real game (demo / soak testing). */
	autoplay = false;
	private readonly view: SceneView;
	private readonly terrainView: TerrainView;
	private waves: WaveDirector;
	private readonly autopilot = new Autopilot();
	/** Plays the commander for autoplay (demo and soak runs). */
	private readonly commandAuto = new CommandAutopilot();
	/** Runs the enemy's side of a command game. */
	private readonly enemyCommander = new CommandAutopilot('enemy');
	/** Command mode: the strike waiting for a spot, and where the cursor meets the battlefield. */
	private aiming: CommandId | null = null;
	private aimX = Number.NaN;
	/** Command mode: where the view is headed along the road, and how far out (0 close, 1 wide). */
	private viewX = 0;
	private viewZoom = 0;
	/** Command mode: the page of the order bar that is open. */
	private commandTab: CommandTab = 'infantry';
	/** Command mode: how hard the enemy commander plays, and the challenge taken on. */
	private difficulty: Difficulty = DEFAULT_DIFFICULTY;
	private challenge: Challenge = DEFAULT_CHALLENGE;
	private readonly p2Autopilot = new Autopilot();
	/** Bullet time. */
	readonly focus = new Focus();
	/** Slow-motion follow of a bomb about to drop the bridge or set off a depot chain. */
	readonly killCam = new KillCam();
	/** Reticle, painted locks and designations for guided weapons. */
	readonly targeting = new Targeting();
	/** Player two has no reticle: its missiles pick targets ahead of its nose. */
	private readonly p2Targeting = new Targeting();
	targetingLayer: TargetingLayer | null = null;
	/** Faint screen-edge chevrons toward off-screen enemies. */
	edgeLayer: EdgeLayer | null = null;
	private readonly projectCss = (x: number, y: number, z: number): [number, number] | null =>
		this.world.camera.project(x, y, z, this.cssW, this.cssH);
	private readonly radioWatch = new RadioWatch();
	private score = 0;
	private combo = 0;
	private comboTimer = 0;
	private bestCombo = 0;
	private kills = 0;
	private playTime = 0;
	private envPhase = ENV_BY_WAVE[0];
	private envTarget = ENV_BY_WAVE[0];
	private slowScale = 1;
	private slowTimer = 0;
	private raf = 0;
	private last = 0;
	private time = 0;
	private hudTimer = 0;
	private readonly feed: HudFeedItem[] = [];
	private feedId = 1;
	private feedTime = -10;
	private msgId = 1;
	private damageFlash = 0;
	private attractTimer = 0;
	private skyFlash = 0;
	private skyFlashDir: [number, number] = [0, -1];
	private skyFlashTimer = 4;
	private fpsAcc = 0;
	private fpsFrames = 0;
	private fps = 60;
	private readonly sightPts: number[] = [];
	private readonly p2SightPts: number[] = [];
	private readonly interest: [number, number] = [0, 0];
	/** Kills this frame, merged by location so a big blast shows one popup. */
	private readonly pendingKills: {
		x: number;
		y: number;
		pts: number;
		count: number;
		name: string;
		big: boolean;
	}[] = [];
	/** Penalties this frame, merged the same way. */
	private readonly pendingPenalties: {
		x: number;
		y: number;
		pts: number;
		count: number;
		name: string;
	}[] = [];
	private penaltyMsgTime = -10;
	/** Where the bomb sight's arc meets the ground (NaN when hidden). */
	private sightX = NaN;
	private readonly post: PostFrame = {
		flash: [0, 0, 0],
		damage: 0,
		aberration: 0.002,
		waves: new Float32Array(32),
		numWaves: 0,
		skyFlash: [0, -1, 0],
		lens: 1
	};
	private pilotFrame: PilotInput = { ...NO_INPUT };
	private pilotSub: PilotInput = { ...NO_INPUT };
	private p2Frame: PilotInput = { ...NO_INPUT };
	private p2Sub: PilotInput = { ...NO_INPUT };
	private cssW = 1280;
	private cssH = 720;

	constructor(
		readonly canvas: HTMLCanvasElement,
		private readonly cb: GameCallbacks,
		quality: Quality
	) {
		this.renderer = new Renderer(canvas, quality);
		this.renderer.roadParams = [3.4, WORLD.baseMaxX + 30, WORLD.terrainMaxX, 0];
		const models = createModels(this.renderer);
		this.world = new World(2024);
		this.world.base = new AirBase();
		const river = this.world.river;
		if (river) {
			const m = river.mesh();
			const [x0, x1] = river.extent();
			this.renderer.water.setMesh(m.vertices, m.indices, x0, x1);
			this.renderer.roadGap = [river.x0 - river.bridgeHalf, river.x0 + river.bridgeHalf];
			this.renderer.water.shoal = SHOAL;
		}
		this.world.sound = this.audio;
		this.renderer.ground = this.world.biome.ground;
		this.terrainView = new TerrainView(this.renderer, this.world.terrain);
		this.view = new SceneView(models);
		this.waves = new WaveDirector(1);
		this.wireEvents();
	}

	private wireEvents(): void {
		const w = this.world;
		w.events = {
			kill: (name, score, x, y, by) => this.onKill(name, score, x, y, by),
			message: (text, sub, tone) => {
				if (this.phase !== 'playing' || !text) return;
				this.cb.message({ id: this.msgId++, text, sub: sub ?? '', tone: tone ?? 'info' });
			},
			playerHit: (amount) => {
				this.damageFlash = Math.min(1, this.damageFlash + 0.15 + amount * 0.03);
			},
			supply: (x, y) => {
				if (this.phase !== 'playing') return;
				const id = w.nearestPilot(x, y)?.resupply() ?? null;
				if (!id) return;
				this.popups?.spawn(`+1 ${BOMBS[id].short}`, 'supplies captured', x, y + 8, 'supply');
				this.audio.play('pickup', x, y, 0.8);
			},
			slowmo: (scale, duration) => {
				this.slowScale = Math.min(this.slowTimer > 0 ? this.slowScale : 1, scale);
				this.slowTimer = Math.max(this.slowTimer, duration);
			},
			penalty: (name, points, x, y) => this.onPenalty(name, points, x, y)
		};
	}

	/** Collateral damage in a no-fire zone: lose score and the kill chain. */
	private onPenalty(name: string, points: number, x: number, y: number): void {
		if (this.phase !== 'playing') return;
		this.score = Math.max(0, this.score - points);
		this.combo = 0;
		this.comboTimer = 0;
		const near = this.pendingPenalties.find((k) => Math.abs(k.x - x) < 40);
		if (near) {
			near.pts += points;
			near.count++;
			if (name !== 'Civilian killed') near.name = name;
		} else {
			this.pendingPenalties.push({ x, y, pts: points, count: 1, name });
		}
		const top = this.feed[0];
		if (top && top.points < 0 && top.text.startsWith(name) && this.time - this.feedTime < 0.6) {
			const n = Number(/×(\d+)$/.exec(top.text)?.[1] ?? 1) + 1;
			top.text = `${name} ×${n}`;
			top.points -= points;
		} else {
			this.feed.unshift({ id: this.feedId++, text: name, points: -points });
			if (this.feed.length > 5) this.feed.length = 5;
		}
		this.feedTime = this.time;
		if (this.time - this.penaltyMsgTime > 6) {
			this.penaltyMsgTime = this.time;
			this.cb.message({
				id: this.msgId++,
				text: 'NO-FIRE ZONE',
				sub: 'Civilians are taking fire · score penalty',
				tone: 'warn'
			});
		}
	}

	private onKill(name: string, score: number, x: number, y: number, by: Owner): void {
		if (this.phase !== 'playing' || by !== 'player') return;
		this.kills++;
		this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
		this.focus.reward(0.04);
		this.comboTimer = 3;
		this.bestCombo = Math.max(this.bestCombo, this.combo);
		if (name === 'Interceptor' || name === 'Gunship' || name === 'Attack jet')
			this.audio.radio(['splash']);
		if (this.combo === 6) this.audio.radio(['streak']);
		const mult = this.multiplier();
		const pts = score * mult;
		this.score += pts;
		this.world.command.reward(score);
		const near = this.pendingKills.find((k) => Math.abs(k.x - x) < 40);
		if (near) {
			near.pts += pts;
			near.count++;
			near.y = Math.max(near.y, y);
			near.big ||= score >= 200;
		} else {
			this.pendingKills.push({ x, y, pts, count: 1, name, big: score >= 200 });
		}
		const top = this.feed[0];
		if (top && top.text.startsWith(name) && this.time - this.feedTime < 0.6) {
			const n = Number(/×(\d+)$/.exec(top.text)?.[1] ?? 1) + 1;
			top.text = `${name} ×${n}`;
			top.points += pts;
		} else {
			this.feed.unshift({ id: this.feedId++, text: name, points: pts });
			if (this.feed.length > 5) this.feed.length = 5;
		}
		this.feedTime = this.time;
	}

	private flushKills(): void {
		const mult = this.multiplier();
		for (const k of this.pendingKills) {
			const sub =
				k.count > 1
					? `${k.count} kills${mult > 1 ? ` · ×${mult}` : ''}`
					: mult > 1
						? `${k.name} ×${mult}`
						: k.name;
			this.popups?.spawn(`+${k.pts}`, sub, k.x, k.y, k.big || k.count >= 4 ? 'big' : 'score');
		}
		this.pendingKills.length = 0;
		for (const k of this.pendingPenalties) {
			const sub = k.count > 1 ? `${k.count} casualties` : k.name;
			this.popups?.spawn(`−${k.pts}`, sub, k.x, k.y, 'penalty');
		}
		this.pendingPenalties.length = 0;
	}

	private multiplier(): number {
		return Math.min(1 + Math.floor(Math.max(this.combo - 1, 0) / 3), 8);
	}

	// ------------------------------------------------------------ lifecycle

	start(): void {
		this.resize();
		this.setupAttract();
		this.last = performance.now();
		this.raf = requestAnimationFrame(this.frame);
		this.input.attach(window, this.canvas);
	}

	dispose(): void {
		cancelAnimationFrame(this.raf);
		this.input.detach(window, this.canvas);
		this.audio.dispose();
	}

	resize(): void {
		this.cssW = this.canvas.clientWidth || window.innerWidth;
		this.cssH = this.canvas.clientHeight || window.innerHeight;
		this.renderer.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
		this.world.camera.aspect = this.renderer.width / this.renderer.height;
	}

	setQuality(q: Quality): void {
		this.renderer.setQuality(q);
		this.resize();
	}

	/** Turns the vintage camera lens look on or off. */
	setLens(on: boolean): void {
		this.post.lens = on ? 1 : 0;
		this.world.camera.lens = on ? LENS_BARREL : 0;
	}

	private setPhase(p: GamePhase): void {
		this.phase = p;
		this.input.capture = p === 'playing';
		// The title screen's hangar cards cover the lower third: lift the battle above them.
		this.world.camera.groundBias = p === 'title' ? 70 : 0;
		this.cb.phase(p);
	}

	private setupAttract(): void {
		const w = this.world;
		w.reset();
		this.focus.reset();
		this.killCam.reset();
		this.targeting.clear();
		w.godMode = true;
		this.coop = this.input.coop = false;
		this.squadron = new Squadron(1);
		w.player = new Player(this.aircraft, 520, w.ground(520) + 80, 0, this.loadout, this.upgrades);
		w.player.invuln = 0;
		this.spawnDemoConvoy(760);
		w.camera.interest = null;
		w.camera.snap(w.player, w.ground(520));
		this.envPhase = this.envTarget = ENV_BY_WAVE[0];
		w.weather.set(CLEAR, true);
		this.setPhase('title');
	}

	private spawnDemoConvoy(startX: number): void {
		const w = this.world;
		const plan = planWave(
			4,
			7 + Math.floor(this.time),
			w.units.filter((u) => u.def.isStatic && u.alive).length
		);
		for (const s of plan.statics) w.spawnUnit(s.kind, s.x, s.kind === 'searchlight' ? -9 : -11);
		let x = startX;
		for (const o of plan.orders) {
			if (o.kind === 'fighter' || o.kind === 'heli') continue;
			if (o.kind === 'train') {
				w.railway?.spawnTrain(w, trainConsist(4), x + 90);
				continue;
			}
			w.spawnUnit(o.kind, x, o.z, -1);
			x += rnd.range(10, 30);
			if (x > WORLD.enemySpawnX - 50) break;
		}
	}

	/** Shows the chosen aircraft (and its loadout) flying behind the menus. */
	preview(aircraft: AircraftId, loadout?: Loadout, upgrades?: UpgradeLevels): void {
		this.aircraft = aircraft;
		this.loadout = loadout;
		this.upgrades = upgrades;
		const p = this.world.player;
		if (this.phase !== 'title' || !p) return;
		const np = new Player(aircraft, p.x, p.y, p.angle, loadout, upgrades);
		np.vx = p.vx;
		np.vy = p.vy;
		np.invuln = 0;
		this.world.player = np;
	}

	newGame(
		aircraft: AircraftId,
		loadout?: Loadout,
		start: ModeStart = { mode: 'war' },
		upgrades?: UpgradeLevels
	): void {
		this.aircraft = aircraft;
		this.loadout = loadout;
		this.upgrades = upgrades;
		this.mode = start.mode;
		const command = this.mode === 'command';
		this.aiming = null;
		this.tutorial = this.mode === 'tutorial' ? new Tutorial() : null;
		this.flying = this.mode === 'tutorial' ? TRAINER : aircraft;
		this.flyingLoadout = this.mode === 'tutorial' ? undefined : loadout;
		this.flyingUpgrades = this.mode === 'tutorial' ? undefined : upgrades;
		this.coop = this.input.coop = !!start.coop && this.mode === 'war';
		this.squadron = new Squadron(this.coop ? 2 : 1);
		this.wavesScored = 0;
		this.checkpointsScored = 0;
		this.hqsScored = 0;
		this.debriefTimer = 0;
		const w = this.world;
		this.useBiome(this.biomeFor(start));
		w.reset();
		w.godMode = false;
		this.score = 0;
		this.combo = 0;
		this.comboTimer = 0;
		this.bestCombo = 0;
		this.kills = 0;
		this.playTime = 0;
		this.feed.length = 0;
		this.damageFlash = 0;
		this.popups?.clear();
		this.focus.reset();
		this.killCam.reset();
		this.targeting.clear();
		this.p2Targeting.clear();
		// The commander has no aircraft of their own: the airfield is their headquarters.
		if (!command) this.spawnPlayer();
		// Player two takes the AI wingman's place in co-op.
		this.wingmanDue = null;
		if (this.coop) this.spawnPlayer2();
		else if (this.mode === 'war') this.wingmanDue = 'plain';
		this.radioWatch.reset();
		if (!command) this.audio.radio(['sortie']);
		const seed = Math.floor(Math.random() * 1e6);
		this.waves = new WaveDirector(
			seed,
			this.mode !== 'tutorial' ? { tweaks: warTweaks, rolling: true, quietStart: true } : {}
		);
		// Training has no war in it: just the lessons' targets.
		if (this.mode !== 'tutorial')
			w.war.start(w, { hqHp: HQ_HP, auto: !command, ourHq: command }, seed);
		if (command) {
			// The enemy commander buys their whole army, as we buy ours: no waves.
			this.difficulty = (start.mode === 'command' && start.difficulty) || DEFAULT_DIFFICULTY;
			this.challenge = (start.mode === 'command' && start.challenge) || DEFAULT_CHALLENGE;
			const level = difficultyDef(this.difficulty);
			const rules = challengeDef(this.challenge);
			w.command.start(undefined, { income: rules.income, allows: rules.allows });
			w.enemyCommand.start(level.enemyFunds, { income: level.enemyIncome });
			this.enemyCommander.pace = level.pace;
			this.enemyCommander.skill = level.skill;
			w.wave = 1;
			this.aimX = Number.NaN;
			this.viewX = WORLD.baseMaxX + 420;
			this.viewZoom = VIEW_ZOOM;
			this.commandTab = 'infantry';
			this.commandCamera(0, null, true);
		}
		this.envPhase = this.envTarget = this.envFor(1);
		w.weather.set(this.weatherFor(1), true);
		this.setPhase('playing');
		if (this.tutorial) this.tutorial.start(w);
		else {
			const brief = command ? COMMAND_BRIEF : BRIEF;
			this.cb.message({ id: this.msgId++, text: brief.text, sub: brief.sub, tone: 'info' });
			if (!command) this.waves.begin(w, 1);
		}
		void this.audio.unlock();
	}

	/** Map a sortie is flown on: the valley, unless the player picked another. */
	private biomeFor(start: ModeStart): BiomeId {
		if (start.mode === 'tutorial') return 'temperate';
		return start.biome ?? 'temperate';
	}

	/** Regrows the battlefield for a biome and pushes the new ground to the GPU. */
	private useBiome(id: BiomeId): void {
		const w = this.world;
		if (!w.setBiome(id)) return;
		this.renderer.ground = w.biome.ground;
		this.terrainView.syncAll();
	}

	/** Time of day for a wave of the current sortie. */
	private envFor(wave: number): number {
		if (this.mode === 'tutorial') return ENV_BY_WAVE[0];
		return wave < ENV_BY_WAVE.length
			? ENV_BY_WAVE[wave]
			: 5 + (wave - ENV_BY_WAVE.length + 1) * 0.6;
	}

	/** Sky and wind for a wave of the current sortie. */
	private weatherFor(wave: number): WeatherSpec {
		if (this.mode === 'tutorial') return CLEAR;
		return weatherForWave(wave);
	}

	private spawnPlayer(): void {
		const w = this.world;
		const x = WORLD.runwayMinX + P1_PARK;
		const lost = w.player;
		w.player = new Player(
			this.flying,
			x,
			w.ground(x) + 45,
			0.08,
			this.flyingLoadout,
			this.flyingUpgrades
		);
		this.parkOnRunway(w.player);
		// A spent nuke stays spent: a replacement aircraft doesn't bring a new one this wave.
		if (lost) w.player.ammo.nuke = Math.min(w.player.ammo.nuke, lost.ammo.nuke);
		// With player two still up, let the camera ease back over rather than cut.
		if (w.player2?.alive) return;
		w.camera.interest = null;
		w.camera.snap(w.player, w.ground(x));
	}

	/** Player two waits on the runway just behind the player, in the same airframe. */
	private spawnPlayer2(): void {
		const w = this.world;
		const x = WORLD.runwayMinX + P2_PARK;
		const lost = w.player2;
		w.player2 = new Player(
			this.flying,
			x,
			w.ground(x) + 60,
			0.08,
			this.flyingLoadout,
			this.flyingUpgrades
		);
		this.parkOnRunway(w.player2);
		if (lost) w.player2.ammo.nuke = Math.min(w.player2.ammo.nuke, lost.ammo.nuke);
		if (w.player?.alive) return;
		w.camera.interest = null;
		w.camera.snap(w.player2, w.ground(x));
	}

	/** Fixed-wing sorties start on the runway, brakes on; rotors and the gunship start in the air. */
	private parkOnRunway(p: Player): void {
		if (p.flight !== 'fixed') return;
		p.park(this.world);
		if (p === this.world.player)
			this.world.events.message('CLEARED FOR TAKEOFF', 'Tower: runway is yours, wind calm', 'info');
	}

	/** Two takes off after the player, so he never joins the queue on the runway. */
	private launchWingman(): void {
		const w = this.world;
		const p = w.player;
		if (!this.wingmanDue || !p || !p.alive || p.landed) return;
		if (p.y - w.surface.clearance(p.x) < WINGMAN_JOIN_ALT) return;
		w.wingman = new Wingman(p.x - 70, p.y + 18);
		if (this.wingmanDue === 'join')
			w.events.message(
				'TWO JOINS THE FLIGHT',
				'Your wingman: T attack · G cover · H air defences · Y rearm',
				'good'
			);
		this.wingmanDue = null;
	}

	/** Whether the pilot is down at the airfield and may trade their aircraft for another. */
	canSwap(): boolean {
		if (this.mode === 'tutorial' || (this.phase !== 'playing' && this.phase !== 'paused'))
			return false;
		return !!this.world.player?.canChangeAircraft;
	}

	/** Trades the landed aircraft for another; later respawns fly it too. */
	swapAircraft(aircraft: AircraftId, loadout?: Loadout, upgrades?: UpgradeLevels): boolean {
		if (!this.canSwap()) return false;
		this.aircraft = this.flying = aircraft;
		this.loadout = this.flyingLoadout = loadout;
		this.upgrades = this.flyingUpgrades = upgrades;
		this.targeting.clear();
		this.spawnPlayer();
		this.world.events.message(
			`${AIRCRAFT[aircraft].name} READY`,
			'Ground crew: fresh airframe, fuelled and armed',
			'good'
		);
		return true;
	}

	pause(): void {
		if (this.phase !== 'playing') return;
		this.setPhase('paused');
		this.audio.silenceAll();
	}

	resume(): void {
		if (this.phase !== 'paused') return;
		this.setPhase('playing');
		this.last = performance.now();
	}

	toTitle(): void {
		this.popups?.clear();
		this.audio.silenceAll();
		this.setupAttract();
	}

	// ------------------------------------------------------------ loop

	private readonly frame = (now: number): void => {
		this.raf = requestAnimationFrame(this.frame);
		const raw = clamp((now - this.last) / 1000, 0.0005, 0.05);
		this.last = now;
		this.fpsAcc += raw;
		this.fpsFrames++;
		if (this.fpsAcc > 0.5) {
			this.fps = this.fpsFrames / this.fpsAcc;
			this.fpsAcc = 0;
			this.fpsFrames = 0;
		}
		this.input.poll();
		if (this.input.pausePressed()) {
			if (this.phase === 'playing') this.pause();
			else if (this.phase === 'paused') this.resume();
		}
		if (this.phase !== 'paused') {
			if (this.slowTimer > 0) {
				this.slowTimer -= raw;
				if (this.slowTimer <= 0) this.slowScale = 1;
			}
			const scripted =
				this.slowTimer > 0
					? this.slowScale + (1 - this.slowScale) * Math.max(0, 1 - this.slowTimer * 4)
					: 1;
			this.updateFocus(raw);
			this.updateKillCam(raw);
			const scale = Math.min(scripted, this.focus.timeScale(), this.killCam.timeScale());
			this.audio.setTimeWarp(scale);
			const dt = raw * scale * this.timeScale;
			const steps = Math.max(1, Math.ceil(dt / STEP - 0.01));
			this.pilotFrame = this.phase === 'playing' ? this.input.pilot() : { ...NO_INPUT };
			this.p2Frame = this.phase === 'playing' && this.coop ? this.input.p2Pilot() : { ...NO_INPUT };
			this.confirm = this.input.confirmPressed();
			this.skip = this.input.enterPressed();
			this.aim(raw);
			this.orders();
			const commanding = this.mode === 'command' && this.phase === 'playing';
			const ci = commanding ? this.input.command(this.cssW) : null;
			if (ci && !this.autoplay) this.commandOrders(ci);
			Object.assign(this.pilotSub, this.pilotFrame, {
				bombPressed: false,
				flare: false,
				cycle: 0,
				select: null,
				missiles: null,
				gear: false
			});
			Object.assign(this.p2Sub, this.p2Frame, {
				bombPressed: false,
				flare: false,
				cycle: 0,
				select: null,
				missiles: null,
				gear: false
			});
			for (let i = 0; i < steps; i++)
				this.step(
					dt / steps,
					i === 0 ? this.pilotFrame : this.pilotSub,
					i === 0 ? this.p2Frame : this.p2Sub
				);
			if (this.killCam.active) this.killCam.drive(this.world.camera, raw);
			if (this.mode === 'command' && this.phase !== 'title') this.commandCamera(raw, ci);
		}
		this.draw(raw);
		this.input.endFrame();
	};

	/** Focus toggling, meter and the aircraft's sharpened handling. */
	private updateFocus(raw: number): void {
		const w = this.world;
		const playing = this.phase === 'playing';
		// Focus slows the whole battle, so in co-op either pilot can call it while one is flying.
		const allowed = playing && w.pilots().some((p) => p.alive && !p.landed);
		const event = this.focus.update(raw, playing && this.input.focusPressed(), allowed);
		if (event === 'start') this.audio.play('focusIn', w.camera.x, w.camera.y, 0.9);
		else if (event === 'stop') this.audio.play('focusOut', w.camera.x, w.camera.y, 0.8);
		for (const p of w.pilots()) p.focus = this.focus.active;
	}

	/** Kill cam: only when the pilot can spare the view for a moment. */
	private updateKillCam(raw: number): void {
		const w = this.world;
		const p = w.player;
		// Not in co-op: player two still needs the shot while player one's bomb falls.
		const allowed =
			this.phase === 'playing' &&
			!this.coop &&
			!!p &&
			p.alive &&
			!p.landed &&
			!this.focus.active &&
			p.y - w.ground(p.x) > 35 &&
			!w.missiles.some((m) => m.target === p);
		if (this.killCam.update(raw, w, allowed))
			this.audio.play('focusIn', w.camera.x, w.camera.y, 0.5);
	}

	/**
	 * Reticle and locks: designates the guided bomb's target every frame and
	 * turns a missile key press into a salvo at the painted (or picked) targets.
	 */
	private aim(raw: number): void {
		this.p2Aim();
		const w = this.world;
		const p = w.player;
		if (this.phase !== 'playing' || !p || !p.alive) {
			this.targeting.clear();
			w.designator = null;
			return;
		}
		const cursor = this.input.cursor(raw, this.cssW, this.cssH);
		this.targeting.update(
			raw,
			w,
			w.camera,
			this.cssW,
			this.cssH,
			cursor,
			this.focus.active,
			p.missilesFree
		);
		if (this.targeting.acquired > 0) this.audio.play('lockOn', w.camera.x, w.camera.y, 0.7);
		this.pilotFrame.designate = this.targeting.bombTarget(w);
		const slot = this.input.slotPressed();
		if (slot !== null) this.pilotFrame.select = p.carried[slot] ?? null;
		if (!this.input.missilePressed()) return;
		if (p.missilesFree <= 0) this.audio.play('empty', p.x, p.y, 0.7);
		else if (!p.landed) this.pilotFrame.missiles = this.targeting.salvo(w, p, p.missilesFree);
	}

	// ------------------------------------------------------------ command mode

	/**
	 * An order from the commander's bar (a click or its hotkey). Troops and
	 * jets go straight away; a strike waits for the spot to be clicked.
	 */
	commandSelect(id: CommandId): void {
		if (this.mode !== 'command' || this.phase !== 'playing') return;
		const w = this.world;
		const x = w.camera.x,
			y = w.camera.y;
		if (COMMANDS[id].group === 'strike') {
			if (this.aiming === id) {
				this.aiming = null;
				return;
			}
			const why = w.command.refusal(w, id);
			if (why) return this.refused(why);
			this.aiming = id;
			this.audio.play('lockOn', x, y, 0.6);
			return;
		}
		const why = w.command.order(w, id);
		if (why) return this.refused(why);
		this.audio.play('select', x, y, 0.7);
	}

	/** Puts the strike being aimed away. */
	commandCancel(): void {
		this.aiming = null;
	}

	/** Opens a page of the order bar (a click on its tab, or Q / E / Tab). */
	commandTabSelect(tab: CommandTab): void {
		if (this.commandTab === tab) return;
		this.commandTab = tab;
		const w = this.world;
		this.audio.play('select', w.camera.x, w.camera.y, 0.4);
	}

	/** Says why an order didn't go through. */
	private refused(why: string): void {
		const w = this.world;
		this.audio.play('empty', w.camera.x, w.camera.y, 0.7);
		const text = REFUSAL[why];
		if (text) w.events.message(text[0], text[1], 'warn');
	}

	/** Hotkeys, the strike cursor and clicks on the battlefield. */
	private commandOrders(ci: CommandInput): void {
		const w = this.world;
		if (ci.tab !== 0) {
			const i = COMMAND_TABS.findIndex((t) => t.id === this.commandTab);
			const n = COMMAND_TABS.length;
			this.commandTabSelect(COMMAND_TABS[(i + ci.tab + n) % n].id);
		}
		for (const code of ci.keys) {
			// Strikes keep their own keys; the number row picks from the open page.
			const strike = COMMAND_ORDER.find(
				(k) => COMMANDS[k].tab === null && COMMANDS[k].code === code
			);
			const slot = TAB_KEYS.findIndex(([c]) => c === code);
			const id = strike ?? (slot >= 0 ? tabOrders(this.commandTab)[slot] : undefined);
			if (id) this.commandSelect(id);
		}
		if (ci.cancel) this.aiming = null;
		const hit = ci.x >= 0 ? w.camera.unproject(ci.x, ci.y, this.cssW, this.cssH) : null;
		this.aimX = hit ? clamp(hit[0], WORLD.arenaMinX, WORLD.arenaMaxX) : Number.NaN;
		if (!ci.click || !this.aiming || !Number.isFinite(this.aimX)) return;
		const why = w.command.order(w, this.aiming, this.aimX);
		if (why) return this.refused(why);
		this.aiming = null;
	}

	/** How far out the commander's view sits for a zoom setting (0 close, 1 wide). */
	private viewDist(zoom: number): number {
		return VIEW_NEAR * Math.pow(VIEW_FAR / VIEW_NEAR, zoom);
	}

	/**
	 * The commander's view: high over the battle line and tilted down on it,
	 * panned along the road and zoomed by the player.
	 */
	private commandCamera(raw: number, ci: CommandInput | null, snap = false): void {
		const w = this.world;
		const cam = w.camera;
		let drag = false;
		if (ci) {
			const before = this.viewDist(this.viewZoom);
			this.viewZoom = clamp(this.viewZoom + ci.wheel * WHEEL_ZOOM + ci.zoom * raw * 0.6, 0, 1);
			const span = this.viewDist(this.viewZoom);
			// The wheel zooms toward whatever is under the cursor, so it stays put on screen.
			if (ci.wheel !== 0 && Number.isFinite(this.aimX))
				this.viewX = this.aimX + (this.viewX - this.aimX) * (span / before);
			this.viewX += ci.pan * span * (ci.fast ? 2.4 : 1.2) * raw;
			// Dragging moves the map with the mouse, one to one at the ground.
			if (ci.dragX !== 0) {
				const perPx = (2 * Math.tan(cam.fovY / 2) * cam.dist) / Math.max(1, this.cssH);
				this.viewX -= ci.dragX * perPx;
			}
			drag = ci.dragging;
			if (ci.front) this.viewX = w.command.front(w);
		}
		this.viewX = clamp(this.viewX, WORLD.arenaMinX + 150, WORLD.enemyBaseMaxX + 30);
		const dist = this.viewDist(this.viewZoom);
		cam.x = snap || drag ? this.viewX : damp(cam.x, this.viewX, 7, raw);
		cam.dist = snap ? dist : damp(cam.dist, dist, 6, raw);
		cam.pitch = cam.pitchTarget = COMMAND_PITCH;
		cam.interest = null;
		cam.second = null;
		const halfH = Math.tan(cam.fovY / 2) * cam.dist;
		cam.y = w.ground(cam.x) + halfH * VIEW_LIFT;
	}

	private commandHud(): CommandHud {
		const w = this.world;
		const c = w.command;
		const aiming = this.aiming as StrikeOrder | null;
		return {
			funds: Math.floor(c.funds),
			income: c.income(w),
			tab: this.commandTab,
			tabs: COMMAND_TABS,
			eta: aiming && Number.isFinite(this.aimX) ? c.eta(w, aiming, this.aimX) : null,
			items: COMMAND_ORDER.map((id) => {
				const d = COMMANDS[id];
				return {
					id,
					name: d.name,
					short: d.short,
					tip: d.tip,
					group: d.group,
					tab: d.tab,
					cost: d.cost,
					key: d.key,
					cooldown: d.cooldown > 0 ? (c.cooldowns[id] ?? 0) / d.cooldown : 0,
					refusal: c.refusal(w, id)
				};
			}),
			aiming: this.aiming,
			army: w.allies.alive(),
			armyMax: ARMY_LIMIT,
			air: c.airborne(w),
			airMax: AIR_LIMIT,
			drones: c.drones(w),
			dronesMax: DRONE_LIMIT,
			queued: c.queue.length,
			enemy: {
				funds: Math.floor(w.enemyCommand.funds),
				army: enemyArmy(w),
				air: w.enemyCommand.airborne(w)
			}
		};
	}

	/** Turns an order key into a command for the wingman. */
	private orders(): void {
		const w = this.world;
		const wing = w.wingman;
		const p = w.player;
		if (this.phase !== 'playing' || !wing) return;
		const order = this.input.orderPressed();
		if (!order) return;
		const pick = order === 'attack' && p && p.alive ? this.targeting.primary(w, p) : null;
		const ok = wing.command(w, order, pick ? { unit: pick.unit, air: pick.air } : null);
		this.audio.play(ok ? 'select' : 'empty', w.camera.x, w.camera.y, 0.6);
		if (ok) this.audio.radio([ORDER_CUE[order]]);
	}

	/** Player two's missiles go to the best target ahead of its nose. */
	private p2Aim(): void {
		const w = this.world;
		const q = w.player2;
		if (this.phase !== 'playing' || !q || !q.alive) {
			this.p2Targeting.clear();
			return;
		}
		if (!this.input.p2MissilePressed()) return;
		if (q.missilesFree <= 0) this.audio.play('empty', q.x, q.y, 0.7);
		else if (!q.landed) this.p2Frame.missiles = this.p2Targeting.salvo(w, q, q.missilesFree);
	}

	private step(dt: number, pilot: PilotInput, wing: PilotInput): void {
		const w = this.world;
		this.time += dt;
		const p = w.player;
		const q = w.player2;
		const auto = this.phase === 'title' || (this.autoplay && this.phase === 'playing');
		const inp = !p
			? null
			: auto
				? this.autopilot.update(w, p, dt)
				: this.phase === 'playing'
					? pilot
					: NO_INPUT;
		const p2Inp = !q
			? null
			: auto
				? this.p2Autopilot.update(w, q, dt)
				: this.phase === 'playing'
					? wing
					: NO_INPUT;
		const showcase = this.showcase && this.phase === 'title';
		w.camera.locked = showcase || this.killCam.active;
		simulateWorld(w, dt, inp, p2Inp);
		if (showcase && p) {
			// Hangar: hold a close, slightly trailing shot so the aircraft sits mid-screen.
			const cam = w.camera;
			// Carry the camera with the aircraft first so the easing never lags behind it.
			cam.x = damp(cam.x + p.vx * dt, p.x, 6, dt);
			cam.y = damp(cam.y + p.vy * dt, p.y + 1, 6, dt);
			cam.dist = damp(cam.dist, 12 + p.def.radius * 3.4, 3, dt);
		}
		if (p && this.phase === 'title') {
			p.hp = p.def.hp;
			p.systems.engine = p.systems.wing = p.systems.hydraulics = 0;
			for (const id of BOMB_ORDER)
				if (p.ammo[id] < 1 && id !== 'thunder' && id !== 'nuke') p.ammo[id] = p.capacity(id);
		}
		if (this.phase === 'playing') {
			if (this.mode === 'command') {
				if (this.autoplay) this.commandAuto.update(w, dt);
				this.enemyCommander.update(w, dt);
			}
			this.waves.update(w, dt);
			this.rules(dt);
		}
		if (this.phase === 'title') this.attract(dt);
		this.envPhase += clamp(this.envTarget - this.envPhase, -dt * 0.18, dt * 0.18);
	}

	private attract(dt: number): void {
		this.attractTimer -= dt;
		const w = this.world;
		if (this.attractTimer <= 0) {
			this.attractTimer = 20;
			if (w.hostilesAlive() < 14) this.spawnDemoConvoy(rnd.range(1300, 1900));
		}
	}

	private rules(dt: number): void {
		const w = this.world;
		const p = w.player;
		this.playTime += dt;
		this.comboTimer -= dt;
		if (this.comboTimer <= 0) this.combo = 0;
		this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4);
		const training = this.mode === 'tutorial';
		if (training) {
			// Training can't be lost: the airfield holds and the aircraft is hard to kill.
			w.base.hp = w.base.maxHp;
			if (p && p.alive && !p.dying) p.hp = Math.max(p.hp, p.def.hp * 0.3);
		}
		const sq = this.squadron;
		// The commander flies nothing, so only the airfield can be lost.
		if (this.mode !== 'command') {
			if (sq.update(0, !!p?.crashed, dt, training) === 'respawn') {
				this.spawnPlayer();
				this.audio.radio(['sortie']);
			}
			if (this.coop && sq.update(1, !!w.player2?.crashed, dt, training) === 'respawn')
				this.spawnPlayer2();
			if (sq.allOut()) return this.gameOver('All aircraft lost');
			this.launchWingman();
		}
		// In command mode each side has an HQ, and that is what falls; otherwise the airfield.
		if (w.war.ourHqUp) {
			if (w.war.ourHq.destroyed) return this.gameOver('Our HQ has fallen');
		} else if (w.base.hp <= 0) return this.gameOver('The airfield has fallen');
		if (this.waves.cleared > this.wavesScored) {
			this.wavesScored = this.waves.cleared;
			const bonus = waveBonus(this.waves.difficulty(), w.base.hp / w.base.maxHp);
			this.score += bonus;
			this.popups?.spawn(
				`+${bonus.toLocaleString()}`,
				'wave bonus',
				w.camera.x,
				w.camera.y + 25,
				'big'
			);
		}
		if (w.war.taken > this.checkpointsScored) {
			const bonus = (w.war.taken - this.checkpointsScored) * CHECKPOINT_BONUS;
			this.checkpointsScored = w.war.taken;
			this.bonus(bonus, 'checkpoint taken');
		}
		if (w.war.hqsDestroyed > this.hqsScored) {
			this.hqsScored = w.war.hqsDestroyed;
			this.bonus(HQ_BONUS, 'enemy HQ destroyed');
		}
		if (this.tutorial) {
			this.tutorial.update(w, dt, {
				focus: this.focus.active,
				confirm: this.confirm,
				skip: this.skip
			});
			// One key press is one step, however many sub-steps this frame runs.
			this.confirm = this.skip = false;
			if (this.tutorial.finished) return this.finish();
		}
		if (this.mode !== 'tutorial') {
			if (this.debriefTimer > 0) {
				this.debriefTimer -= dt;
				if (this.debriefTimer <= 0) return this.finish();
			} else if (w.war.hq.destroyed) {
				this.debriefTimer = DEBRIEF_DELAY;
				this.audio.play('siren', w.camera.x, w.camera.y, 0.5);
			}
		}
		this.envTarget = this.envFor(Math.max(1, this.waves.wave));
		w.weather.set(this.weatherFor(Math.max(1, this.waves.wave)));
	}

	private bonus(points: number, label: string): void {
		const w = this.world;
		this.score += points;
		this.popups?.spawn(`+${points.toLocaleString()}`, label, w.camera.x, w.camera.y + 25, 'big');
	}

	/** The best score is kept, and a battle pays credits; training just marks the pilot trained. */
	private result(outcome: 'failed' | 'complete', reason: string): GameOverStats {
		const base = {
			mode: this.mode,
			outcome,
			title: MODE_TITLE[this.mode],
			score: this.score,
			wave: this.waves.wave,
			kills: this.kills,
			civilians: this.world.civilians.killed,
			bestCombo: this.bestCombo,
			time: this.playTime,
			best: this.score,
			newBest: false,
			reason
		};
		if (this.mode === 'tutorial') {
			if (outcome === 'complete') writeTrained();
			return base;
		}
		const command = this.mode === 'command';
		const record = command ? this.commandRecord(outcome) : undefined;
		const best = readBest(command);
		const newBest = this.score > best;
		if (newBest) writeBest(this.score, command);
		const award = battleCredits({ score: this.score, won: outcome === 'complete' });
		const wallet = grant(loadOrMigrate(), award.total);
		saveProgression(wallet);
		return {
			...base,
			best: Math.max(best, this.score),
			newBest,
			credits: { ...award, balance: wallet.credits },
			command: record
		};
	}

	/** A command win goes on the board for its difficulty and challenge. */
	private commandRecord(outcome: 'failed' | 'complete'): GameOverStats['command'] {
		const difficulty = difficultyDef(this.difficulty).name;
		const challenge = challengeDef(this.challenge).name;
		const board =
			outcome === 'complete'
				? writeTime(this.difficulty, this.challenge, this.playTime)
				: { times: readTimes(this.difficulty, this.challenge), rank: null };
		return { difficulty, challenge, ...board };
	}

	private finish(): void {
		if (this.phase === 'gameover') return;
		const reason = this.mode === 'tutorial' ? 'You are cleared to fly' : 'The enemy HQ has fallen';
		this.setPhase('gameover');
		this.cb.gameOver(this.result('complete', reason));
	}

	private gameOver(reason: string): void {
		if (this.phase === 'gameover') return;
		this.setPhase('gameover');
		this.cb.gameOver(this.result('failed', reason));
	}

	// ------------------------------------------------------------ rendering

	private draw(dt: number): void {
		const w = this.world;
		const env = gradeEnvironment(environmentAt(this.envPhase), w.biome);
		applyWeather(env, w.weather);
		const fb = this.focus.blend;
		if (fb > 0.001) {
			// Bullet time: drained, cool and vignetted.
			env.saturation = lerp(env.saturation, 0.4, fb);
			env.contrast *= 1 + 0.16 * fb;
			env.vignette = lerp(env.vignette, 0.82, fb);
			env.tint = [
				lerp(env.tint[0], 0.86, fb),
				lerp(env.tint[1], 0.98, fb),
				lerp(env.tint[2], 1.16, fb)
			];
			env.bloom *= 1 + 0.35 * fb;
		}
		const kb = this.killCam.blend;
		if (kb > 0.001) {
			// Kill cam: warm, punchy and closed in.
			env.saturation *= 1 - 0.2 * kb;
			env.contrast *= 1 + 0.12 * kb;
			env.vignette = lerp(env.vignette, Math.max(env.vignette, 0.7), kb);
			env.tint = [env.tint[0] * (1 + 0.08 * kb), env.tint[1], env.tint[2] * (1 - 0.1 * kb)];
		}
		if (this.mode === 'command' && this.phase !== 'title') {
			// From the commander's height the far end of the road would vanish into the haze.
			env.fog[0] *= clamp(VIEW_CLEAR / w.camera.dist, 0.08, 1);
		}
		w.night = clamp(env.stars * 1.1, 0, 1);
		w.fx.nightFactor = w.night;
		this.terrainView.sync(10);
		w.camera.update(this.phase === 'paused' ? 0 : dt, w.player ? w.ground(w.player.x) : 0);
		const oneFrameMark = w.particles.count;
		this.view.frozen = this.phase === 'paused';
		this.view.collect(w, this.time);
		this.drawSight();

		const post = this.post;
		const fl = w.fx.flashLevel;
		const fc = w.fx.flashColor;
		post.flash[0] = fl * fc[0];
		post.flash[1] = fl * fc[1];
		post.flash[2] = fl * fc[2];
		const p = w.player;
		let lowHp = 0;
		if (this.phase === 'playing')
			for (const q of w.pilots())
				if (q.alive) lowHp = Math.max(lowHp, clamp(1 - q.hp / q.def.hp / 0.3, 0, 1));
		post.damage = clamp(
			this.damageFlash * 0.8 + lowHp * (0.25 + 0.15 * Math.sin(this.time * 6)),
			0,
			1
		);
		post.aberration = 0.0018 + w.fx.aberrationKick + post.damage * 0.006 + fb * 0.005;
		post.numWaves = w.fx.packWaves(post.waves, this.cssW, this.cssH);
		this.updateSkyFlash(dt);

		this.audio.setListener(w.camera.x, w.camera.y);
		this.audio.aircraft(this.phase === 'playing' ? engineSources(w) : [], {
			x: w.camera.x,
			y: w.camera.y,
			...w.camera.viewExtents()
		});
		this.audio.update(dt, {
			alive: !!p && p.alive,
			throttle: p?.throttle ?? 0,
			speed: p?.speed ?? 0,
			boosting: !!p?.boosting,
			prop: p?.def.engine === 'prop',
			rotor: p?.def.engine === 'rotor',
			siren: p?.alive ? p.siren : 0,
			lock: this.phase === 'playing' ? Math.max(0, ...w.pilots().map((q) => q.lockProgress)) : 0,
			inbound:
				this.phase === 'playing' && w.missiles.some((m) => w.pilots().some((q) => m.target === q)),
			active: this.phase === 'playing'
		});
		this.audio.alerts(
			dt,
			this.phase === 'playing' && p && !this.autoplay ? cockpitAlerts(w, p) : null
		);
		this.updateBattleAudio(dt);
		this.renderer.water.numRipples = w.fx.water.pack(this.renderer.water.ripples);
		this.renderer.render(w.camera.frame, env, w.lights, w.particles, post, this.time);
		this.flushKills();
		// One-frame glows (tracers, lamps, sight) were drawn; drop them now so a
		// paused game can't accumulate them frame after frame.
		w.particles.truncate(oneFrameMark);
		this.popups?.update(this.phase === 'paused' ? 0 : dt, (x, y) =>
			w.camera.project(x, y, 0, this.cssW, this.cssH)
		);
		this.targetingLayer?.render(this.targetingView());
		this.edgeLayer?.render(this.edgeView());
		this.hudTimer -= dt;
		if (this.hudTimer <= 0) {
			this.hudTimer = 1 / 15;
			this.cb.hud(this.snapshot());
		}
	}

	/** Radio chatter, in real time (not slowed by bullet time). */
	private updateBattleAudio(dt: number): void {
		const w = this.world;
		const p = w.player;
		const flying = this.phase === 'playing' && !this.autoplay && this.mode !== 'command';
		if (flying) {
			const s = radioState(w, p, this.waves.state, this.squadron.lives);
			this.audio.radio(this.radioWatch.update(s));
		}
		this.audio.updateRadio(dt, flying);
	}

	/**
	 * Draws the bomb sight and tells the camera what it must keep on screen:
	 * the predicted impact and any of our bombs still falling.
	 */
	private drawSight(): void {
		const w = this.world;
		const flying = this.phase === 'playing' || this.phase === 'paused';
		let lo = Infinity,
			hi = -Infinity;
		this.sightX = NaN;
		for (const p of flying ? w.pilots() : []) {
			if (!p.alive || p.landed) continue;
			const id = p.ammo[p.selected] > 0 ? p.selected : 'gp';
			// Guns and the radar-homing missile go where they point: no drop sight for them.
			if (id === 'gunpod' || id === 'arm') continue;
			const def = BOMBS[id];
			const pts = p === w.player ? this.sightPts : this.p2SightPts;
			// Rockets leave the rails at speed and fall like a bomb thrown forward.
			const boost = id === 'rockets' ? ROCKET_SPEED : 0;
			const designate = p === w.player ? this.pilotFrame.designate : null;
			const [svx, svy] = p.bombVelocity(w, def, p.x, p.y - 1.2, designate);
			const hit = predictImpact(
				w,
				p.x,
				p.y - 1.2,
				svx + Math.cos(p.angle) * boost,
				svy + Math.sin(p.angle) * boost,
				def.drag,
				pts,
				def.lift
			);
			if (p === w.player) this.sightX = hit.x;
			lo = Math.min(lo, hit.x);
			hi = Math.max(hi, hit.x);
			const c = hexToRgb(def.color);
			const col: [number, number, number] = [c[0] * 2.3, c[1] * 2.3, c[2] * 2.3];
			this.view.sight(w, pts, col);
			this.view.marker(w, hit.x, hit.y, this.time, col);
		}
		if (this.aiming && flying && Number.isFinite(this.aimX)) {
			const r = COMMANDS[this.aiming].radius ?? 20;
			this.view.blastZone(w, this.aimX, r, this.time, AIM_COLOR);
		}
		if (this.mode === 'command' && flying) {
			// Strikes on their way: a dimmer ring where each will land.
			for (const p of w.command.pending)
				if (p.t > 0)
					this.view.blastZone(w, p.x, COMMANDS[p.id].radius ?? 20, this.time, PENDING_COLOR);
		}
		if (lo > hi) {
			if (this.phase !== 'paused') w.camera.interest = null;
			return;
		}
		for (const b of w.bombs) {
			if (!b.alive || b.owner !== 'player') continue;
			lo = Math.min(lo, b.x);
			hi = Math.max(hi, b.x);
		}
		this.interest[0] = lo;
		this.interest[1] = hi;
		w.camera.interest = this.interest;
	}

	private edgeView(): readonly EdgeMarker[] {
		if (this.phase !== 'playing' || !this.edgeLayer) return NO_EDGES;
		return edgeMarkers(enemyContacts(this.world, this.projectCss), this.cssW, this.cssH);
	}

	private targetingView(): TargetingView {
		const t = this.targeting;
		const cam = this.world.camera;
		const visible = this.phase === 'playing' || this.phase === 'paused';
		const hover =
			visible && t.hover && !t.isLocked(t.hover.key)
				? t.marker(cam, t.hover, this.cssW, this.cssH)
				: null;
		const locks = [];
		if (visible) {
			for (const l of t.locks) {
				const m = t.marker(cam, l, this.cssW, this.cssH);
				if (m) locks.push(m);
			}
		}
		return {
			visible,
			cursor: visible && t.pointer ? { x: t.cursorX, y: t.cursorY } : null,
			focus: this.focus.blend,
			hover,
			locks,
			threats: visible ? this.threatMarkers() : [],
			pilots: visible && this.coop ? this.pilotTags() : [],
			allies: visible ? this.allyMarkers() : [],
			foes: visible && this.mode === 'command' ? this.foeMarkers() : [],
			places: visible && this.mode === 'command' ? this.placeTags() : [],
			planes: visible ? this.planeMarkers() : [],
			strikes: visible && this.mode === 'command' ? this.strikeLabels() : []
		};
	}

	/** Name boards over both airfields and the enemy HQ, wherever they are in shot. */
	private placeTags(): PlaceTag[] {
		const w = this.world;
		const hq = w.war.hq;
		const out: PlaceTag[] = [];
		const add = (x: number, z: number, up: number, label: string, enemy: boolean): void => {
			const s = w.camera.project(x, w.terrain.heightAtXZ(x, z) + up, z, this.cssW, this.cssH);
			if (!s || s[0] < -60 || s[0] > this.cssW + 60 || s[1] < 0 || s[1] > this.cssH) return;
			out.push({ x: s[0], y: s[1], label, enemy });
		};
		add(307.5, -34, 24, 'OUR AIRFIELD', false);
		if (w.war.ourHqUp) {
			const ours = w.war.ourHq;
			add((ours.x0 + ours.x1) / 2, -26, 26, ours.destroyed ? 'OUR HQ · DOWN' : 'OUR HQ', false);
		}
		if (w.war.active) {
			add((hq.x0 + hq.x1) / 2, -26, 26, hq.destroyed ? 'ENEMY HQ · DOWN' : 'ENEMY HQ', true);
			add(WORLD.enemyBaseMaxX + WORLD.baseMinX - 307.5, -27, 24, 'ENEMY AIRFIELD', true);
		}
		return out;
	}

	/**
	 * A marker over every aircraft in shot: blue over ours (AI jets and drones),
	 * red over theirs (command mode only, like the ground ticks).
	 */
	private planeMarkers(): PlaneMarker[] {
		const w = this.world;
		const out: PlaneMarker[] = [];
		const add = (
			x: number,
			y: number,
			z: number,
			foe: boolean,
			small: boolean,
			hurt: boolean
		): void => {
			if (out.length >= PLANE_SLOTS) return;
			const s = w.camera.project(x, y + (small ? 2.5 : 6), z, this.cssW, this.cssH);
			if (!s || s[0] < -20 || s[0] > this.cssW + 20 || s[1] < -20 || s[1] > this.cssH + 20) return;
			out.push({ x: s[0], y: s[1] - 2, foe, small, hurt });
		};
		const wing = w.wingman;
		if (wing?.active) add(wing.x, wing.y, wing.z, false, false, wing.hp < wing.profile.hp * 0.35);
		for (const e of w.escorts)
			if (e.active) add(e.x, e.y, e.z, false, false, e.hp < e.profile.hp * 0.35);
		if (this.mode === 'command') {
			for (const a of w.air) if (a.alive && !a.dying) add(a.x, a.y, a.z, true, false, false);
		}
		for (const d of w.drones) add(d.x, d.y, d.z, d.side === 'enemy', true, false);
		return out;
	}

	/**
	 * The strike being aimed, with its time to impact beside the ring, and a
	 * countdown over every spot a strike is on its way to.
	 */
	private strikeLabels(): StrikeLabel[] {
		const w = this.world;
		const c = w.command;
		const out: StrikeLabel[] = [];
		const label = (x: number, text: string, aim: boolean): void => {
			if (out.length >= STRIKE_SLOTS) return;
			const s = w.camera.project(x, w.ground(x) + 2, 0, this.cssW, this.cssH);
			if (!s || s[0] < -40 || s[0] > this.cssW + 40) return;
			out.push({ x: s[0], y: s[1], text, aim });
		};
		const aiming = this.aiming as StrikeOrder | null;
		if (aiming && Number.isFinite(this.aimX))
			label(
				this.aimX,
				`${COMMANDS[aiming].short} · impact in ${c.eta(w, aiming, this.aimX).toFixed(1)} s`,
				true
			);
		for (const p of c.pending)
			label(p.x, p.t > 0 ? `${COMMANDS[p.id].short} ${p.t.toFixed(1)} s` : 'IMPACT', false);
		return out;
	}

	/** A red tick over each enemy unit in shot (command mode, where they are small). */
	private foeMarkers(): AllyMarker[] {
		const w = this.world;
		const out: AllyMarker[] = [];
		for (const u of w.units) {
			if (!u.alive || out.length >= FOE_SLOTS) continue;
			const s = w.camera.project(u.x, u.y + u.def.half[1] * 2 + 1, u.z, this.cssW, this.cssH);
			if (!s || s[0] < -20 || s[0] > this.cssW + 20 || s[1] < -20 || s[1] > this.cssH + 20)
				continue;
			out.push({ x: s[0], y: s[1] - 2, hurt: false });
		}
		return out;
	}

	/** A chevron over each of our own ground units (and landed paratroopers) in shot. */
	private allyMarkers(): AllyMarker[] {
		const w = this.world;
		const out: AllyMarker[] = [];
		for (const list of [w.allies.list, w.troops.list]) {
			for (const u of list) {
				if (!u.alive || out.length >= ALLY_SLOTS) continue;
				const s = w.camera.project(u.x, u.y + u.def.half[1] * 2 + 1, u.z, this.cssW, this.cssH);
				if (!s || s[0] < -20 || s[0] > this.cssW + 20 || s[1] < -20 || s[1] > this.cssH + 20)
					continue;
				out.push({ x: s[0], y: s[1] - 2, hurt: u.hp < u.def.hp * 0.35 });
			}
		}
		return out;
	}

	/** "P1" and "P2" over each co-op aircraft, held at the screen edge when one strays out of shot. */
	private pilotTags(): PilotTagView[] {
		const w = this.world;
		const out: PilotTagView[] = [];
		const seats: [Player | null, string][] = [
			[w.player, 'P1'],
			[w.player2, 'P2']
		];
		for (const [p, label] of seats) {
			if (!p || p.crashed) continue;
			const tag = pilotTag(
				w.camera,
				{ x: p.x, y: p.y + p.def.radius + 4, z: p.z },
				this.cssW,
				this.cssH
			);
			if (tag) out.push({ ...tag, label, wing: p === w.player2 });
		}
		return out;
	}

	/** Chevrons on a ring around the aircraft, each pointing at a missile or launcher hunting it. */
	private threatMarkers(): ThreatMarker[] {
		const out: ThreatMarker[] = [];
		const pilots = this.world.pilots();
		// Co-op splits the marker budget between the two aircraft.
		for (const p of pilots) this.threatsAround(p, Math.floor(8 / pilots.length), out);
		return out;
	}

	private threatsAround(p: Player, max: number, out: ThreatMarker[]): void {
		const w = this.world;
		const cam = w.camera;
		const o = cam.project(p.x, p.y, p.z, this.cssW, this.cssH);
		if (!o) return;
		for (const t of incomingThreats(w, p, max)) {
			const s = cam.project(t.x, t.y, 0, this.cssW, this.cssH);
			const angle = s ? Math.atan2(s[1] - o[1], s[0] - o[0]) : Math.atan2(-(t.y - p.y), t.x - p.x);
			// Closer missiles pull their chevron in toward the aircraft.
			const r = THREAT_RING - (t.kind === 'missile' ? t.level * 14 : 0);
			out.push({
				kind: t.kind,
				x: o[0] + Math.cos(angle) * r,
				y: o[1] + Math.sin(angle) * r,
				angle,
				level: t.level,
				close: t.kind === 'missile' && t.dist < RESOLVE,
				dist: t.dist
			});
		}
	}

	private updateSkyFlash(dt: number): void {
		this.skyFlashTimer -= dt;
		if (this.skyFlashTimer <= 0) {
			this.skyFlashTimer = rnd.range(1.5, 7);
			const a = rnd.range(-1.2, 1.2);
			this.skyFlashDir = [Math.sin(a), -Math.cos(a)];
			this.skyFlash = rnd.range(0.4, 1.2) * (0.3 + this.world.night);
		}
		this.skyFlash = damp(this.skyFlash, 0, 6, dt);
		this.renderer.setSkyFlash(this.skyFlashDir[0], this.skyFlashDir[1], this.skyFlash);
	}

	private player2Hud(): Player2Hud | null {
		const q = this.world.player2;
		if (!this.coop || !q) return null;
		const id = q.ammo[q.selected] > 0 ? q.selected : 'gp';
		return {
			hp: q.alive ? q.hp : 0,
			hpMax: q.def.hp,
			boost: q.boostMeter,
			flares: q.flares,
			flaresMax: q.def.flares,
			missiles: q.missiles,
			missilesMax: q.def.missiles,
			weapon: BOMBS[id].short,
			weaponCount: q.ammo[id],
			weaponColor: BOMBS[id].color,
			respawn: q.crashed ? this.squadron.respawnIn(1) : 0,
			out: !!this.squadron.seats[1]?.out,
			threat: q.alive && (q.lockedBy > 0 || this.world.missiles.some((m) => m.target === q)),
			noPad: !this.input.p2Ready(),
			gearDown: gearUpWarning(this.world, q)
		};
	}

	private snapshot(): HudSnapshot {
		const w = this.world;
		const p = w.player;
		const def = p?.def;
		const g = p ? w.ground(p.x) : 0;
		return {
			hp: p ? p.hp : 0,
			hpMax: def?.hp ?? 1,
			boost: p?.boostMeter ?? 0,
			heat: p?.gunHeat ?? 0,
			overheated: !!p?.overheated,
			flares: p?.flares ?? 0,
			flaresMax: def?.flares ?? 0,
			bombs: p
				? p.carried.map((id, i) => ({
						id,
						short: BOMBS[id].short,
						count: p.ammo[id],
						max: p.capacity(id),
						color: BOMBS[id].color,
						slot: i + 1,
						...(id === 'gunpod' ? { heat: p.podHeat / 100, hot: p.podOverheated } : {})
					}))
				: [],
			selected: p?.selected ?? 'gp',
			score: this.score,
			combo: this.combo,
			multiplier: this.multiplier(),
			comboTime: Math.max(0, this.comboTimer / 3),
			wave: this.waves.wave,
			waveLabel:
				this.mode === 'tutorial'
					? 'TRAINING'
					: this.mode === 'command'
						? 'COMMAND'
						: this.waves.label,
			waveState: this.waves.state,
			mode: this.mode,
			// Command runs until one side's base falls: no checklist.
			mission: this.mode === 'war' ? 'Objectives' : '',
			objectives: this.mode === 'war' ? objectives(w) : [],
			boss: bossStatus(w),
			tutorial: this.tutorial?.card() ?? null,
			enemies: this.waves.remaining(w),
			war: warStatus(w),
			home: w.war.ourHqUp ? 'hq' : 'airfield',
			baseHp: w.war.ourHqUp ? w.war.ourHq.hp : w.base.hp,
			baseMax: w.war.ourHqUp ? w.war.ourHq.maxHp : w.base.maxHp,
			baseUnderAttack: (w.war.ourHqUp ? w.war.ourHq.underAttack : w.base.underAttack) > 0,
			altitude: p ? Math.max(0, p.y - g) : 0,
			speed: p ? p.speed * 3.6 : 0,
			lives: this.squadron.lives,
			livesMax: this.squadron.maxLives,
			player2: this.player2Hud(),
			lock: p?.lockProgress ?? 0,
			inbound: !!p && w.missiles.some((m) => m.target === p),
			stall: !!p?.stalled && !!p.alive,
			pullUp: !!p && p.alive && p.vy < -12 && p.y - g < Math.max(40, -p.vy * 2.2),
			runwayEnd: p ? runwayEnd(w, p) : 0,
			gearDown: !!p && gearUpWarning(w, p),
			boundary: p?.outOfBounds ?? 0,
			ceiling: !!p?.ceiling && !!p.alive,
			rearming: !!p?.rearming && !!p.alive,
			landed: !!p?.landed,
			canSwap: this.canSwap(),
			gear: gearStatus(p),
			takeoff: !!p && p.alive && p.flight === 'fixed' && !p.hasFlown,
			systems: p ? { ...p.systems } : { engine: 0, wing: 0, hydraulics: 0 },
			bayJammed: !!p && p.alive && p.bayJammed > 0,
			damageDir: p?.damageDir ?? 0,
			damageFlash: this.damageFlash,
			aircraft: this.flying,
			timeOfDay: `${w.biome.name} · ${presetName(this.envPhase)}`,
			weather: w.weather.label,
			wind: w.weather.baseWind,
			respawn: p?.crashed ? this.squadron.respawnIn(0) : 0,
			feed: this.feed.slice(),
			fps: Math.round(this.fps),
			focus: this.focus.meter,
			focusActive: this.focus.active,
			killCam: this.killCam.active ? this.killCam.reason : null,
			missiles: p?.missiles ?? 0,
			missilesMax: def?.missiles ?? 0,
			locks: this.targeting.locks.length,
			braking: !!p && p.brakeLevel > 0.3,
			...missileThreat(w, p),
			...lockThreat(p),
			flareWindow: RESOLVE,
			wingman: w.wingman
				? {
						order: w.wingman.order,
						hp: Math.max(0, w.wingman.hp / WING_HP),
						down: !w.wingman.active
					}
				: null,
			noFire: zoneAt(this.mode === 'command' ? this.aimX : this.sightX)?.name ?? '',
			command: this.mode === 'command' ? this.commandHud() : null
		};
	}
}

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The gear lamp: none for rotors and the gunship, amber while the legs travel. */
function gearStatus(p: Player | null): HudSnapshot['gear'] {
	if (!p || p.flight !== 'fixed') return 'none';
	if (p.gear.moving) return 'transit';
	return p.gear.down ? 'down' : 'up';
}

/** Where the two aircraft park on the runway (metres past its near end), clear of each other. */
const P1_PARK = 60;
const P2_PARK = 15;
/** Height the player must reach before the AI wingman launches. */
const WINGMAN_JOIN_ALT = 25;

/** Score for each checkpoint our troops take, and for levelling the enemy HQ. */
const CHECKPOINT_BONUS = 300;
const HQ_BONUS = 3000;

/** Each mode's name on the debrief. */
const MODE_TITLE: Record<GameMode, string> = {
	tutorial: 'Flight training',
	war: 'The war',
	command: 'Command'
};

/** The commander's view: how far out it sits, closest and widest, and how high the ground sits in it. */
const VIEW_NEAR = 110;
const VIEW_FAR = 1900;
const VIEW_LIFT = 0.42;
/** Where the zoom starts (about 330 m out), and how far one wheel notch moves it. */
const VIEW_ZOOM = 0.39;
const WHEEL_ZOOM = 0.06;
/** The commander looks at the battle through less haze than a pilot down in it. */
const VIEW_CLEAR = 200;
/** Colour of the strike aiming ring. */
const AIM_COLOR: [number, number, number] = [2.4, 0.9, 0.35];
/** Colour of the rings over strikes already on their way. */
const PENDING_COLOR: [number, number, number] = [1.6, 0.35, 0.2];

/** What the player is told when an order can't be given. */
const REFUSAL: Record<string, [string, string]> = {
	funds: ['NOT ENOUGH FUNDS', 'Wait for the war chest to fill, or take more checkpoints'],
	army: ['ARMY AT FULL STRENGTH', 'Wait until some of our units fall or reach the front'],
	air: ['AIR WING FULL', 'Every squadron is already flying'],
	drones: ['TOO MANY DRONES UP', 'Wait for some of the drones in the air to strike'],
	target: ['NO TARGET', 'Click a spot on the battlefield'],
	locked: ['NOT IN THIS CHALLENGE', 'The challenge you chose rules that order out']
};

/** What the commander is told as the battle opens. */
const COMMAND_BRIEF = {
	text: 'YOU HAVE COMMAND',
	sub: 'Spend the war chest on troops, armour, jets and strikes. Get our troops to the enemy HQ at the far end: only they can bring it down. Keep their troops off our HQ.'
};

/** What a new pilot is told as the battle opens: the whole game in two lines. */
const BRIEF = {
	text: 'DESTROY THE ENEMY HQ',
	sub: 'Their army outnumbers ours. Bomb their columns so our troops can take the flags and reach the HQ at the far end. Only troops can bring it down.'
};

/** The objectives panel: what wins, what loses, and how far along the road we are. */
function objectives(w: World): ObjectiveStatus[] {
	const war = w.war;
	if (!war.active) return [];
	return [
		{ label: 'Get our troops to the enemy HQ', count: '', done: war.hq.destroyed },
		{
			label: 'Checkpoints held',
			count: `${war.held('player')}/${war.checkpoints.length}`,
			done: war.held('player') === war.checkpoints.length
		},
		{ label: 'Keep the airfield standing', count: '', done: false, failed: w.base.hp <= 0 }
	];
}

/** The front line for the HUD: our army, the checkpoints and the enemy HQ. */
function warStatus(w: World): WarHud | null {
	const war = w.war;
	if (!war.active) return null;
	const span = WORLD.hqMinX - WORLD.baseMaxX;
	return {
		hq: Math.max(0, war.hq.hp / war.hq.maxHp),
		hqDown: war.hq.destroyed,
		hqUnderFire: war.hq.underAttack > 0,
		army: w.allies.alive(),
		next: Math.max(0, Math.ceil(war.nextGroup)),
		points: war.checkpoints.map((c) => ({
			name: c.name,
			at: (c.x - WORLD.baseMaxX) / span,
			owner: c.owner,
			hold: c.hold,
			contested: c.contested
		}))
	};
}
