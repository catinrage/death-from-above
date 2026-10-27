import { clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { WORLD } from './constants';
import { BOMBS } from './defs-bombs';
import type { PilotInput, Player } from './player';
import type { BombId } from './types';
import { predictImpact } from './weapons';
import type { World } from './world';

/** Flies the title-screen demo: patrols, strafes and bombs whatever it finds. */
export class Autopilot {
	private dir = 1;
	private homing = false;
	private altitude = 85;
	private retarget = 0;
	private bombHold = 0;
	private readonly input: PilotInput = {
		steerX: 1,
		steerY: 0,
		boost: false,
		brake: false,
		fire: false,
		bomb: false,
		bombPressed: false,
		flare: false,
		cycle: 0,
		select: null,
		missiles: null,
		designate: null
	};

	update(w: World, p: Player, dt: number): PilotInput {
		const inp = this.input;
		const g = w.surface.clearance(p.x);
		const hurt = p.hp < p.def.hp * 0.45 || p.ammo.gp === 0;
		if (hurt && !this.homing) this.homing = true;
		if (this.homing && p.hp > p.def.hp * 0.95 && p.ammo.gp >= p.capacity('gp') - 1)
			this.homing = false;
		if (this.homing) {
			// Racetrack over the runway: only turn around once past either end.
			if (p.x > WORLD.runwayMaxX - 10) this.dir = -1;
			else if (p.x < WORLD.runwayMinX + 10) this.dir = 1;
		} else {
			if (p.x > WORLD.arenaMaxX - 260) this.dir = -1;
			if (p.x < WORLD.baseMaxX + 120) this.dir = 1;
		}
		this.retarget -= dt;
		if (this.retarget <= 0) {
			this.retarget = rnd.range(3, 7);
			this.altitude = rnd.range(60, 120);
		}
		const overRunway = p.x > WORLD.runwayMinX && p.x < WORLD.runwayMaxX;
		const wantAlt = this.homing && overRunway ? 26 : this.altitude + Math.sin(w.time * 1.3) * 12;
		// Look ahead for rising ground.
		const ahead = Math.max(
			g,
			w.surface.clearance(p.x + p.vx * 1.5),
			w.surface.clearance(p.x + p.vx * 3)
		);
		const alt = p.y - ahead;
		const dive = this.homing ? (alt > 70 ? -0.6 : -0.22) : -0.5;
		const climb = clamp((wantAlt - alt) / 60, dive, 0.75);
		inp.steerX = this.dir;
		inp.steerY = climb;
		inp.boost = Math.abs(p.vx) < p.def.cruise * 0.8;

		const hit = predictImpact(w, p.x, p.y - 1, p.vx, p.vy, BOMBS.gp.drag, null);
		let infantry = 0,
			armor = 0;
		for (const u of w.units) {
			if (!u.alive || Math.abs(u.x - hit.x) > u.def.half[0] + 7) continue;
			if (u.def.category === 'infantry') infantry++;
			else armor++;
		}
		this.bombHold -= dt;
		inp.bombPressed = false;
		inp.select = null;
		if ((infantry > 1 || armor > 0) && this.bombHold <= 0) {
			const wish: BombId[] = armor > 0 ? ['guided', 'gp'] : ['cluster', 'napalm', 'gp'];
			const options = wish.filter((id) => p.ammo[id] > 0);
			inp.select = options.length > 0 ? rnd.pick(options) : 'gp';
			inp.bombPressed = true;
			this.bombHold = rnd.range(0.5, 1.4);
		}
		let fire = false;
		const ca = Math.cos(p.angle),
			sa = Math.sin(p.angle);
		for (const u of w.units) {
			if (!u.alive) continue;
			const dx = u.x - p.x,
				dy = u.y + 1 - p.y;
			const d = Math.hypot(dx, dy);
			if (d < 420 && (dx * ca + dy * sa) / d > 0.985) fire = true;
		}
		for (const a of w.air) {
			if (!a.alive) continue;
			const dx = a.x - p.x,
				dy = a.y - p.y;
			const d = Math.hypot(dx, dy);
			if (d < 500 && (dx * ca + dy * sa) / d > 0.97) fire = true;
		}
		inp.fire = fire && !p.overheated;
		inp.flare = p.lockedBy > 0 && rnd.chance(dt * 1.5);
		return inp;
	}
}
