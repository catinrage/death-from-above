import { AudioEngine } from '../audio/audio';
import { threatLevel } from '../audio/music';
import { RadioWatch } from '../audio/radio';
import { clamp, damp, lerp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { Renderer, type PostFrame, type Quality } from '../engine/renderer';
import { createModels } from '../models';
import type { PopupLayer } from '../ui/popups';
import type { TargetingLayer, TargetingView, ThreatMarker } from '../ui/targeting-layer';
import { Focus } from './focus';
import { KillCam } from './killcam';
import { Targeting } from './targeting';
import { Autopilot } from './autopilot';
import { WORLD } from './constants';
import { BOMBS, BOMB_ORDER, ROCKET_SPEED } from './defs-bombs';
import { environmentAt, presetName } from './environment';
import { applyWeather, CLEAR, weatherForWave, type WeatherSpec } from './weather';
import { climateWeather, gradeEnvironment, type BiomeId } from './biomes';
import type {
	GameMode,
	GameOverStats,
	GamePhase,
	HudFeedItem,
	HudMessage,
	HudSnapshot,
	ModeStart
} from './hud';
import { Input } from './input';
import { NO_INPUT, Player, type PilotInput } from './player';
import { SceneView } from './scene-view';
import { TerrainView } from './terrain-view';
import type { AircraftId, Owner } from './types';
import { endlessColumn } from './allies';
import { endlessTweaks, planWave, waveBonus, WaveDirector } from './waves';
import {
	loadProgress,
	missionById,
	MissionTracker,
	nextMission,
	recordMission,
	saveProgress,
	starsFor,
	type Mission
} from './campaign';
import { canStrike, STRIKES, withStrike } from './campaign-map';
import { Tutorial } from './tutorial';
import { placeRun, readBest, readBoard, saveBoard, writeBest, writeTrained } from './records';
import { predictImpact } from './weapons';
import { simulateWorld } from './simulate';
import type { Loadout } from './loadout';
import { cockpitAlerts, incomingThreats, lockThreat, missileThreat } from './warnings';
import { RESOLVE } from './projectiles';
import { SHOAL } from './river';
import { World } from './world';
import { Wingman, WING_HP } from './wingman';
import { zoneAt } from './no-fire';
import { AirBase } from './base';
import { radioState, threatInput } from './battle-audio';

export interface GameCallbacks {
	hud(h: HudSnapshot): void;
	phase(p: GamePhase): void;
	message(m: HudMessage): void;
	gameOver(s: GameOverStats): void;
}

const STEP = 1 / 60;
/** Time-of-day phase for each wave (see environment presets). */
const ENV_BY_WAVE = [0.9, 0, 0.7, 1.25, 2.1, 3, 3, 3.6, 4.2, 5];
/** Seconds between a campaign win and the debrief, so the last kills can land. */
const DEBRIEF_DELAY = 3.5;
/** Radius (CSS px) of the ring of threat chevrons around the aircraft. */
const THREAT_RING = 74;
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
	mode: GameMode = 'endless';
	private mission: Mission | null = null;
	private tracker: MissionTracker | null = null;
	private tutorial: Tutorial | null = null;
	/** Airframe and rack actually flown this sortie (training overrides the hangar). */
	private flying: AircraftId = 'kestrel';
	private flyingLoadout: Loadout | undefined;
	private aircraftLost = 0;
	private wavesScored = 0;
	private escortsScored = 0;
	/** Counts down from a campaign win to the debrief. */
	private debriefTimer = 0;
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
	/** Bullet time. */
	readonly focus = new Focus();
	/** Slow-motion follow of a bomb about to drop the bridge or set off a depot chain. */
	readonly killCam = new KillCam();
	/** Reticle, painted locks and designations for guided weapons. */
	readonly targeting = new Targeting();
	targetingLayer: TargetingLayer | null = null;
	private lives = 3;
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
	private respawnTimer = 0;
	private attractTimer = 0;
	private skyFlash = 0;
	private skyFlashDir: [number, number] = [0, -1];
	private skyFlashTimer = 4;
	private fpsAcc = 0;
	private fpsFrames = 0;
	private fps = 60;
	private readonly sightPts: number[] = [];
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
		skyFlash: [0, -1, 0]
	};
	private pilotFrame: PilotInput = { ...NO_INPUT };
	private pilotSub: PilotInput = { ...NO_INPUT };
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
				const id = w.player?.alive ? w.player.resupply() : null;
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
		if (name === 'Interceptor' || name === 'Gunship') this.audio.radio(['splash']);
		if (this.combo === 6) this.audio.radio(['streak']);
		const mult = this.multiplier();
		const pts = score * mult;
		this.score += pts;
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
		w.player = new Player(this.aircraft, 520, w.ground(520) + 80, 0, this.loadout);
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
			w.spawnUnit(o.kind, x, o.z, -1);
			x += rnd.range(10, 30);
			if (x > WORLD.enemySpawnX - 50) break;
		}
	}

	/** Shows the chosen aircraft (and its loadout) flying behind the menus. */
	preview(aircraft: AircraftId, loadout?: Loadout): void {
		this.aircraft = aircraft;
		this.loadout = loadout;
		const p = this.world.player;
		if (this.phase !== 'title' || !p) return;
		const np = new Player(aircraft, p.x, p.y, p.angle, loadout);
		np.vx = p.vx;
		np.vy = p.vy;
		np.invuln = 0;
		this.world.player = np;
	}

	newGame(aircraft: AircraftId, loadout?: Loadout, start: ModeStart = { mode: 'endless' }): void {
		this.aircraft = aircraft;
		this.loadout = loadout;
		const flown = start.mode === 'campaign' ? (missionById(start.mission) ?? null) : null;
		const strike = start.mode === 'campaign' && flown && canStrike(flown.id) ? start.strike : null;
		const mission = flown && withStrike(flown, strike);
		this.mode = start.mode === 'campaign' && !mission ? 'endless' : start.mode;
		this.mission = mission;
		this.tracker = mission ? new MissionTracker(mission) : null;
		this.tutorial = this.mode === 'tutorial' ? new Tutorial() : null;
		this.flying = this.mode === 'tutorial' ? TRAINER : aircraft;
		this.flyingLoadout = this.mode === 'tutorial' ? undefined : loadout;
		this.aircraftLost = 0;
		this.wavesScored = 0;
		this.escortsScored = 0;
		this.debriefTimer = 0;
		const w = this.world;
		this.useBiome(this.biomeFor(start, mission));
		w.reset();
		w.godMode = false;
		this.lives = 3;
		this.score = 0;
		this.combo = 0;
		this.comboTimer = 0;
		this.bestCombo = 0;
		this.kills = 0;
		this.playTime = 0;
		this.feed.length = 0;
		this.respawnTimer = 0;
		this.damageFlash = 0;
		this.popups?.clear();
		this.focus.reset();
		this.killCam.reset();
		this.targeting.clear();
		this.spawnPlayer();
		if (this.mode !== 'tutorial') {
			const x = WORLD.runwayMinX + 10;
			w.wingman = new Wingman(x, w.ground(x) + 70);
		}
		this.radioWatch.reset();
		this.audio.radio(['sortie']);
		const seed = Math.floor(Math.random() * 1e6);
		this.waves = new WaveDirector(
			seed,
			mission
				? mission.waves
				: this.mode === 'endless'
					? { tweaks: endlessTweaks, column: endlessColumn }
					: {}
		);
		this.envPhase = this.envTarget = this.envFor(1);
		w.weather.set(this.weatherFor(1), true);
		this.setPhase('playing');
		if (this.tutorial) this.tutorial.start(w);
		else {
			if (mission)
				this.cb.message({
					id: this.msgId++,
					text: mission.name.toUpperCase(),
					sub: strike
						? `${mission.brief} ${STRIKES[strike].name} hit: ${STRIKES[strike].effect.toLowerCase()}.`
						: mission.brief,
					tone: 'info'
				});
			this.waves.begin(w, 1);
		}
		void this.audio.unlock();
	}

	/** Map a sortie is flown on: training stays in the valley. */
	private biomeFor(start: ModeStart, mission: Mission | null): BiomeId {
		if (start.mode === 'tutorial') return 'temperate';
		if (mission) return mission.biome;
		return start.mode === 'endless' ? (start.biome ?? 'temperate') : 'temperate';
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
		if (this.mission) {
			const env = this.mission.env;
			return env[Math.min(wave - 1, env.length - 1)];
		}
		return wave < ENV_BY_WAVE.length
			? ENV_BY_WAVE[wave]
			: 5 + (wave - ENV_BY_WAVE.length + 1) * 0.6;
	}

	/** Sky and wind for a wave of the current sortie. */
	private weatherFor(wave: number): WeatherSpec {
		if (this.mode === 'tutorial') return CLEAR;
		if (this.mission) {
			const list = this.mission.weather;
			return list ? list[Math.min(wave - 1, list.length - 1)] : CLEAR;
		}
		return climateWeather(weatherForWave(wave), this.world.biome);
	}

	private spawnPlayer(): void {
		const w = this.world;
		const x = WORLD.runwayMinX + 40;
		const lost = w.player;
		w.player = new Player(this.flying, x, w.ground(x) + 45, 0.08, this.flyingLoadout);
		// A spent nuke stays spent: a replacement aircraft doesn't bring a new one this wave.
		if (lost) w.player.ammo.nuke = Math.min(w.player.ammo.nuke, lost.ammo.nuke);
		w.camera.interest = null;
		w.camera.snap(w.player, w.ground(x));
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
			this.confirm = this.input.confirmPressed();
			this.skip = this.input.enterPressed();
			this.aim(raw);
			this.orders();
			Object.assign(this.pilotSub, this.pilotFrame, {
				bombPressed: false,
				flare: false,
				cycle: 0,
				select: null,
				missiles: null
			});
			for (let i = 0; i < steps; i++)
				this.step(dt / steps, i === 0 ? this.pilotFrame : this.pilotSub);
			if (this.killCam.active) this.killCam.drive(this.world.camera, raw);
		}
		this.draw(raw);
		this.input.endFrame();
	};

	/** Focus toggling, meter and the aircraft's sharpened handling. */
	private updateFocus(raw: number): void {
		const w = this.world;
		const p = w.player;
		const playing = this.phase === 'playing';
		const allowed = playing && !!p && p.alive && !p.landed;
		const event = this.focus.update(raw, playing && this.input.focusPressed(), allowed);
		if (event === 'start') this.audio.play('focusIn', w.camera.x, w.camera.y, 0.9);
		else if (event === 'stop') this.audio.play('focusOut', w.camera.x, w.camera.y, 0.8);
		if (p) p.focus = this.focus.active;
	}

	/** Kill cam: only when the pilot can spare the view for a moment. */
	private updateKillCam(raw: number): void {
		const w = this.world;
		const p = w.player;
		const allowed =
			this.phase === 'playing' &&
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
		if (ok)
			this.audio.radio([
				order === 'attack' ? 'wingAttack' : order === 'sams' ? 'wingSams' : 'wingCover'
			]);
	}

	private step(dt: number, pilot: PilotInput): void {
		const w = this.world;
		this.time += dt;
		const p = w.player;
		const auto = this.phase === 'title' || (this.autoplay && this.phase === 'playing');
		const inp = !p
			? null
			: auto
				? this.autopilot.update(w, p, dt)
				: this.phase === 'playing'
					? pilot
					: NO_INPUT;
		const showcase = this.showcase && this.phase === 'title';
		w.camera.locked = showcase || this.killCam.active;
		simulateWorld(w, dt, inp);
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
		if (p && p.crashed) {
			if (this.respawnTimer <= 0) {
				if (!training) this.lives--;
				this.aircraftLost++;
				this.respawnTimer = training ? 2 : 3.2;
			} else {
				this.respawnTimer -= dt;
				if (this.respawnTimer <= 0) {
					if (this.lives > 0) {
						this.spawnPlayer();
						this.audio.radio(['sortie']);
					} else return this.gameOver('All aircraft lost');
				}
			}
		}
		if (w.base.hp <= 0) return this.gameOver('The airfield has fallen');
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
		if (w.allies.arrived > this.escortsScored) {
			const n = w.allies.arrived - this.escortsScored;
			this.escortsScored = w.allies.arrived;
			const bonus = n * ESCORT_BONUS;
			this.score += bonus;
			this.popups?.spawn(
				`+${bonus.toLocaleString()}`,
				'column through',
				w.camera.x,
				w.camera.y + 25,
				'big'
			);
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
		if (this.tracker) {
			this.tracker.update(w);
			const lost = this.tracker.failure();
			if (lost) return this.gameOver(lost);
			if (this.debriefTimer > 0) {
				this.debriefTimer -= dt;
				if (this.debriefTimer <= 0) return this.finish();
			} else if (this.tracker.complete(this.waves)) {
				this.debriefTimer = DEBRIEF_DELAY;
				w.events.message('MISSION COMPLETE', 'Return to base', 'good');
				this.audio.play('siren', w.camera.x, w.camera.y, 0.5);
			}
		}
		this.envTarget = this.envFor(Math.max(1, this.waves.wave));
		w.weather.set(this.weatherFor(Math.max(1, this.waves.wave)));
	}

	/** Endless scores go on the leaderboard; campaign and training results are saved. */
	private result(outcome: 'failed' | 'complete', reason: string): GameOverStats {
		const base = {
			mode: this.mode,
			outcome,
			title: this.mission?.name ?? (this.mode === 'tutorial' ? 'Flight training' : 'Endless'),
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
		if (this.mode === 'endless') {
			const best = readBest();
			const newBest = this.score > best;
			if (newBest) writeBest(this.score);
			const { board, rank } = placeRun(readBoard(), {
				score: this.score,
				wave: this.waves.wave,
				kills: this.kills,
				aircraft: this.flying,
				date: Date.now()
			});
			if (rank > 0) saveBoard(board);
			return { ...base, best: Math.max(best, this.score), newBest, rank };
		}
		if (this.mode === 'tutorial' && outcome === 'complete') writeTrained();
		const m = this.mission;
		if (!m) return base;
		const progress = loadProgress();
		const prevBest = progress[m.id]?.best ?? 0;
		const baseFrac = this.world.base.hp / this.world.base.maxHp;
		const stars = starsFor(baseFrac, this.aircraftLost);
		const next = nextMission(m.id);
		if (outcome === 'complete') saveProgress(recordMission(progress, m.id, stars, this.score));
		return {
			...base,
			missionId: m.id,
			best: Math.max(prevBest, outcome === 'complete' ? this.score : 0),
			newBest: outcome === 'complete' && this.score > prevBest,
			stars: outcome === 'complete' ? stars : 0,
			starNotes: [
				{ label: 'Mission complete', got: outcome === 'complete' },
				{ label: 'Airfield above 70%', got: outcome === 'complete' && baseFrac >= 0.7 },
				{ label: 'No aircraft lost', got: outcome === 'complete' && this.aircraftLost === 0 }
			],
			nextMission: next?.id
		};
	}

	private finish(): void {
		if (this.phase === 'gameover') return;
		const reason = this.mode === 'tutorial' ? 'You are cleared to fly' : 'The sector is secure';
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
		const lowHp =
			p && p.alive && this.phase === 'playing' ? clamp(1 - p.hp / p.def.hp / 0.3, 0, 1) : 0;
		post.damage = clamp(
			this.damageFlash * 0.8 + lowHp * (0.25 + 0.15 * Math.sin(this.time * 6)),
			0,
			1
		);
		post.aberration = 0.0018 + w.fx.aberrationKick + post.damage * 0.006 + fb * 0.005;
		post.numWaves = w.fx.packWaves(post.waves, this.cssW, this.cssH);
		this.updateSkyFlash(dt);

		this.audio.setListener(w.camera.x, w.camera.y);
		this.audio.update(dt, {
			alive: !!p && p.alive,
			throttle: p?.throttle ?? 0,
			speed: p?.speed ?? 0,
			boosting: !!p?.boosting,
			prop: p?.def.engine === 'prop',
			lock: this.phase === 'playing' && p ? p.lockProgress : 0,
			inbound: this.phase === 'playing' && !!p && w.missiles.some((m) => m.target === p),
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
		this.hudTimer -= dt;
		if (this.hudTimer <= 0) {
			this.hudTimer = 1 / 15;
			this.cb.hud(this.snapshot());
		}
	}

	/** Radio chatter and the dynamic score, both in real time (not slowed by bullet time). */
	private updateBattleAudio(dt: number): void {
		const w = this.world;
		const p = w.player;
		const flying = this.phase === 'playing' && !this.autoplay;
		if (flying) {
			const s = radioState(w, p, this.waves.state, this.lives);
			this.audio.radio(this.radioWatch.update(s));
		}
		this.audio.updateRadio(dt, flying);
		const inSortie = this.phase === 'playing' || this.phase === 'paused';
		const threat = inSortie ? threatLevel(threatInput(w, p, this.waves.state)) : 0.1;
		const level = { loading: 0, title: 0.55, playing: 1, paused: 0.3, gameover: 0.45 }[this.phase];
		this.audio.updateMusic(dt, threat, level);
	}

	/**
	 * Draws the bomb sight and tells the camera what it must keep on screen:
	 * the predicted impact and any of our bombs still falling.
	 */
	private drawSight(): void {
		const w = this.world;
		const p = w.player;
		const flying = this.phase === 'playing' || this.phase === 'paused';
		if (!flying || !p || !p.alive || p.landed) {
			if (this.phase !== 'paused') w.camera.interest = null;
			this.sightX = NaN;
			return;
		}
		const id = p.ammo[p.selected] > 0 ? p.selected : 'gp';
		// Guns and the radar-homing missile go where they point: no drop sight for them.
		if (id === 'gunpod' || id === 'arm') {
			w.camera.interest = null;
			this.sightX = NaN;
			return;
		}
		const def = BOMBS[id];
		// Rockets leave the rails at speed and fall like a bomb thrown forward.
		const boost = id === 'rockets' ? ROCKET_SPEED : 0;
		const hit = predictImpact(
			w,
			p.x,
			p.y - 1.2,
			p.vx + Math.cos(p.angle) * boost,
			p.vy + Math.sin(p.angle) * boost,
			def.drag,
			this.sightPts
		);
		this.sightX = hit.x;
		let lo = hit.x,
			hi = hit.x;
		for (const b of w.bombs) {
			if (!b.alive || b.owner !== 'player') continue;
			lo = Math.min(lo, b.x);
			hi = Math.max(hi, b.x);
		}
		this.interest[0] = lo;
		this.interest[1] = hi;
		w.camera.interest = this.interest;
		const c = hexToRgb(def.color);
		const col: [number, number, number] = [c[0] * 2.3, c[1] * 2.3, c[2] * 2.3];
		this.view.sight(w, this.sightPts, col);
		this.view.marker(w, hit.x, hit.y, this.time, col);
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
			threats: visible ? this.threatMarkers() : []
		};
	}

	/** Chevrons on a ring around the aircraft, each pointing at a missile or launcher hunting it. */
	private threatMarkers(): ThreatMarker[] {
		const w = this.world;
		const p = w.player;
		const cam = w.camera;
		if (!p) return [];
		const o = cam.project(p.x, p.y, p.z, this.cssW, this.cssH);
		if (!o) return [];
		const out: ThreatMarker[] = [];
		for (const t of incomingThreats(w, p)) {
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
		return out;
	}

	private updateSkyFlash(dt: number): void {
		this.skyFlashTimer -= dt;
		if (this.skyFlashTimer <= 0) {
			this.skyFlashTimer = rnd.range(1.5, 7);
			const a = rnd.range(-1.2, 1.2);
			this.skyFlashDir = [Math.sin(a), -Math.cos(a)];
			this.skyFlash = rnd.range(0.4, 1.2) * (0.3 + this.world.night);
		}
		this.skyFlash = Math.max(damp(this.skyFlash, 0, 6, dt), this.world.weather.flash * 2);
		this.renderer.setSkyFlash(this.skyFlashDir[0], this.skyFlashDir[1], this.skyFlash);
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
			waveLabel: this.mode === 'tutorial' ? 'TRAINING' : this.waves.label,
			waveState: this.waves.state,
			mode: this.mode,
			mission: this.mission?.name ?? '',
			objectives: this.tracker?.status(this.waves) ?? [],
			tutorial: this.tutorial?.card() ?? null,
			enemies: this.waves.remaining(w),
			column: columnStatus(w),
			baseHp: w.base.hp,
			baseMax: w.base.maxHp,
			baseUnderAttack: w.base.underAttack > 0,
			altitude: p ? Math.max(0, p.y - g) : 0,
			speed: p ? p.speed * 3.6 : 0,
			lives: this.lives,
			lock: p?.lockProgress ?? 0,
			inbound: !!p && w.missiles.some((m) => m.target === p),
			stall: !!p?.stalled && !!p.alive,
			pullUp: !!p && p.alive && p.vy < -12 && p.y - g < Math.max(40, -p.vy * 2.2),
			boundary: p?.outOfBounds ?? 0,
			ceiling: !!p?.ceiling && !!p.alive,
			rearming: !!p?.rearming && !!p.alive,
			landed: !!p?.landed,
			systems: p ? { ...p.systems } : { engine: 0, wing: 0, hydraulics: 0 },
			bayJammed: !!p && p.alive && p.bayJammed > 0,
			damageDir: p?.damageDir ?? 0,
			damageFlash: this.damageFlash,
			aircraft: this.flying,
			timeOfDay: `${w.biome.name} · ${presetName(this.envPhase)}`,
			weather: w.weather.label,
			wind: w.weather.baseWind,
			respawn: p?.crashed && this.lives > 0 ? Math.max(0, this.respawnTimer) : 0,
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
						down: w.wingman.alive ? 0 : Math.max(0, w.wingman.respawn)
					}
				: null,
			noFire: zoneAt(this.sightX)?.name ?? ''
		};
	}
}

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Score for each friendly vehicle that reaches the rally point. */
const ESCORT_BONUS = 250;

/** "COLUMN 4 · 1.2 KM" while friendly armour is on the road. */
function columnStatus(w: World): string {
	const left = w.allies.distanceToGo(w);
	if (left === null) return '';
	return `COLUMN ${w.allies.alive()} · ${(left / 1000).toFixed(1)} KM`;
}
