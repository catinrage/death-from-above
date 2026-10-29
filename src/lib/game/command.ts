import { clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { AllyKind } from './allies';
import { explode } from './combat';
import { WORLD } from './constants';
import { BOMBS, type BlastSpec } from './defs-bombs';
import { BATTERY_PITCH, BATTERY_REACH, OUR_SITES, RACK_PITCH, THEIR_SITES } from './base';
import { UNITS } from './defs-units';
import { AirUnit } from './enemy-air';
import { groundPoint, seek, seekAlly } from './specials';
import type { AircraftId } from './types';
import type { Side } from './war';
import { dropBomb, predictImpact } from './weapons';
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

export type CommandId =
	| 'rifles'
	| 'antiTank'
	| 'mortars'
	| 'jeep'
	| 'lightTank'
	| 'tank'
	| 'aa'
	| 'rockets'
	| 'fighter'
	| 'striker'
	| 'barrage'
	| 'cruise'
	| 'carpet'
	| 'ballistic'
	| 'nuke';

export type CommandGroup = 'ground' | 'air' | 'strike';

export interface CommandDef {
	id: CommandId;
	name: string;
	/** A word or two for the button. */
	short: string;
	/** One plain line on what it is for. */
	tip: string;
	group: CommandGroup;
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
	/** Strikes: how far around the aim point it hurts (for the aiming ring). */
	radius?: number;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
	rifles: {
		id: 'rifles',
		name: 'Rifle squad',
		short: 'Rifles',
		tip: 'Four riflemen. Cheap, and they take checkpoints.',
		group: 'ground',
		cost: 100,
		cooldown: 0,
		code: 'Digit1',
		key: '1',
		units: ['rifleman', 'rifleman', 'rifleman', 'rifleman']
	},
	antiTank: {
		id: 'antiTank',
		name: 'Anti-tank team',
		short: 'AT team',
		tip: 'Two rocket troopers and a medic. They go for armour first.',
		group: 'ground',
		cost: 170,
		cooldown: 0,
		code: 'Digit2',
		key: '2',
		units: ['atTrooper', 'atTrooper', 'medic']
	},
	mortars: {
		id: 'mortars',
		name: 'Mortar team',
		short: 'Mortars',
		tip: 'Two mortars that shell the enemy from behind our line.',
		group: 'ground',
		cost: 180,
		cooldown: 0,
		code: 'Digit3',
		key: '3',
		units: ['mortar', 'mortar']
	},
	jeep: {
		id: 'jeep',
		name: 'Gun jeep',
		short: 'Jeep',
		tip: 'Fast and lightly armed. Good for a quick grab at a flag.',
		group: 'ground',
		cost: 90,
		cooldown: 0,
		code: 'Digit4',
		key: '4',
		units: ['jeep']
	},
	lightTank: {
		id: 'lightTank',
		name: 'Light tank',
		short: 'Lt tank',
		tip: 'Quick, thin-skinned tank with a light gun.',
		group: 'ground',
		cost: 170,
		cooldown: 0,
		code: 'Digit5',
		key: '5',
		units: ['lightTank']
	},
	tank: {
		id: 'tank',
		name: 'Battle tank',
		short: 'Tank',
		tip: 'Heavy armour and a big gun. The backbone of a push.',
		group: 'ground',
		cost: 300,
		cooldown: 0,
		code: 'Digit6',
		key: '6',
		units: ['tank']
	},
	aa: {
		id: 'aa',
		name: 'AA carrier',
		short: 'AA gun',
		tip: 'Mobile flak that keeps gunships and jets off the column.',
		group: 'ground',
		cost: 260,
		cooldown: 0,
		code: 'Digit7',
		key: '7',
		units: ['spaag']
	},
	rockets: {
		id: 'rockets',
		name: 'Rocket artillery',
		short: 'Rockets',
		tip: 'Long-range rocket salvos from well behind the front.',
		group: 'ground',
		cost: 320,
		cooldown: 0,
		code: 'Digit8',
		key: '8',
		units: ['rocketTruck']
	},
	fighter: {
		id: 'fighter',
		name: 'Fighter',
		short: 'Fighter',
		tip: 'An F-16 that hunts enemy aircraft, then whatever is near the front.',
		group: 'air',
		cost: 420,
		cooldown: 8,
		code: 'KeyQ',
		key: 'Q',
		aircraft: 'f16',
		order: 'attack'
	},
	striker: {
		id: 'striker',
		name: 'Strike jet',
		short: 'Strike jet',
		tip: 'An A-10 that goes after SAMs, flak and radars first.',
		group: 'air',
		cost: 480,
		cooldown: 8,
		code: 'KeyE',
		key: 'E',
		aircraft: 'a10',
		order: 'sams'
	},
	barrage: {
		id: 'barrage',
		name: 'Artillery barrage',
		short: 'Barrage',
		tip: 'Ten heavy shells scattered around the spot you click.',
		group: 'strike',
		cost: 150,
		cooldown: 10,
		code: 'KeyZ',
		key: 'Z',
		radius: 30
	},
	cruise: {
		id: 'cruise',
		name: 'Cruise missile',
		short: 'Cruise',
		tip: 'Skims the ground from the base and picks the best target near the spot.',
		group: 'strike',
		cost: 240,
		cooldown: 12,
		code: 'KeyX',
		key: 'X',
		radius: 24
	},
	carpet: {
		id: 'carpet',
		name: 'Carpet bombing',
		short: 'Carpet',
		tip: 'A B-1 lays a line of bombs across the spot.',
		group: 'strike',
		cost: 450,
		cooldown: 40,
		code: 'KeyC',
		key: 'C',
		radius: 80
	},
	ballistic: {
		id: 'ballistic',
		name: 'Ballistic missile',
		short: 'Ballistic',
		tip: 'Climbs out of sight and comes down at Mach 6. A few seconds’ warning.',
		group: 'strike',
		cost: 520,
		cooldown: 35,
		code: 'KeyV',
		key: 'V',
		radius: BOMBS.ballistic.blast.radius
	},
	nuke: {
		id: 'nuke',
		name: 'Tactical nuke',
		short: 'Nuke',
		tip: 'Flattens everything for 150 m, our own troops included.',
		group: 'strike',
		cost: 1600,
		cooldown: 150,
		code: 'KeyN',
		key: 'N',
		radius: BOMBS.nuke.blast.radius
	}
};

export const COMMAND_ORDER: readonly CommandId[] = [
	'rifles',
	'antiTank',
	'mortars',
	'jeep',
	'lightTank',
	'tank',
	'aa',
	'rockets',
	'fighter',
	'striker',
	'barrage',
	'cruise',
	'carpet',
	'ballistic',
	'nuke'
];

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
export const ARMY_LIMIT = 40;
/** Most of our jets in the air at once. */
export const AIR_LIMIT = 4;
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
export type Refusal = 'funds' | 'cooldown' | 'army' | 'air' | 'target' | 'inactive';

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
}

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
	private readonly rounds: Round[] = [];
	private nextDeploy = 0;
	/** Our jets and what was ordered for each, so a loss can be reported. */
	private readonly jets = new Map<Wingman, CommandId>();
	/** The enemy commander's jets. */
	private readonly planes = new Set<AirUnit>();
	private patrolClock = 0;

	/** `side`: whose army this commander runs. The enemy's mirrors ours from the far end. */
	constructor(readonly side: Side = 'player') {}

	private get ours(): boolean {
		return this.side === 'player';
	}

	/** Which way this side's road runs: +1 from our airfield, -1 from theirs. */
	private get dir(): 1 | -1 {
		return this.ours ? 1 : -1;
	}

	start(funds = START_FUNDS): void {
		this.active = true;
		this.funds = funds;
		this.earned = this.spent = this.orders = 0;
		for (const id of COMMAND_ORDER) delete this.cooldowns[id];
		this.queue.length = 0;
		this.flybys.length = 0;
		this.rounds.length = 0;
		this.jets.clear();
		this.planes.clear();
		this.nextDeploy = 0;
		this.patrolClock = 0;
	}

	stop(): void {
		this.active = false;
		this.queue.length = 0;
		this.flybys.length = 0;
		this.rounds.length = 0;
		this.jets.clear();
		this.planes.clear();
	}

	/** Funds per second right now. */
	income(w: World): number {
		const edge = this.ours ? 1 : ENEMY_INCOME;
		return (BASE_INCOME + CHECKPOINT_INCOME * w.war.held(this.side)) * edge;
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

	/** Whether an order can be given now, or why not. */
	refusal(w: World, id: CommandId): Refusal | null {
		if (!this.active) return 'inactive';
		const def = COMMANDS[id];
		if ((this.cooldowns[id] ?? 0) > 0) return 'cooldown';
		if (this.funds < def.cost) return 'funds';
		if (def.units && this.armySize(w) + def.units.length > ARMY_LIMIT) return 'army';
		if (def.group === 'air' && this.airborne(w) >= AIR_LIMIT) return 'air';
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
			this.strike(w, id, clamp(x, WORLD.arenaMinX, WORLD.arenaMaxX));
		} else if (def.group === 'air') this.launch(w, def);
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

	/** A jet climbs out from the end of the runway and takes up its standing order. */
	private launch(w: World, def: CommandDef): void {
		if (!this.ours) return this.launchEnemy(w, def);
		const x = WORLD.runwayMaxX;
		const jet = new Wingman(x, w.ground(x) + 30, { aircraft: def.aircraft, callsign: null });
		jet.angle = 0.22;
		jet.vx = Math.cos(jet.angle) * jet.speed;
		jet.vy = Math.sin(jet.angle) * jet.speed;
		jet.patrol = this.front(w);
		if (def.order && def.order !== 'attack') jet.command(w, def.order);
		w.escorts.push(jet);
		this.jets.set(jet, def.id);
		w.sound.play('missileLaunch', x, jet.y, 0.4, 0.5);
		w.events.message(
			`${def.name.toUpperCase()} AIRBORNE`,
			def.order === 'sams' ? 'Hunting their air defences' : 'Hunting near the front',
			'good'
		);
	}

	/** Their jet takes off from the near end of their runway, toward us. */
	private launchEnemy(w: World, def: CommandDef): void {
		const x = WORLD.enemyRunwayMinX;
		const sams = def.order === 'sams';
		const jet = new AirUnit(w.newId(), sams ? 'striker' : 'fighter', x, w.ground(x) + 30);
		jet.angle = Math.PI - 0.22;
		jet.vx = Math.cos(jet.angle) * 85;
		jet.vy = Math.sin(jet.angle) * 85;
		jet.role = sams ? 'sams' : 'attack';
		jet.patrol = this.front(w);
		w.air.push(jet);
		this.planes.add(jet);
		w.sound.play('missileLaunch', x, jet.y, 0.4, 0.5);
		w.events.message(
			sams ? 'ENEMY ATTACK JET' : 'ENEMY FIGHTER',
			sams ? 'Taking off to hunt our AA' : 'Scrambled from their airfield',
			'warn'
		);
	}

	/** Keeps this side's jets over its front as it moves, and reports any of ours that go down. */
	private patrol(w: World, dt: number): void {
		for (const [jet, id] of this.jets) {
			if (jet.active) continue;
			this.jets.delete(jet);
			w.events.message(`${COMMANDS[id].name.toUpperCase()} DOWN`, 'We lost an aircraft', 'warn');
			w.enemyCommand.reward(JET_SCORE);
		}
		for (const a of this.planes) if (!a.alive || a.dying) this.planes.delete(a);
		this.patrolClock -= dt;
		if (this.patrolClock > 0) return;
		this.patrolClock = 1;
		const x = this.front(w);
		if (this.ours) for (const jet of w.escorts) jet.patrol = x;
		else for (const a of this.planes) a.patrol = x;
	}

	private strike(w: World, id: CommandId, x: number): void {
		const ours = this.ours;
		const dir = this.dir;
		const site = ours ? OUR_SITES : THEIR_SITES;
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
			delay: nuke ? 4 : 3,
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
			if (f.nextDrop <= 0 && Math.abs(f.x - f.target) < 1500) {
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
