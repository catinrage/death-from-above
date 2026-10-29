import { fx as rnd } from '../engine/rng';
import { COMMANDS, type CommandId } from './command';
import type { World } from './world';

/**
 * A simple stand-in commander for autoplay and balance tests: it keeps a mix
 * of troops and armour moving, puts a couple of jets up, and drops strikes on
 * the biggest enemy cluster near the front.
 */
export class CommandAutopilot {
	private clock = 0;

	update(w: World, dt: number): void {
		const c = w.command;
		if (!c.active) return;
		this.clock -= dt;
		if (this.clock > 0) return;
		this.clock = 0.5;
		const target = this.cluster(w);
		if (target) {
			for (const id of ['ballistic', 'carpet', 'cruise', 'barrage'] as CommandId[]) {
				// Strikes only when the war chest can spare them, never on top of our own troops.
				if (c.funds < COMMANDS[id].cost + 250) continue;
				if (w.allies.list.some((u) => u.alive && Math.abs(u.x - target.x) < 60)) break;
				if (target.weight >= weightFor(id) && !c.order(w, id, target.x)) return;
			}
		}
		if (c.airborne(w) < 2 && c.funds > 700) {
			c.order(w, rnd.chance(0.5) ? 'fighter' : 'striker');
			return;
		}
		const pick = rnd.pick<CommandId>([
			'rifles',
			'rifles',
			'antiTank',
			'mortars',
			'jeep',
			'lightTank',
			'tank',
			'tank',
			'aa',
			'rockets'
		]);
		c.order(w, pick);
	}

	/** The densest bunch of enemy ground units within reach of the front, by score. */
	private cluster(w: World): { x: number; weight: number } | null {
		const front = w.command.front(w);
		let best: { x: number; weight: number } | null = null;
		for (const u of w.units) {
			if (!u.alive || u.def.isStatic || Math.abs(u.x - front) > 700) continue;
			let weight = 0;
			for (const o of w.units)
				if (o.alive && Math.abs(o.x - u.x) < 40) weight += Math.max(10, o.def.score);
			if (!best || weight > best.weight) best = { x: u.x, weight };
		}
		return best;
	}
}

/** How juicy a cluster must be (summed score) to be worth each strike. */
function weightFor(id: CommandId): number {
	return id === 'ballistic' ? 600 : id === 'carpet' ? 450 : id === 'cruise' ? 150 : 200;
}
