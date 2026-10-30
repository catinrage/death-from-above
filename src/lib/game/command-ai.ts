import { fx as rnd } from '../engine/rng';
import { ARMY_LIMIT, COMMANDS, type Command, type CommandId } from './command';
import { WORLD } from './constants';
import { UNITS } from './defs-units';
import type { Side } from './war';
import type { Unit } from './types';
import type { World } from './world';

/**
 * A commander that reads the battle. Every decision it first looks after its
 * HQ (strikes on whatever is besieging it), then strikes the best cluster near
 * the front, answers the other side's air with fighters and AA, keeps aircraft
 * up, and spends the rest on whatever counters the army coming at it, keeping
 * its own army as close to full as it can afford. `skill` (0..1) is how often
 * it picks the counter rather than something at random, how many aircraft it
 * keeps up and how little it sits on. It plays the enemy in every command
 * game, and our side in autoplay and balance tests.
 */
export class CommandAutopilot {
	private clock = 0;

	constructor(
		readonly side: Side = 'player',
		/** Seconds between decisions (set per game by the difficulty). */
		public pace = 0.5,
		/** How sharply it plays, 0 (careless) to 1 (every counter, every time). */
		public skill = 0.6
	) {}

	update(w: World, dt: number): void {
		const c = this.side === 'player' ? w.command : w.enemyCommand;
		if (!c.active) return;
		this.clock -= dt;
		if (this.clock > 0) return;
		this.clock = this.pace;
		const read = this.read(w);
		// One order a decision, most urgent first.
		if (this.defend(w, c, read)) return;
		if (this.strike(w, c, read)) return;
		if (this.air(w, c, read)) return;
		if (this.drones(w, c, read)) return;
		if (this.radar(w, c)) return;
		if (this.paratroopers(w, c)) return;
		this.ground(w, c, read);
	}

	/** What the other side has in the field, and how close it is to our HQ. */
	private read(w: World): Read {
		const ours = this.side === 'player';
		const foes = ours ? w.units : w.allies.list;
		const own = ours ? w.allies.list : w.units;
		const hq = ours ? (w.war.ourHqUp ? w.war.ourHq : null) : w.war.hq;
		// The edge of our HQ that faces them.
		const home = hq ? (ours ? hq.x1 : hq.x0) : ours ? WORLD.baseMaxX : WORLD.hqMinX;
		const r: Read = {
			armour: 0,
			infantry: 0,
			air: 0,
			helos: 0,
			ownAa: 0,
			ownFighters: 0,
			ownAir: 0,
			threat: null,
			home
		};
		// Under fog of war it only reacts to what its side has spotted.
		const side = this.side;
		const seen = (t: object): boolean => w.vision.seen(side, t);
		for (const u of foes) {
			if (!u.alive || u.def.isStatic || u.def.rail || !seen(u)) continue;
			if (u.def.category === 'infantry') r.infantry++;
			else r.armour += u.def.kind === 'superTank' ? 3 : 1;
			// Closest of them to our HQ, if it is getting close.
			const d = Math.abs(u.x - home);
			if (d < THREAT_RANGE && (!r.threat || d < Math.abs(r.threat.x - home))) r.threat = u;
		}
		for (const u of own) {
			if (!u.alive) continue;
			const k = u.def.kind;
			if (k === 'spaag' || k === 'sam' || k === 'manpads' || k === 'flak') r.ownAa++;
		}
		if (ours) {
			for (const a of w.air) {
				if (!a.alive || a.dying || !seen(a)) continue;
				if (a.kind === 'heli') r.helos++;
				else r.air++;
			}
			for (const e of w.escorts) {
				if (!e.active) continue;
				r.ownAir++;
				if (e.tactic === 'fighter') r.ownFighters++;
			}
		} else {
			for (const e of w.escorts) {
				if (!e.active || !seen(e)) continue;
				if (e.tactic === 'helo') r.helos++;
				else r.air++;
			}
			for (const a of w.air) {
				if (!a.alive || a.dying) continue;
				r.ownAir++;
				if (a.kind === 'fighter') r.ownFighters++;
			}
		}
		return r;
	}

	/** Troops at our wire come first: strike the bunch closest to the HQ, whatever it costs. */
	private defend(w: World, c: Command, r: Read): boolean {
		if (!r.threat || rnd.chance(1 - this.skill)) return false;
		const at = this.cluster(w, r.threat.x, 120);
		if (!at) return false;
		for (const id of DEFENCE_STRIKES) if (this.fire(w, c, id, at, 0)) return true;
		// Nothing to fire: anti-tank troops for armour at the gate, riflemen otherwise.
		const armour = r.threat.def.category !== 'infantry';
		return this.buy(w, c, armour ? ['antiTank', 'tankDestroyer'] : ['mgTeam', 'assault']);
	}

	/** The best cluster of theirs within reach of the front gets the biggest strike it is worth. */
	private strike(w: World, c: Command, r: Read): boolean {
		const at = this.cluster(w, c.front(w), 700);
		if (!at) return false;
		// Keep a little back for the next order unless the cluster is a big one.
		const spare = Math.round((1 - this.skill) * 300) + (r.threat ? 0 : 100);
		for (const id of STRIKES) {
			if (at.weight < weightFor(id)) continue;
			if (this.fire(w, c, id, at, spare)) return true;
		}
		return false;
	}

	/** Fighters and AA to answer their aircraft, then aircraft of our own to hit what they field. */
	private air(w: World, c: Command, r: Read): boolean {
		const theirAir = r.air + r.helos;
		if (theirAir > r.ownFighters && rnd.chance(this.skill)) {
			if (this.buy(w, c, FIGHTERS)) return true;
		}
		if (
			theirAir >= 2 &&
			r.ownAa < theirAir &&
			this.buy(w, c, r.helos > r.air ? ['aa', 'aaTeam'] : ['sam', 'aa'])
		)
			return true;
		const wanted = 2 + Math.round(this.skill * 4);
		if (r.ownAir >= wanted || c.funds < AIR_FUNDS) return false;
		const picks = r.armour > r.infantry / 3 ? ANTI_ARMOUR_AIR : ANTI_INFANTRY_AIR;
		return this.buy(w, c, rnd.chance(this.skill) ? picks : AIRCRAFT_PICKS);
	}

	/** Kamikaze drones at a column of armour. */
	private drones(w: World, c: Command, r: Read): boolean {
		if (r.armour < 3 || c.funds < 600 || !rnd.chance(0.2 + this.skill * 0.2)) return false;
		return c.order(w, rnd.chance(0.6) ? 'fpv' : 'delta') === null;
	}

	/** Under fog of war, a radar truck or two behind the front: what they show, every gun can hit. */
	private radar(w: World, c: Command): boolean {
		if (!w.vision.enabled || !rnd.chance(this.skill)) return false;
		const own = this.side === 'player' ? w.allies.list : w.units;
		let trucks = 0;
		for (const u of own) if (u.alive && u.def.kind === 'radarTruck') trucks++;
		if (trucks >= RADAR_TRUCKS) return false;
		return this.buy(w, c, ['radarTruck']);
	}

	/** Paratroopers onto the next checkpoint ahead, now and then. */
	private paratroopers(w: World, c: Command): boolean {
		if (c.funds < COMMANDS.para.cost + 300 || !rnd.chance(PARA_CHANCE * (0.5 + this.skill)))
			return false;
		return c.order(w, 'para', c.front(w)) === null;
	}

	/**
	 * Fills the army with what counters theirs: anti-tank against armour, guns
	 * that mow down infantry against infantry, with tanks and support mixed in.
	 * Big purchases once it is rich.
	 */
	private ground(w: World, c: Command, r: Read): void {
		if (c.armySize(w) >= ARMY_LIMIT - 2) return;
		if (c.funds > RICH && rnd.chance(BIG_CHANCE * this.skill)) {
			if (this.buy(w, c, ['column', 'behemoth', 'howitzer', 'rockets'])) return;
		}
		const counter = rnd.chance(0.35 + this.skill * 0.55);
		const pool = !counter
			? ANY_GROUND
			: r.armour * 4 > r.infantry
				? ANTI_ARMOUR_GROUND
				: ANTI_INFANTRY_GROUND;
		this.buy(w, c, pool);
	}

	/** Orders one of `ids` it can give now, picked at random among those. */
	private buy(w: World, c: Command, ids: readonly CommandId[]): boolean {
		const open = ids.filter((id) => c.refusal(w, id) === null);
		if (open.length === 0) return false;
		return c.order(w, rnd.pick(open)) === null;
	}

	/** Fires a strike on a cluster if it can afford it with `spare` left and its own troops are clear. */
	private fire(w: World, c: Command, id: CommandId, at: Cluster, spare: number): boolean {
		if (c.funds < COMMANDS[id].cost + spare) return false;
		const own = this.side === 'player' ? w.allies.list : w.units;
		const clear = id === 'nuke' ? 180 : 60;
		if (own.some((u) => u.alive && !u.def.isStatic && Math.abs(u.x - at.x) < clear)) return false;
		return c.order(w, id, at.x) === null;
	}

	/** The densest bunch of the other side's ground units within `reach` of x, by score. */
	private cluster(w: World, x: number, reach: number): Cluster | null {
		const foes = this.side === 'player' ? w.units : w.allies.list;
		let best: Cluster | null = null;
		for (const u of foes) {
			if (!u.alive || u.def.isStatic || Math.abs(u.x - x) > reach) continue;
			if (!w.vision.seen(this.side, u)) continue;
			let weight = 0;
			for (const o of foes) if (o.alive && Math.abs(o.x - u.x) < 40) weight += worth(o);
			if (!best || weight > best.weight) best = { x: u.x, weight };
		}
		return best;
	}
}

interface Cluster {
	x: number;
	weight: number;
}

/** What the commander sees of the battle each decision. */
interface Read {
	/** The other side's ground units by kind (a super-heavy tank counts as three). */
	armour: number;
	infantry: number;
	/** Their aircraft and helicopters in the air. */
	air: number;
	helos: number;
	/** Our air defence on the ground, our fighters and all our aircraft up. */
	ownAa: number;
	ownFighters: number;
	ownAir: number;
	/** Their unit closest to our HQ, once one is within THREAT_RANGE of it. */
	threat: Unit | null;
	/** The edge of our HQ that faces them. */
	home: number;
}

/** Their troops this close to our HQ are a threat to it. */
const THREAT_RANGE = 450;
/** Funds at which it buys columns, the super-heavy tank and artillery, and how often it does then. */
const RICH = 2200;
const BIG_CHANCE = 0.3;
/** Funds it waits for before it sends an aircraft up. */
const AIR_FUNDS = 700;
/** Radar trucks it keeps on the road under fog of war. */
const RADAR_TRUCKS = 2;
/** Chance per decision of sending paratroopers when it can afford them (at middling skill). */
const PARA_CHANCE = 0.05;

const DEFENCE_STRIKES: readonly CommandId[] = ['carpet', 'ballistic', 'barrage', 'cruise'];
const STRIKES: readonly CommandId[] = ['nuke', 'ballistic', 'carpet', 'cruise', 'barrage'];
const FIGHTERS: readonly CommandId[] = ['f22', 'su27', 'f16', 'wraith'];
const ANTI_ARMOUR_AIR: readonly CommandId[] = ['a10', 'su25', 'apache', 'f35', 'grizzly'];
const ANTI_INFANTRY_AIR: readonly CommandId[] = ['ac130', 'su24', 'b1', 'tu95', 'albatross'];
/** The aircraft it sends up when it isn't answering anything in particular. */
const AIRCRAFT_PICKS: readonly CommandId[] = [
	'f16',
	'su27',
	'a10',
	'su25',
	'su24',
	'apache',
	'ac130',
	'b1',
	'mq9'
];
const ANTI_ARMOUR_GROUND: readonly CommandId[] = [
	'tankDestroyer',
	'tankDestroyer',
	'antiTank',
	'antiTank',
	'tank',
	'ifv'
];
const ANTI_INFANTRY_GROUND: readonly CommandId[] = [
	'mgTeam',
	'mgTeam',
	'ifv',
	'apc',
	'mortars',
	'assault',
	'lightTank'
];
const ANY_GROUND: readonly CommandId[] = [
	'rifles',
	'assault',
	'antiTank',
	'mortars',
	'mgTeam',
	'jeep',
	'apc',
	'lightTank',
	'ifv',
	'tankDestroyer',
	'tank',
	'aa',
	'rockets',
	'howitzer',
	'aaTeam'
];

/** What a unit is worth hitting (our own units score nothing for the player, so use the base def). */
function worth(u: Unit): number {
	return Math.max(10, UNITS[u.def.kind].score);
}

/** How juicy a cluster must be (summed score) to be worth each strike. */
function weightFor(id: CommandId): number {
	if (id === 'nuke') return 1800;
	return id === 'ballistic' ? 600 : id === 'carpet' ? 450 : id === 'cruise' ? 150 : 200;
}
