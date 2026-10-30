import { angleDiff, clamp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode, inBattlePlane } from './combat';
import { WORLD } from './constants';
import type { BlastSpec } from './defs-bombs';
import { UNITS } from './defs-units';
import type { Owner, Unit } from './types';
import type { AirAlly } from './wingman';
import type { World } from './world';

/**
 * One-way attack drones either commander sends at the other side: swarms of
 * small FPV quadcopters that skim the ground and fly into a vehicle, and
 * heavier delta wings that cruise high and dive onto whatever is worth the
 * warhead. The other side's guns and missiles go after them like any aircraft.
 */

export type DroneKind = 'fpv' | 'delta';

interface DroneSpec {
	hp: number;
	/** Cruise and dive speed. */
	speed: number;
	diveSpeed: number;
	/** Height it cruises at above the ground. */
	alt: number;
	/** Turn rate in radians per second. */
	turn: number;
	/** How far out from the target it tips over into the dive. */
	dive: number;
	/** Seconds of battery or fuel; after that it goes for the nearest thing it can reach. */
	life: number;
	heat: number;
	radius: number;
	blast: BlastSpec;
	/** How much it prefers armour (>1) or big targets by score. */
	armour: number;
}

export const DRONE_SPECS: Record<DroneKind, DroneSpec> = {
	fpv: {
		hp: 5,
		speed: 58,
		diveSpeed: 80,
		alt: 26,
		turn: 4,
		dive: 70,
		life: 75,
		heat: 0.5,
		radius: 1.3,
		blast: { radius: 6, damage: 170, pierce: 0.85, crater: [1.6, 0.5], size: 0.55, shake: 0.08 },
		armour: 2.2
	},
	delta: {
		hp: 16,
		speed: 52,
		diveSpeed: 120,
		alt: 150,
		turn: 1.5,
		dive: 210,
		life: 160,
		heat: 1.1,
		radius: 2.6,
		blast: { radius: 14, damage: 320, pierce: 0.7, crater: [3.6, 1.1], size: 1.05, shake: 0.25 },
		armour: 1.2
	}
};

/** How far from its patrol line a drone looks for prey. */
const HUNT = 650;
/** Seconds between looks for a better target while still cruising. */
const RESCAN = 0.6;
/** Holds off a target with this many of our own troops this close to it. */
const DANGER_CLOSE = 12;

export class Drone implements AirAlly {
	readonly kind: DroneKind;
	readonly spec: DroneSpec;
	x: number;
	y: number;
	z: number;
	vx = 0;
	vy = 0;
	angle = 0.3;
	hp: number;
	alive = true;
	readonly landed = false;
	readonly radius: number;
	readonly heat: number;
	/** Where along the road it hunts (the front, kept fresh by the commander). */
	patrol: number;
	target: Unit | null = null;
	diving = false;
	age = 0;
	/** Spins the rotors or prop. */
	spin = 0;
	private scan = 0;
	private speed: number;
	/** Loitering with nothing to hit: which way it is running along the front. */
	private dir: number;

	constructor(
		kind: DroneKind,
		x: number,
		y: number,
		z: number,
		patrol: number,
		readonly side: Owner = 'player'
	) {
		this.kind = kind;
		this.dir = side === 'player' ? 1 : -1;
		if (side === 'enemy') this.angle = Math.PI - 0.3;
		this.spec = DRONE_SPECS[kind];
		this.x = x;
		this.y = y;
		this.z = z;
		this.hp = this.spec.hp;
		this.radius = this.spec.radius;
		this.heat = this.spec.heat;
		this.patrol = patrol;
		this.speed = this.spec.speed * 0.6;
		this.scan = rnd.range(0, RESCAN);
	}

	get active(): boolean {
		return this.alive;
	}

	/** Shot down: it pops in the air without its warhead going off on anything. */
	hit(w: World, amount: number): void {
		if (!this.alive || w.godMode) return;
		this.hp -= amount;
		if (this.hp > 0) return;
		this.alive = false;
		w.fx.explosion(this.x, this.y, this.z, this.kind === 'fpv' ? 0.25 : 0.45, false);
		w.sound.boom(0.3, this.x, this.y, true);
	}

	update(w: World, dt: number): void {
		if (!this.alive) return;
		this.age += dt;
		this.spin += dt * (this.kind === 'fpv' ? 90 : 50);
		if (this.target && !this.target.alive) {
			this.target = null;
			this.scan = 0;
		}
		this.scan -= dt;
		if (!this.diving && this.scan <= 0) {
			this.scan = RESCAN;
			this.target = this.pick(w);
		}
		const s = this.spec;
		// Looks a moment ahead so a rise in the ground doesn't catch it out.
		const ground = Math.max(
			w.surface.clearance(this.x),
			w.surface.clearance(this.x + this.vx * 0.8)
		);
		let want: number;
		const t = this.target;
		if (t) {
			const ty = t.y + t.def.half[1];
			const dx = t.x - this.x;
			if (!this.diving && Math.abs(dx) < s.dive && dx * Math.cos(this.angle) > 0)
				this.diving = true;
			// Out of battery: it has to commit to whatever it is chasing.
			if (this.age > s.life) this.diving = true;
			if (this.diving) {
				const lead = Math.hypot(dx, ty - this.y) / s.diveSpeed;
				want = Math.atan2(ty - this.y, t.x + t.speed * t.dir * lead - this.x);
				this.speed = moveToward(this.speed, s.diveSpeed, 60 * dt);
			} else {
				// Run in at cruise height, a little short of the target.
				const gy = Math.max(ground, w.ground(t.x)) + s.alt;
				want = Math.atan2(clamp(gy - this.y, -30, 30), Math.sign(dx) * 60);
				this.speed = moveToward(this.speed, s.speed, 30 * dt);
			}
		} else {
			if (this.age > s.life) {
				// Battery gone with nothing to hit: it glides down where it is.
				want = Math.cos(this.angle) >= 0 ? -0.9 : Math.PI + 0.9;
			} else {
				// Nothing to hit yet: run up and down the front at cruise height.
				if (this.x > this.patrol + 140) this.dir = -1;
				else if (this.x < this.patrol - 140) this.dir = 1;
				want = Math.atan2(clamp(ground + s.alt - this.y, -30, 30), this.dir * 60);
			}
			this.speed = moveToward(this.speed, s.speed, 30 * dt);
		}
		// Only the dive is allowed to bring it down to the ground.
		const floor = this.diving ? 0 : 8;
		if (this.y - ground < floor) want = Math.cos(this.angle) >= 0 ? 0.7 : Math.PI - 0.7;
		if (this.x < WORLD.arenaMinX + 40) want = 0.2;
		if (this.x > WORLD.arenaMaxX + 40) want = Math.PI - 0.2;
		// Turning back the way it came: over the top, never down into the ground.
		const reversing = Math.cos(this.angle) * Math.cos(want) < 0;
		if (!this.diving && reversing && Math.sin(this.angle) < 0.9) want = Math.PI / 2;
		const turn = s.turn * (this.diving ? 1.6 : 1);
		this.angle = wrapAngle(this.angle + clamp(angleDiff(this.angle, want), -turn * dt, turn * dt));
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.kind === 'delta' && rnd.chance(dt * 20))
			w.fx.trail(this.x - this.vx * 0.03, this.y - this.vy * 0.03, this.z, 0.5, 0.6, 0.6, 1, 0.15);
		this.strike(w);
	}

	/** Goes off on contact with the target, or with the ground once it is diving. */
	private strike(w: World): void {
		const t = this.target;
		const g = w.surface.clearance(this.x);
		let hit = this.y <= g + 0.4;
		if (t && !hit) {
			const near = Math.abs(t.x - this.x) < t.def.half[0] + 1.2;
			hit = near && this.y < t.y + t.def.half[1] * 2 + 1;
		}
		if (!hit) return;
		this.alive = false;
		explode(w, this.x, Math.max(this.y, g), this.z * 0.2, this.spec.blast, this.side);
	}

	/**
	 * The best thing near the front for this drone: vehicles for the FPVs,
	 * anything valuable for the deltas. Swarms spread across targets instead of
	 * all diving on one, and none go for a foe tangled up with its own side's troops.
	 */
	private pick(w: World): Unit | null {
		const s = this.spec;
		const ours = this.side === 'player';
		const foes = ours ? w.units : w.allies.list;
		const friends = ours ? w.allies.list : w.units;
		let best: Unit | null = null;
		let bestScore = 0;
		for (const u of foes) {
			if (!u.alive || !inBattlePlane(u) || u.def.kind === 'cruiser') continue;
			if (!w.vision.seen(this.side, u)) continue;
			if (Math.abs(u.x - this.patrol) > HUNT) continue;
			// Never back over its own base.
			if (ours ? u.x < WORLD.baseMaxX : u.x > WORLD.hqMinX) continue;
			const armour = u.def.category !== 'infantry';
			// Our own units score nothing in their defs, so go by what the enemy's version is worth.
			let value = Math.max(20, UNITS[u.def.kind].score) * (armour ? s.armour : 1);
			let claimed = 0;
			for (const d of w.drones) if (d !== this && d.alive && d.target === u) claimed++;
			value /= 1 + claimed * (u.def.hp > s.blast.damage ? 0.5 : 2);
			if (friends.some((a) => a.alive && Math.abs(a.x - u.x) < s.blast.radius + DANGER_CLOSE))
				continue;
			const score = value / (1 + Math.abs(u.x - this.x) / 300);
			if (score > bestScore) {
				bestScore = score;
				best = u;
			}
		}
		return best;
	}
}

export function updateDrones(w: World, dt: number): void {
	for (let i = w.drones.length - 1; i >= 0; i--) {
		const d = w.drones[i];
		d.update(w, dt);
		if (!d.alive) w.drones.splice(i, 1);
	}
}
