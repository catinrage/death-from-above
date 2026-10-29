import { fx as rnd } from '../engine/rng';
import { COMMANDS, type Command, type CommandId } from './command';
import { UNITS } from './defs-units';
import type { Side } from './war';
import type { Unit } from './types';
import type { World } from './world';

/**
 * A simple commander: it keeps a mix of troops and armour moving, puts a
 * few aircraft up, sends drones at big clusters, and drops strikes on the
 * biggest cluster of the other side near its front. It plays the enemy in
 * every command game, and our side in autoplay and balance tests.
 */
export class CommandAutopilot {
	private clock = 0;
	/** Seconds left saving up for a jet or a strike instead of buying troops. */
	private saving = 0;

	constructor(
		readonly side: Side = 'player',
		/** Seconds between decisions (set per game by the difficulty). */
		public pace = 0.5
	) {}

	update(w: World, dt: number): void {
		const ours = this.side === 'player';
		const c = ours ? w.command : w.enemyCommand;
		if (!c.active) return;
		this.clock -= dt;
		if (this.clock > 0) return;
		this.clock = this.pace;
		this.saving = Math.max(0, this.saving - this.pace);
		const target = this.cluster(w, c);
		if (target) {
			const friends = ours ? w.allies.list : w.units;
			// While saving up, anything affordable goes; otherwise only what leaves some over.
			const spare = this.saving > 0 ? 0 : 250;
			for (const id of ['nuke', 'ballistic', 'carpet', 'cruise', 'barrage'] as CommandId[]) {
				// Never on top of its own troops.
				if (c.funds < COMMANDS[id].cost + spare) continue;
				const clear = id === 'nuke' ? 180 : 60;
				if (friends.some((u) => u.alive && !u.def.isStatic && Math.abs(u.x - target.x) < clear))
					continue;
				if (target.weight >= weightFor(id) && !c.order(w, id, target.x)) {
					this.saving = 0;
					return;
				}
			}
		}
		// Now and then, paratroopers onto the front to take the next checkpoint.
		if (c.funds > COMMANDS.para.cost + 200 && rnd.chance(PARA_CHANCE)) {
			if (!c.order(w, 'para', c.front(w))) return;
		}
		if (c.airborne(w) < 3 && c.funds > AIR_FUNDS) {
			if (!c.order(w, rnd.pick(AIRCRAFT_PICKS))) this.saving = 0;
			return;
		}
		if (target && target.weight >= 300 && c.funds > 600 && rnd.chance(0.25)) {
			c.order(w, rnd.chance(0.6) ? 'fpv' : 'delta');
			return;
		}
		// Saving for a jet or a strike: buy no troops for a while.
		if (this.saving > 0) return;
		const pick = rnd.pick<CommandId>([
			'rifles',
			'assault',
			'antiTank',
			'mortars',
			'jeep',
			'apc',
			'lightTank',
			'tank',
			'tank',
			'aa',
			'rockets',
			'howitzer',
			'aaTeam'
		]);
		if (c.order(w, pick) === null && rnd.chance(SAVE_CHANCE)) this.saving = SAVE_TIME;
	}

	/** The densest bunch of the other side's ground units within reach of the front, by score. */
	private cluster(w: World, c: Command): { x: number; weight: number } | null {
		const front = c.front(w);
		const foes = this.side === 'player' ? w.units : w.allies.list;
		let best: { x: number; weight: number } | null = null;
		for (const u of foes) {
			if (!u.alive || u.def.isStatic || Math.abs(u.x - front) > 700) continue;
			let weight = 0;
			for (const o of foes) if (o.alive && Math.abs(o.x - u.x) < 40) weight += worth(o);
			if (!best || weight > best.weight) best = { x: u.x, weight };
		}
		return best;
	}
}

/** The aircraft it sends up, and the funds it waits for before it does. */
const AIRCRAFT_PICKS: readonly CommandId[] = ['f16', 'a10', 'su25', 'apache', 'ac130', 'b1', 'mq9'];
const AIR_FUNDS = 750;
/** Chance per decision of sending paratroopers when it can afford them. */
const PARA_CHANCE = 0.04;

/** After buying troops, the chance it then saves up for a jet or a strike, and for how long. */
const SAVE_CHANCE = 0.3;
const SAVE_TIME = 25;

/** What a unit is worth hitting (our own units score nothing for the player, so use the base def). */
function worth(u: Unit): number {
	return Math.max(10, UNITS[u.def.kind].score);
}

/** How juicy a cluster must be (summed score) to be worth each strike. */
function weightFor(id: CommandId): number {
	if (id === 'nuke') return 1800;
	return id === 'ballistic' ? 600 : id === 'carpet' ? 450 : id === 'cruise' ? 150 : 200;
}
