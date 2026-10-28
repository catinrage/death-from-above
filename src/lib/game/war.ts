import { clamp } from '../engine/math';
import { pickWeighted, Rng, fx as rnd } from '../engine/rng';
import type { MeshName } from '../models';
import type { AllyKind } from './allies';
import { WORLD } from './constants';
import { UNITS } from './defs-units';
import type { FireSource } from './fires';
import type { Owner, UnitDef, UnitKind } from './types';
import type { World } from './world';

/**
 * The two-army war: an enemy HQ at the far end of the road that only ground
 * troops can take, checkpoints along the way that either army can capture,
 * and the (weaker) stream of friendly reinforcements the player has to carry
 * through to the HQ.
 */

export type Side = Owner;

export interface Checkpoint {
	readonly name: string;
	readonly x: number;
	/** Who holds it, or null while neutral. */
	owner: Side | null;
	/** Capture state from -1 (enemy) to +1 (ours). */
	hold: number;
	/** Troops of both armies are on it, so neither gains ground. */
	contested: boolean;
	/** The side whose troops are taking it this moment, or null. */
	gaining: Side | null;
}

/** Ground troops within this distance of a checkpoint count toward taking it. */
export const CAPTURE_RADIUS = 45;
/** Capture progress per second for each soldier or vehicle on it, up to CAPTURE_CAP of them. */
export const CAPTURE_RATE = 0.09;
const CAPTURE_CAP = 4;
/** Seconds between friendly reinforcement groups. */
export const GROUP_INTERVAL = 30;
/** No new group sets off while this many of our troops are already in the field. */
export const ARMY_CAP = 24;
/** Reinforcements only form up at a checkpoint with no enemy troops this close. */
const SAFE_RADIUS = 300;
/** Enemy columns form up this far behind their foremost checkpoint. */
const STAGE_BEHIND = 70;
/** How much bigger the enemy's waves are in a war than in the old wave-defence game. */
export const ENEMY_EDGE = 2.2;
/** In a war, infantry on both sides moves at this multiple of its walking pace (the road is long). */
export const MARCH = 1.6;
/** HQ strength in a war that sets none. */
export const HQ_HP = 1500;

export interface WarSetup {
	/** Strength of the enemy HQ. */
	hqHp?: number;
	/** Multiplies the budget of every friendly reinforcement group. */
	reinforce?: number;
	/** The first group out, instead of a planned one. */
	opening?: readonly AllyKind[];
}

/** Where the checkpoints stand: one at each side of the river crossing and one in each half of the road. */
export function checkpointLayout(
	riverX: number | null,
	bridgeHalf = 60
): { name: string; x: number }[] {
	return [
		{ name: 'Crossroads', x: 1100 },
		{ name: 'Farmstead', x: 1850 },
		{ name: 'Bridgehead', x: riverX !== null ? riverX + bridgeHalf + 75 : 2700 },
		{ name: 'Outpost', x: 3330 }
	];
}

/** The side a checkpoint starts with: our end of the road is ours, the far end theirs. */
function startOwner(i: number, n: number): Side | null {
	if (i === 0) return 'player';
	if (i === n - 1) return 'enemy';
	return null;
}

/**
 * Picks a friendly reinforcement group. It is planned like an enemy wave but
 * on a much smaller budget: the player's air power has to make up the rest.
 */
export function planGroup(wave: number, rng: Rng, scale = 1): AllyKind[] {
	let budget = (18 + wave * 10) * scale;
	const out: AllyKind[] = [];
	const add = (kind: AllyKind): void => {
		out.push(kind);
		budget -= UNITS[kind].cost;
	};
	const squad = rng.int(2, 4);
	for (let i = 0; i < squad; i++) add(i === 0 || rng.chance(0.6) ? 'rifleman' : soldier(wave, rng));
	const vehicles: [AllyKind, number][] = [
		['jeep', 3],
		['lightTank', 1.6],
		['tank', wave >= 2 ? 2 + wave * 0.15 : 0.6],
		['apc', wave >= 2 ? 2 : 0.6],
		['spaag', wave >= 4 ? 1 : 0],
		['rocketTruck', wave >= 5 ? 0.6 : 0]
	];
	// Always at least one vehicle: infantry alone would never reach the HQ.
	add(pickWeighted(vehicles, rng, 'jeep'));
	while (budget > 0) {
		add(rng.chance(0.35) ? soldier(wave, rng) : pickWeighted(vehicles, rng, 'jeep'));
	}
	return out;
}

/** A specialist to stiffen a squad. */
function soldier(wave: number, rng: Rng): AllyKind {
	return pickWeighted<AllyKind>(
		[
			['atTrooper', 1.4],
			['medic', 1],
			['sniper', wave >= 2 ? 0.8 : 0.3],
			['mortar', wave >= 2 ? 1 : 0.3],
			['manpads', wave >= 3 ? 1.2 : 0]
		],
		rng,
		'atTrooper'
	);
}

export interface HqStructure {
	mesh: MeshName;
	x: number;
	z: number;
	yaw: number;
	/** Rubble left where it stood once the HQ falls (small things just vanish). */
	ruin: boolean;
	fire: FireSource | null;
}

const LAYOUT: Omit<HqStructure, 'fire'>[] = [
	{ mesh: 'block3', x: 3660, z: -34, yaw: 0, ruin: true },
	{ mesh: 'tower', x: 3725, z: -30, yaw: Math.PI, ruin: true },
	{ mesh: 'radarStation', x: 3610, z: -32, yaw: 0, ruin: true },
	{ mesh: 'fuelDepot', x: 3600, z: -21, yaw: 0, ruin: true },
	{ mesh: 'fuelDepot', x: 3742, z: -19, yaw: 0.3, ruin: true },
	{ mesh: 'bunker', x: 3590, z: -11, yaw: Math.PI, ruin: true },
	{ mesh: 'bunker', x: 3700, z: -13, yaw: Math.PI, ruin: true },
	{ mesh: 'crates', x: 3680, z: -20, yaw: 0.6, ruin: false },
	{ mesh: 'flagpole', x: 3640, z: -18, yaw: Math.PI, ruin: false },
	{ mesh: 'sandbagWall', x: 3576, z: 8, yaw: Math.PI / 2, ruin: false },
	{ mesh: 'sandbagWall', x: 3576, z: -8, yaw: Math.PI / 2, ruin: false },
	{ mesh: 'tankTrap', x: 3560, z: 7, yaw: 0, ruin: false },
	{ mesh: 'tankTrap', x: 3562, z: -5, yaw: 0.7, ruin: false }
];

/** The enemy headquarters: the objective of the war. Bombs and missiles don't touch it. */
export class EnemyHQ {
	readonly x0 = WORLD.hqMinX;
	readonly x1 = WORLD.hqMaxX;
	maxHp = HQ_HP;
	hp = HQ_HP;
	/** Seconds since it last took fire. */
	underAttack = 0;
	/** Seconds since it fell (negative while standing). */
	fallen = -1;
	readonly structures: HqStructure[] = LAYOUT.map((s) => ({ ...s, fire: null }));
	private fireStage = 0;

	get destroyed(): boolean {
		return this.hp <= 0;
	}

	contains(x: number): boolean {
		return x >= this.x0 - 10 && x <= this.x1 + 10;
	}

	/** Damage from troops at the wire: the only thing that hurts it. */
	damage(w: World, amount: number): void {
		if (this.destroyed || amount <= 0) return;
		this.hp = Math.max(0, this.hp - amount);
		this.underAttack = 2;
		const stage = Math.floor((1 - this.hp / this.maxHp) * 5);
		while (this.fireStage < stage && this.fireStage < 4) {
			this.fireStage++;
			const s = rnd.pick(this.structures.filter((b) => !b.fire && b.ruin));
			if (s) {
				const y = w.terrain.heightAtXZ(s.x, s.z);
				s.fire = w.fires.add(s.x + rnd.range(-3, 3), y + 2, s.z, 2.4, 1e9, { radius: 3 });
				w.fx.explosion(s.x, y + 2, s.z, 1, true);
				w.sound.boom(0.8, s.x, y);
			}
		}
		if (this.destroyed) this.fall(w);
	}

	private fall(w: World): void {
		this.fallen = 0;
		for (const s of this.structures) {
			const y = w.terrain.heightAtXZ(s.x, s.z);
			w.fx.explosion(s.x, y + 3, s.z, s.ruin ? 2.2 : 0.8, true);
			if (s.ruin && !s.fire) s.fire = w.fires.add(s.x, y + 1.5, s.z, 2, 1e9, { radius: 3 });
		}
		const mid = (this.x0 + this.x1) / 2;
		w.sound.boom(4, mid, w.ground(mid));
		w.events.slowmo(0.35, 1.2);
	}

	update(w: World, dt: number): void {
		this.underAttack = Math.max(0, this.underAttack - dt);
		if (this.fallen < 0) return;
		this.fallen += dt;
		// Secondary explosions rolling through the compound for a few seconds.
		if (this.fallen < 4 && rnd.chance(dt * 5)) {
			const s = rnd.pick(this.structures);
			const y = w.terrain.heightAtXZ(s.x, s.z);
			w.fx.explosion(s.x + rnd.gauss(4), y + rnd.range(1, 6), s.z, rnd.range(0.6, 1.4), true);
			w.sound.boom(1, s.x, y);
		}
	}

	reset(hp: number): void {
		this.maxHp = this.hp = hp;
		this.fireStage = 0;
		this.fallen = -1;
		this.underAttack = 0;
		for (const s of this.structures) s.fire = null;
	}
}

/** Emplacements dug in around the HQ when the war starts: they keep our troops off the wire. */
const HQ_DEFENCES: { kind: UnitKind; dx: number; z: number }[] = [
	{ kind: 'bunker', dx: -70, z: -11 },
	{ kind: 'flak', dx: -130, z: -11 },
	{ kind: 'bunker', dx: -190, z: -11 }
];

export class War {
	/** Off in training, the title demo and tests that don't start one. */
	active = false;
	readonly hq = new EnemyHQ();
	checkpoints: Checkpoint[] = [];
	/** HQs destroyed this game. */
	hqsDestroyed = 0;
	/** Checkpoints taken by our troops / lost to theirs, this game. */
	taken = 0;
	lost = 0;
	/** Most checkpoints held at once this game. */
	mostHeld = 0;
	/** Seconds to the next friendly reinforcement group. */
	nextGroup = 0;
	/** Groups sent this game. */
	groups = 0;
	private setup: WarSetup = {};
	private rng = new Rng(1);
	private hinted = false;

	start(w: World, setup: WarSetup = {}, seed = 1): void {
		this.active = true;
		this.setup = setup;
		this.rng = new Rng(seed * 3571 + 17);
		this.hqsDestroyed = 0;
		this.taken = this.lost = this.groups = 0;
		this.hinted = false;
		this.hq.reset(setup.hqHp ?? HQ_HP);
		const r = w.river;
		const layout = checkpointLayout(r ? r.x0 : null, r?.bridgeHalf);
		this.checkpoints = layout.map((c, i) => {
			const owner = startOwner(i, layout.length);
			return {
				...c,
				owner,
				hold: owner === 'player' ? 1 : owner === 'enemy' ? -1 : 0,
				contested: false,
				gaining: null
			};
		});
		this.mostHeld = this.held('player');
		this.nextGroup = 6;
		this.fortify(w);
	}

	stop(): void {
		this.active = false;
		this.checkpoints = [];
		this.hq.reset(this.hq.maxHp);
	}

	held(side: Side): number {
		let n = 0;
		for (const c of this.checkpoints) if (c.owner === side) n++;
		return n;
	}

	/**
	 * The enemy fields a bigger army than ours (that is the whole challenge),
	 * and each checkpoint it holds feeds its waves more troops.
	 */
	enemyBudgetScale(): number {
		return ENEMY_EDGE + 0.15 * this.held('enemy');
	}

	/** Where enemy waves form up: their checkpoint nearest our airfield, or behind their HQ. */
	enemyStaging(): number {
		let x: number = WORLD.enemySpawnX;
		for (const c of this.checkpoints)
			if (c.owner === 'enemy' && c.x + STAGE_BEHIND < x) x = c.x + STAGE_BEHIND;
		return x;
	}

	/**
	 * Our furthest checkpoint that is safe to form up at (no enemy troops
	 * close by), where reinforcements set off from; null: from the airfield.
	 */
	forward(w: World): Checkpoint | null {
		let best: Checkpoint | null = null;
		for (const c of this.checkpoints) {
			if (c.owner !== 'player' || (best && c.x < best.x)) continue;
			const threatened = w.units.some(
				(u) => u.alive && !u.def.isStatic && !u.def.rail && Math.abs(u.x - c.x) < SAFE_RADIUS
			);
			if (!threatened) best = c;
		}
		return best;
	}

	/** A checkpoint a unit of `side` standing at x should stop on until its side holds it. */
	holdingAt(x: number, side: Side): Checkpoint | null {
		if (!this.active) return null;
		for (const c of this.checkpoints)
			if (c.owner !== side && Math.abs(x - c.x) < CAPTURE_RADIUS * 0.55) return c;
		return null;
	}

	/** Where a friendly unit parks to shell the HQ: guns stand off, infantry goes to the wire. */
	siegeLine(def: UnitDef): number {
		const standoff = def.kind === 'tank' ? 70 : def.category === 'infantry' ? 14 + def.half[0] : 40;
		return this.hq.x0 - standoff;
	}

	/** Our bombs landing on the HQ do nothing: say why, once. */
	blastAt(w: World, x: number, by: Owner): void {
		if (!this.active || this.hinted || by !== 'player' || !this.hq.contains(x)) return;
		// Our own troops shelling the wire set off blasts there too: that is no time for the hint.
		if (this.hq.destroyed || w.allies.list.some((u) => u.alive && u.state === 'siege')) return;
		this.hinted = true;
		w.events.message(
			'HQ IS HARDENED',
			'Air strikes can’t touch it: get our troops to the wire',
			'warn'
		);
	}

	update(w: World, dt: number): void {
		if (!this.active) return;
		this.capture(w, dt);
		this.hq.update(w, dt);
		if (this.hq.destroyed && this.hqsDestroyed === 0) this.hqFell(w);
		this.reinforce(w, dt);
	}

	/** The HQ just fell: count it and tell everyone. */
	private hqFell(w: World): void {
		this.hqsDestroyed++;
		w.events.message('ENEMY HQ DESTROYED', 'The sector is ours', 'good');
	}

	/** Digs in the HQ's own guns. */
	private fortify(w: World): void {
		for (const d of HQ_DEFENCES) {
			const u = w.spawnUnit(d.kind, this.hq.x0 + d.dx, d.z, -1);
			u.yaw = Math.PI;
		}
	}

	private capture(w: World, dt: number): void {
		const held = this.held('player');
		for (const c of this.checkpoints) {
			let ours = 0;
			let theirs = 0;
			for (const u of w.allies.list) if (u.alive && Math.abs(u.x - c.x) < CAPTURE_RADIUS) ours++;
			for (const t of w.troops.list)
				if (t.alive && t.landed && Math.abs(t.x - c.x) < CAPTURE_RADIUS) ours++;
			for (const u of w.units) {
				if (!u.alive || u.def.isStatic || u.def.rail || u.def.kind === 'cruiser') continue;
				if (Math.abs(u.x - c.x) < CAPTURE_RADIUS) theirs++;
			}
			c.contested = ours > 0 && theirs > 0;
			c.gaining = null;
			if (c.contested || ours + theirs === 0) continue;
			const side: Side = ours > 0 ? 'player' : 'enemy';
			const dir = side === 'player' ? 1 : -1;
			const before = c.hold;
			c.hold = clamp(
				c.hold + dir * CAPTURE_RATE * Math.min(ours + theirs, CAPTURE_CAP) * dt,
				-1,
				1
			);
			if (c.hold !== before) c.gaining = side;
			this.settle(w, c);
		}
		const now = this.held('player');
		if (now !== held) this.mostHeld = Math.max(this.mostHeld, now);
	}

	/** Hands a checkpoint over once its flag is fully up or down. */
	private settle(w: World, c: Checkpoint): void {
		const was = c.owner;
		if (c.hold >= 1) c.owner = 'player';
		else if (c.hold <= -1) c.owner = 'enemy';
		// Pulled past the middle: whoever held it has lost it.
		else if ((was === 'player' && c.hold <= 0) || (was === 'enemy' && c.hold >= 0)) c.owner = null;
		if (c.owner === was) return;
		if (c.owner === 'player') {
			this.taken++;
			w.events.message('CHECKPOINT TAKEN', `${c.name} is ours`, 'good');
		} else if (was === 'player') {
			this.lost++;
			w.events.message('CHECKPOINT LOST', `The enemy pushed us off ${c.name}`, 'warn');
		} else if (c.owner === 'enemy') {
			w.events.message('', `The enemy took ${c.name}`, 'warn');
		}
	}

	private reinforce(w: World, dt: number): void {
		this.nextGroup -= dt;
		if (this.nextGroup > 0) return;
		this.nextGroup = GROUP_INTERVAL;
		if (w.allies.alive() >= ARMY_CAP) return;
		const scale = (this.setup.reinforce ?? 1) * (1 + 0.15 * this.held('player'));
		const kinds =
			this.groups === 0 && this.setup.opening
				? this.setup.opening
				: planGroup(Math.max(1, w.wave), this.rng, scale);
		const cp = this.forward(w);
		const from = cp && cp.x > WORLD.baseMaxX + 70 ? cp.x - 20 : undefined;
		w.allies.deploy(
			w,
			kinds,
			from,
			cp ? `Forming up at ${cp.name}` : 'Rolling out from the airfield'
		);
		this.groups++;
	}
}
