import { Rng } from '../engine/rng';
import { WORLD } from './constants';
import { MOBILE_KINDS, STATIC_KINDS, UNITS } from './defs-units';
import { isBossKind, spawnBoss } from './boss';
import { AirUnit, type AirKind } from './enemy-air';
import { clearOfZones } from './no-fire';
import { trainConsist } from './railway';
import type { UnitKind } from './types';
import type { World } from './world';

export interface SpawnOrder {
	t: number;
	/** A road unit, an aircraft, or a whole armoured train on the railway. */
	kind: UnitKind | AirKind | 'train';
	z: number;
}

export interface WavePlan {
	orders: SpawnOrder[];
	statics: { kind: UnitKind; x: number }[];
}

/**
 * Adjustments a mission (or the endless escalation) makes to the generated
 * waves. Everything is optional; an empty object reproduces the stock waves.
 */
export interface WaveTweaks {
	/** Multiplies the wave's spending budget. */
	budget?: number;
	/** Multiplies how often each kind leads a convoy. */
	lead?: Partial<Record<UnitKind, number>>;
	/** Replaces the number of interceptors / gunships. */
	fighters?: number;
	helis?: number;
	/** Takes this many interceptors and gunships each off the wave (never below none). */
	airCut?: number;
	/** Vehicles the wave must field, each leading its own convoy, whatever the budget. */
	units?: UnitKind[];
	/** A boss that joins the wave on top of its budget. */
	boss?: UnitKind;
	/** Replaces the number of armoured trains sent down the railway. */
	trains?: number;
}

export interface WaveOptions {
	/** Added to the wave number to set enemy strength (wave 1 of a late mission is tougher). */
	offset?: number;
	/** Final wave: clearing it ends the sequence instead of starting the next. */
	last?: number;
	/** Per-wave adjustments, keyed by the sequence's own wave number. */
	tweaks?: (wave: number) => WaveTweaks;
	/** Emplacements dug in on top of the usual ones when the first wave launches. */
	statics?: UnitKind[];
	/** Briefing lines for each wave (falls back to the stock ones). */
	briefings?: string[];
	/**
	 * The war rolls on: a wave needn't be wiped out, only spent, before the
	 * next one forms up, and the sequence never ends by itself.
	 */
	rolling?: boolean;
}

/** A rolling wave is spent once this share of what it sent is gone... */
const SPENT = 0.3;
/** ...or this many seconds after its last unit set off. */
const SPENT_AFTER = 50;

const AIR: AirKind[] = ['fighter', 'heli'];
const isAir = (k: SpawnOrder['kind']): k is AirKind => (AIR as string[]).includes(k);

/** Armoured trains a wave sends by default: none early on, then more and more often one. */
function stockTrains(wave: number, seed: number): number {
	if (wave < 4) return 0;
	// Its own stream, so adding the railway left every road column as it was.
	const rng = new Rng(seed * 6131 + wave * 31337);
	return rng.chance(Math.min(0.85, 0.35 + (wave - 4) * 0.1)) ? 1 : 0;
}

/** Weighted pick of a convoy's lead vehicle for the current wave. */
function leadFor(wave: number, rng: Rng, bias: WaveTweaks['lead'] = {}): UnitKind {
	const pool: [UnitKind, number][] = [
		['truck', 3],
		['jeep', 3],
		['tank', wave >= 2 ? 3 + wave * 0.3 : 0],
		['apc', wave >= 3 ? 2.5 : 0],
		['spaag', wave >= 2 ? 1.8 : 0],
		['sam', wave >= 4 ? 1.2 : 0],
		['artillery', wave >= 4 ? 1.3 : 0]
	];
	for (const entry of pool) entry[1] *= bias[entry[0]] ?? 1;
	const total = pool.reduce((s, [, w]) => s + w, 0);
	let r = rng.next() * total;
	for (const [k, w] of pool) {
		r -= w;
		if (r <= 0) return k;
	}
	return 'truck';
}

/** Composes a wave from a budget that grows with the wave number. */
export function planWave(
	wave: number,
	seed: number,
	existingStatics: number,
	/** Battle-line stretch to keep emplacements out of (the river valley). */
	avoid: [number, number] | null = null,
	tweaks: WaveTweaks = {},
	/** Emplacements to place regardless of how many are already standing. */
	extraStatics: UnitKind[] = []
): WavePlan {
	const rng = new Rng(seed * 7919 + wave * 104729);
	let budget = (70 + wave * 48) * (tweaks.budget ?? 1);
	const orders: SpawnOrder[] = [];
	let t = 2;
	const lane = (): number => rng.pick([-1.8, 0, 1.6]);
	const add = (kind: UnitKind, at: number, z: number): void => {
		orders.push({ t: at, kind, z });
		budget -= UNITS[kind].cost;
	};
	if (wave >= 2) add('spaag', t + 6, lane());
	if (wave >= 4) add('sam', t + 14, lane());
	const forced = [...(tweaks.units ?? [])];
	while (budget > 0 || forced.length > 0) {
		const lead = forced.shift() ?? leadFor(wave, rng, tweaks.lead);
		add(lead, t, lane());
		let at = t;
		const escorts = rng.int(1, 3 + Math.min(wave, 4));
		for (let i = 0; i < escorts && budget > 0; i++) {
			const infantry = rng.chance(0.6);
			const kind: UnitKind = infantry
				? wave >= 3 && rng.chance(0.25)
					? 'manpads'
					: 'rifleman'
				: rng.pick(
						MOBILE_KINDS.filter((k) => UNITS[k].minWave <= wave && k !== 'sam' && k !== 'artillery')
					);
			at += infantry ? rng.range(0.4, 1) : rng.range(2.2, 3.4);
			if (infantry) {
				const squad = rng.int(2, 4);
				for (let s = 0; s < squad && budget > 0; s++)
					add(kind, at + s * 0.35, rng.range(-3.2, 3.2));
			} else {
				add(kind, at, lane());
			}
		}
		t = at + rng.range(7, 13) - Math.min(wave, 8) * 0.4;
	}
	const cut = tweaks.airCut ?? 0;
	const fighters = Math.max(
		0,
		(tweaks.fighters ?? (wave >= 5 ? Math.min(1 + Math.floor((wave - 5) / 2), 4) : 0)) - cut
	);
	const helis = Math.max(
		0,
		(tweaks.helis ?? (wave >= 3 ? Math.min(Math.floor((wave - 1) / 2), 4) : 0)) - cut
	);
	for (let i = 0; i < fighters; i++)
		orders.push({ t: rng.range(10, Math.max(20, t)), kind: 'fighter', z: 0 });
	for (let i = 0; i < helis; i++)
		orders.push({ t: rng.range(6, Math.max(16, t)), kind: 'heli', z: 0 });
	// The cruiser opens the wave from the river; the tank follows the first convoy.
	if (tweaks.boss) orders.push({ t: tweaks.boss === 'cruiser' ? 4 : 12, kind: tweaks.boss, z: 0 });
	const trains = tweaks.trains ?? stockTrains(wave, seed);
	for (let i = 0; i < trains; i++) orders.push({ t: 5 + i * 45, kind: 'train', z: 0 });
	orders.sort((a, b) => a.t - b.t);

	const statics: { kind: UnitKind; x: number }[] = [];
	const want = Math.max(0, Math.min(1 + Math.floor(wave * 0.8), 9) - existingStatics);
	const options = STATIC_KINDS.filter((k) => UNITS[k].minWave <= wave);
	const used: number[] = [];
	const place = (kind: UnitKind): void => {
		let x = 0;
		for (let tries = 0; tries < 20; tries++) {
			x = rng.range(WORLD.baseMaxX + 600, WORLD.hqMinX - 200);
			const wet = avoid !== null && x > avoid[0] && x < avoid[1];
			if (!wet && used.every((u) => Math.abs(u - x) > 70)) break;
		}
		// Never dig in on the river bank: slide out of the valley.
		if (avoid && x > avoid[0] && x < avoid[1])
			x = x - avoid[0] < avoid[1] - x ? avoid[0] - 16 : avoid[1] + 16;
		used.push(x);
		statics.push({ kind, x });
		if (kind === 'flak' && wave >= 3 && rng.chance(0.6))
			statics.push({ kind: 'searchlight', x: x + rng.sign() * 16 });
	};
	for (let i = 0; i < want; i++) {
		let kind = rng.pick(options);
		if ((kind === 'depot' || kind === 'radar') && rng.chance(0.5)) kind = rng.pick(options);
		place(kind);
	}
	for (const kind of extraStatics) place(kind);
	return { orders, statics };
}

/**
 * Endless escalation: past the hand-tuned early waves the columns keep
 * growing and more aircraft join them.
 */
export function endlessTweaks(wave: number): WaveTweaks {
	const late = Math.max(0, wave - 11);
	return {
		boss: endlessBoss(wave),
		budget: 1 + Math.max(0, wave - 6) * 0.07,
		fighters: late > 0 ? Math.min(4 + Math.floor(late / 3), 7) : undefined,
		helis: late > 0 ? Math.min(4 + Math.floor(late / 3), 6) : undefined
	};
}

const ENDLESS_BOSSES: UnitKind[] = ['superTank', 'cruiser', 'railGun'];

/** Every fifth endless wave brings a boss: the tank, the cruiser and the railway gun in turn. */
export function endlessBoss(wave: number): UnitKind | undefined {
	if (wave % 5 !== 0) return undefined;
	return ENDLESS_BOSSES[(wave / 5 - 1) % ENDLESS_BOSSES.length];
}

/** Score for beating a wave: grows with the wave and with what is left of the airfield. */
export function waveBonus(wave: number, baseFrac: number): number {
	return Math.round(((100 + wave * 100) * (0.5 + baseFrac * 0.5)) / 10) * 10;
}

export type WaveState = 'idle' | 'briefing' | 'active' | 'cleared' | 'complete';

export class WaveDirector {
	wave = 0;
	state: WaveState = 'idle';
	timer = 0;
	private queue: SpawnOrder[] = [];
	private elapsed = 0;
	/** Seconds since the last order of the wave went out. */
	private idle = 0;
	total = 0;
	spawned = 0;
	/** Waves fully beaten in this sequence. */
	cleared = 0;

	constructor(
		private readonly seed = 1,
		private readonly opts: WaveOptions = {}
	) {}

	/** Enemy strength for a wave of this sequence. */
	difficulty(wave = this.wave): number {
		return wave + (this.opts.offset ?? 0);
	}

	/** "WAVE 2/4" in a mission, "WAVE 7" in an open-ended run. */
	get label(): string {
		return this.opts.last && !this.opts.rolling
			? `WAVE ${this.wave}/${this.opts.last}`
			: `WAVE ${this.wave}`;
	}

	begin(w: World, wave = 1): void {
		this.wave = wave;
		w.wave = this.difficulty(wave);
		this.state = 'briefing';
		if (wave > 1) {
			w.bridge?.rebuild(w);
			w.railBridge?.rebuild(w);
			w.railway?.repair();
			for (const p of w.pilots()) p.restockWave();
			// A wingman lost last wave is replaced as the next one starts.
			w.wingman?.reinforce(w);
		}
		this.timer = 3.5;
		const note = this.opts.briefings?.[wave - 1] ?? briefing(this.difficulty(wave));
		w.events.message(this.label, note, 'info');
		w.sound.play('siren', w.camera.x, w.camera.y, 0.7);
	}

	private launch(w: World): void {
		const statics = w.units.filter((u) => u.alive && u.def.isStatic).length;
		const r = w.river;
		const avoid: [number, number] | null = r
			? [r.x0 - r.bridgeHalf - 40, r.x0 + r.bridgeHalf + 40]
			: null;
		const tweaks = { ...this.opts.tweaks?.(this.wave) };
		// Every checkpoint the enemy holds swells its waves.
		if (w.war.active) tweaks.budget = (tweaks.budget ?? 1) * w.war.enemyBudgetScale();
		const plan = planWave(
			this.difficulty(),
			this.seed,
			statics,
			avoid,
			tweaks,
			this.wave === 1 ? (this.opts.statics ?? []) : []
		);
		this.queue = plan.orders;
		this.total = plan.orders.length;
		this.spawned = 0;
		this.elapsed = 0;
		this.idle = 0;
		for (const s of plan.statics) {
			const z =
				s.kind === 'depot' || s.kind === 'radar' ? -14 : s.kind === 'searchlight' ? -9 : -11;
			// Emplacements never dig in among the houses of a no-fire zone.
			const u = w.spawnUnit(s.kind, clearOfZones(s.x), z, -1);
			u.yaw = Math.PI;
		}
		this.state = 'active';
	}

	update(w: World, dt: number): void {
		if (this.state === 'idle' || this.state === 'complete') return;
		this.timer -= dt;
		if (this.state === 'briefing') {
			if (this.timer <= 0) this.launch(w);
			return;
		}
		if (this.state === 'cleared') {
			if (this.timer <= 0) this.begin(w, this.wave + 1);
			return;
		}
		this.elapsed += dt;
		while (this.queue.length > 0 && this.queue[0].t <= this.elapsed) {
			const o = this.queue.shift();
			if (!o) break;
			this.spawn(w, o);
		}
		if (this.queue.length > 0) return;
		this.idle += dt;
		if (this.opts.rolling) {
			const left = w.hostilesAlive();
			if (left > 0 && left > this.spawned * SPENT && this.idle < SPENT_AFTER) return;
			this.cleared++;
			this.state = 'cleared';
			this.timer = left === 0 ? 7 : 10;
			w.events.message(`WAVE ${this.wave} SPENT`, 'The next wave is forming up. Rearm', 'good');
			return;
		}
		if (w.hostilesAlive() > 0) return;
		this.cleared++;
		if (this.opts.last && this.wave >= this.opts.last) {
			this.state = 'complete';
			return;
		}
		this.state = 'cleared';
		this.timer = 7;
		w.events.message(`WAVE ${this.wave} CLEARED`, 'Rearm at the airfield', 'good');
	}

	private spawn(w: World, o: SpawnOrder): void {
		this.spawned++;
		if (isAir(o.kind)) {
			const x = WORLD.arenaMaxX + 60;
			const y = o.kind === 'fighter' ? w.rng.range(170, 250) : w.ground(x) + 55;
			w.air.push(new AirUnit(w.newId(), o.kind, x, y));
			return;
		}
		if (isBossKind(o.kind)) {
			spawnBoss(w, o.kind);
			return;
		}
		if (o.kind === 'train') {
			if (!w.railway) return;
			w.railway.spawnTrain(w, trainConsist(w.wave));
			w.events.message('ARMOURED TRAIN', 'Tear up the track ahead of it', 'warn');
			return;
		}
		// In a war, columns form up at the enemy's foremost checkpoint.
		const x = w.war.active ? w.war.enemyStaging() : WORLD.enemySpawnX;
		w.spawnUnit(o.kind, x + w.rng.range(0, 30), o.z, -1);
	}

	/** Remaining enemies including those not yet deployed. */
	remaining(w: World): number {
		return this.queue.length + w.hostilesAlive();
	}
}

function briefing(wave: number): string {
	const notes: Record<number, string> = {
		1: 'Infantry and trucks advancing — stop them before they reach the airfield',
		2: 'Armour and mobile AA guns spotted',
		3: 'Flak batteries dug in. Missile troopers and gunships inbound',
		4: 'SAM launchers and artillery. Use flares when locked',
		5: 'Enemy interceptors scrambled'
	};
	return notes[wave] ?? 'Enemy reinforcements incoming';
}
