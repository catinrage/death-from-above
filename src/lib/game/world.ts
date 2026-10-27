import { Allies } from './allies';
import { LightSystem } from '../engine/lights';
import { ParticleSystem } from '../engine/particles';
import { Rng } from '../engine/rng';
import { CameraRig } from './camera';
import { DebrisSystem } from './debris';
import { UNITS } from './defs-units';
import { Effects } from './effects';
import { FireSystem } from './fires';
import { Props } from './props';
import { Bridge, roadBridgeSpec } from './bridge';
import { BIOMES, type Biome, type BiomeId } from './biomes';
import { Civilians } from './civilians';
import { RAIL, type RailLine } from './rail';
import { Railway, railBridgeSpec } from './railway';
import { RIVER, type River } from './river';
import { GasClouds } from './gas';
import type { Strike } from './specials';
import { Surface } from './surface';
import { Troops } from './troops';
import { CLEAR, Weather } from './weather';
import { Terrain } from './terrain';
import type { AirUnit } from './enemy-air';
import type { Player } from './player';
import type { Wingman } from './wingman';
import type { Bomb } from './weapons';
import type { Bullet, Flare, Missile, Shell } from './projectiles';
import type { Owner, Unit, UnitKind } from './types';
import type { AirBase } from './base';

export type SfxId =
	| 'explosion'
	| 'bigExplosion'
	| 'thunder'
	| 'gun'
	| 'cannon'
	| 'rifle'
	| 'mg'
	| 'aaGun'
	| 'flak'
	| 'flakBurst'
	| 'tankGun'
	| 'artillery'
	| 'missileLaunch'
	| 'bombRelease'
	| 'impactMetal'
	| 'impactGround'
	| 'flare'
	| 'crash'
	| 'pickup'
	| 'siren'
	| 'napalm'
	| 'debris'
	| 'hit'
	| 'rearm'
	| 'lockTone'
	| 'launchWarn'
	| 'empty'
	| 'select'
	| 'focusIn'
	| 'focusOut'
	| 'lockOn'
	| 'splash'
	| 'collapse'
	| 'emp'
	| 'caution'
	| 'masterWarning'
	| 'stallHorn'
	| 'airbrake';

export interface SoundSink {
	play(id: SfxId, x: number, y: number, volume?: number, pitch?: number): void;
	/** Explosion scaled by blast power (~0.3 shell, 1 bomb, 4 Thunderclap). */
	boom(power: number, x: number, y: number, air?: boolean): void;
	whistle(id: number, x: number, y: number, vy: number, active: boolean): void;
}

export interface WorldEvents {
	kill(name: string, score: number, x: number, y: number, by: Owner): void;
	message(text: string, sub?: string, tone?: 'info' | 'warn' | 'good'): void;
	playerHit(amount: number): void;
	supply(x: number, y: number): void;
	slowmo(scale: number, duration: number): void;
	/** The player hurt civilians in a no-fire zone. */
	penalty(name: string, points: number, x: number, y: number): void;
}

const silentSound: SoundSink = { play: () => {}, boom: () => {}, whistle: () => {} };
const silentEvents: WorldEvents = {
	kill: () => {},
	message: () => {},
	playerHit: () => {},
	supply: () => {},
	slowmo: () => {},
	penalty: () => {}
};

/** All mutable simulation state. Systems read and write it directly. */
export class World {
	readonly terrain: Terrain;
	readonly river: River | null;
	readonly bridge: Bridge | null;
	/** The railway behind the road, its viaduct over the river and the trains on it. */
	readonly rail: RailLine | null;
	readonly railBridge: Bridge | null;
	readonly railway: Railway | null;
	/** Terrain, water and bridge decks combined. */
	readonly surface: Surface;
	readonly particles = new ParticleSystem(16000);
	readonly lights = new LightSystem();
	readonly camera = new CameraRig();
	readonly fx: Effects;
	readonly debris = new DebrisSystem();
	readonly fires: FireSystem;
	readonly props: Props;
	readonly rng: Rng;
	/** Landscape, scenery and colour grading of this map. */
	biome: Biome;
	readonly units: Unit[] = [];
	readonly air: AirUnit[] = [];
	readonly bombs: Bomb[] = [];
	readonly bullets: Bullet[] = [];
	readonly shells: Shell[] = [];
	readonly missiles: Missile[] = [];
	readonly flares: Flare[] = [];
	/** Cruise missiles and ballistic warheads in flight. */
	readonly strikes: Strike[] = [];
	/** Friendly paratroopers. */
	readonly troops = new Troops();
	/** Friendly armoured column pushing up the road. */
	readonly allies = new Allies();
	/** Chemical clouds. */
	readonly gas = new GasClouds();
	/** Wind, rain, snow and lightning. */
	readonly weather = new Weather();
	/** Villagers in the no-fire zones. */
	readonly civilians = new Civilians();
	player: Player | null = null;
	/** The player's AI wingman (absent in training and the attract demo). */
	wingman: Wingman | null = null;
	base!: AirBase;
	sound: SoundSink = silentSound;
	events: WorldEvents = silentEvents;
	time = 0;
	/** 0 at noon-ish, 1 at full night: drives searchlights and window lights. */
	night = 0;
	/** A radar station is alive: SAM locks are faster. */
	radarCoverage = false;
	/** A searchlight has the player in its beam: AA fire is more accurate. */
	spotted = false;
	/** Player cannot be damaged (attract mode). */
	godMode = false;
	/** Current wave; enemy accuracy scales with it. */
	wave = 1;
	/** Where the player's aiming reticle meets the battlefield (laser spot for guided bombs). */
	designator: { x: number; y: number } | null = null;
	/** Damage the player has taken, by cause (balancing aid). */
	readonly damageTaken: Record<string, number> = {};
	private nextId = 1;

	constructor(seed = 2024, biome: BiomeId = 'temperate') {
		this.rng = new Rng(seed);
		this.biome = BIOMES[biome];
		this.terrain = new Terrain(seed, undefined, undefined, RIVER, this.biome.shape, RAIL);
		this.river = this.terrain.river;
		this.bridge = this.river ? new Bridge(roadBridgeSpec(this.river)) : null;
		this.rail = this.terrain.rail;
		const viaduct = this.rail && this.river ? railBridgeSpec(this.rail, this.river) : null;
		this.railBridge = viaduct ? new Bridge(viaduct) : null;
		this.railway = this.rail ? new Railway(this.rail, this.railBridge) : null;
		this.surface = new Surface(this.terrain, this.river, this.bridge, this.railBridge);
		this.fx = new Effects(this.particles, this.lights, this.camera, this.surface);
		this.fires = new FireSystem(this.fx, this.lights, this.terrain);
		this.props = new Props(this.terrain, seed + 7, this.river, this.biome.flora, this.rail);
	}

	/**
	 * Swaps the map to another biome by regrowing the terrain and scenery.
	 * Call reset() afterwards for a fresh battlefield. Returns false when it
	 * already was that biome.
	 */
	setBiome(id: BiomeId): boolean {
		if (this.biome.id === id) return false;
		this.biome = BIOMES[id];
		this.terrain.reshape(this.biome.shape);
		this.props.rebuild(this.biome.flora);
		return true;
	}

	/** Battle-line surface at x: ground, water or the bridge deck. */
	ground(x: number): number {
		return this.surface.ground(x);
	}

	spawnUnit(kind: UnitKind, x: number, z: number, dir: 1 | -1 = -1): Unit {
		const u = this.makeUnit(kind, x, z, dir);
		this.units.push(u);
		return u;
	}

	/** A unit standing on the ground at (x, z), not yet part of any list. */
	makeUnit(kind: UnitKind, x: number, z: number, dir: 1 | -1 = -1): Unit {
		const def = UNITS[kind];
		const u: Unit = {
			id: this.nextId++,
			def,
			x,
			y: this.surface.support(x, Infinity, z),
			z,
			dir,
			speed: 0,
			hp: def.hp,
			alive: true,
			remove: false,
			deadTime: 0,
			pitch: 0,
			yaw: dir < 0 ? Math.PI : 0,
			aimYaw: 0,
			aimPitch: 0.1,
			cooldown: this.rng.range(0.5, 2.5),
			burst: 0,
			lock: 0,
			anim: this.rng.range(0, 10),
			spin: this.rng.range(0, 6),
			flash: 0,
			state: 'advance',
			stateTime: 0,
			turretGone: false,
			char: 0,
			fire: null,
			panic: 0,
			lastHitBy: 'player',
			lamp: null,
			deployed: 0,
			gap: 0,
			spotting: false,
			fall: 0,
			stun: 0
		};
		return u;
	}

	newId(): number {
		return this.nextId++;
	}

	/** Mobile hostiles still fighting (wave completion counts these). */
	hostilesAlive(): number {
		let n = 0;
		for (const u of this.units) if (u.alive && !u.def.isStatic) n++;
		for (const a of this.air) if (a.alive) n++;
		return n;
	}

	/** Fresh battlefield for a new game. */
	reset(): void {
		this.clearCombat();
		this.terrain.reset();
		this.bridge?.rebuild(this);
		this.railBridge?.rebuild(this);
		this.props.reset();
		this.civilians.populate(this);
		this.base.reset();
		this.player = null;
		this.wingman = null;
		this.designator = null;
		this.time = 0;
		this.weather.set(CLEAR, true);
	}

	clearCombat(): void {
		this.units.length = 0;
		this.railway?.reset();
		this.air.length = 0;
		this.bombs.length = 0;
		this.bullets.length = 0;
		this.shells.length = 0;
		this.missiles.length = 0;
		this.flares.length = 0;
		this.strikes.length = 0;
		this.troops.clear();
		this.allies.clear();
		this.gas.clear();
		this.debris.clear();
		this.fires.clear();
		this.particles.clear();
		this.lights.clear();
		this.fx.clear();
	}
}
