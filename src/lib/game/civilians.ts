import { damp, dampAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { MeshName } from '../models';
import type { DamageCause } from './combat';
import { segmentVsUnit } from './combat';
import { ragdoll } from './deaths';
import { UNITS } from './defs-units';
import {
	CIVILIAN_PENALTY,
	HOSPITAL_PENALTY,
	HOUSE_PENALTY,
	NO_FIRE_ZONES,
	zoneAt,
	type NoFireZone
} from './no-fire';
import { Props, type Prop } from './props';
import type { Owner, PartSpec, Unit, UnitDef } from './types';
import type { World } from './world';

/** A villager: walks about between the houses and runs for cover when the bombs fall. */
export type Civilian = Unit & {
	zone: NoFireZone;
	/** The house they shelter in; null once it has been knocked down. */
	home: Prop | null;
	/** Where they are walking to. */
	tx: number;
	tz: number;
	/** Pause before picking the next stroll. */
	idle: number;
	/** Indoors: out of sight and safe unless the house comes down. */
	sheltered: boolean;
	/** Quiet seconds needed before they come back out. */
	calm: number;
	/** Danger they are running from when there is no house to hide in. */
	fleeX: number;
	/** Running for cover; lasts until they are indoors or the scare wears off with no house left. */
	fleeing: boolean;
};

const civParts = (body: MeshName): PartSpec[] => [
	{ mesh: body, at: [0, 0, 0] },
	{ mesh: 'civLeg', at: [0, 0.95, 0.12], drive: 'legL' },
	{ mesh: 'civLeg', at: [0, 0.95, -0.12], drive: 'legR' },
	{ mesh: 'civArm', at: [0.02, 1.46, 0.26], drive: 'armL' },
	{ mesh: 'civArm', at: [0.02, 1.46, -0.26], drive: 'armR' }
];

const BODIES: MeshName[] = ['civBody0', 'civBody1', 'civBody2'];
export const CIVILIAN_DEFS: readonly UnitDef[] = BODIES.map((body) => ({
	...UNITS.rifleman,
	name: 'Civilian',
	hp: 10,
	speed: 3.8,
	score: 0,
	weapon: null,
	range: 0,
	siege: 0,
	parts: civParts(body)
}));

const WALK = 1.1;
/** Strip between the road and the houses where villagers walk. */
const Z_NEAR = -4.8;
const Z_FAR = -12;
/** How far a blast or burst of fire is heard, as a multiple of its radius. */
const ALARM_REACH = 6;
/** Seconds before an emptied village sends someone back out. */
const RETURN_TIME = 35;
const GAS_DPS = 26;

/** The people living in the no-fire zones. */
export class Civilians {
	readonly list: Civilian[] = [];
	/** Civilians the player has killed since the last populate. */
	killed = 0;
	private readonly refill = new Map<NoFireZone, number>();

	constructor(readonly zones: readonly NoFireZone[] = NO_FIRE_ZONES) {}

	/** Fills every zone with its full population. */
	populate(w: World): void {
		this.list.length = 0;
		this.killed = 0;
		this.refill.clear();
		for (const zone of this.zones) {
			for (let i = 0; i < zone.population; i++) this.spawn(w, zone);
		}
	}

	/** Standing houses inside a zone. */
	homes(w: World, zone: NoFireZone): Prop[] {
		const near = w.props.near;
		const out: Prop[] = [];
		for (
			let i = Props.lowerBound(near, zone.x - zone.half);
			i < near.length && near[i].x <= zone.x + zone.half;
			i++
		) {
			const p = near[i];
			if (p.kind === 'house' && !p.ruined) out.push(p);
		}
		return out;
	}

	private spawn(w: World, zone: NoFireZone): Civilian | null {
		const homes = this.homes(w, zone);
		const home = homes.length > 0 ? rnd.pick(homes) : null;
		const x = home ? home.x + rnd.range(-4, 4) : zone.x + rnd.range(-zone.half, zone.half) * 0.8;
		const z = rnd.range(Z_FAR, Z_NEAR);
		const c = w.makeUnit('rifleman', x, z, rnd.chance(0.5) ? 1 : -1) as Civilian;
		c.def = CIVILIAN_DEFS[c.id % CIVILIAN_DEFS.length];
		c.hp = c.def.hp;
		c.zone = zone;
		c.home = home;
		c.tx = x;
		c.tz = z;
		c.idle = rnd.range(0, 4);
		c.sheltered = false;
		c.calm = 0;
		c.fleeX = x;
		c.fleeing = false;
		this.list.push(c);
		return c;
	}

	/** Alive civilians standing outside (the ones that can be seen and hit). */
	outdoors(): Civilian[] {
		return this.list.filter((c) => c.alive && !c.sheltered);
	}

	/** Scares everyone within `reach` of (x, z): they run for cover. */
	alarm(x: number, z: number, reach: number): void {
		for (const c of this.list) {
			if (!c.alive || Math.abs(c.x - x) > reach || Math.abs(c.z - z) > reach) continue;
			c.panic = Math.max(c.panic, 6);
			c.fleeX = x;
			c.fleeing = !c.sheltered;
			if (c.sheltered) c.calm = Math.max(c.calm, rnd.range(6, 10));
		}
	}

	/** Explosion damage to civilians in the open. */
	blast(
		w: World,
		x: number,
		y: number,
		z: number,
		radius: number,
		damage: number,
		by: Owner
	): void {
		if (radius <= 0) return;
		for (const c of this.list) {
			if (!c.alive || c.sheltered || Math.abs(c.x - x) > radius + 1) continue;
			const d = Math.hypot(c.x - x, (c.y + 0.9 - y) * 0.8, (c.z - z) * 0.6);
			if (d >= radius) continue;
			const k = 1 - d / radius;
			c.hp -= damage * (0.15 + 0.85 * k * k);
			c.flash = 1;
			if (c.hp <= 0) this.kill(w, c, x, 'blast', by);
		}
		this.alarm(x, z, radius * ALARM_REACH);
	}

	/** Player gunfire striking a civilian. Returns true if the round was stopped. */
	bulletHit(w: World, x0: number, y0: number, x1: number, y1: number, damage: number): boolean {
		for (const c of this.list) {
			if (!c.alive || c.sheltered || Math.abs(c.x - x1) > 30) continue;
			if (segmentVsUnit(c, x0, y0, x1, y1, 0.15) < 0) continue;
			c.hp -= damage;
			c.flash = 1;
			w.fx.impact(c.x, c.y + 1, c.z, 'soft');
			if (c.hp <= 0) this.kill(w, c, x0, 'bullet', 'player');
			this.alarm(c.x, c.z, 80);
			return true;
		}
		return false;
	}

	/**
	 * A house came down. Anyone sheltering in it dies, and knocking down a home
	 * inside a no-fire zone costs the player score.
	 */
	houseCollapsed(w: World, house: Prop, by: Owner): void {
		for (const c of this.list) {
			if (c.home !== house) continue;
			c.home = null;
			if (c.alive && c.sheltered) this.kill(w, c, house.x, 'blast', by);
		}
		const zone = zoneAt(house.x, this.zones);
		if (!zone || by !== 'player') return;
		const hospital = house.baseMesh === 'hospital';
		w.events.penalty(
			hospital ? 'Hospital destroyed' : 'Home destroyed',
			hospital ? HOSPITAL_PENALTY : HOUSE_PENALTY,
			house.x,
			house.y + 8
		);
	}

	private kill(w: World, c: Civilian, fromX: number, cause: DamageCause, by: Owner): void {
		if (!c.alive) return;
		c.alive = false;
		c.hp = 0;
		c.speed = 0;
		if (c.sheltered) c.remove = true;
		else ragdoll(w, c, Math.sign(c.x - fromX) || 1, cause);
		if (by !== 'player') return;
		this.killed++;
		w.events.penalty('Civilian killed', CIVILIAN_PENALTY, c.x, c.y + 3);
	}

	update(w: World, dt: number): void {
		this.hazards(w, dt);
		for (let i = this.list.length - 1; i >= 0; i--) {
			const c = this.list[i];
			if (c.remove || !c.alive) {
				this.list.splice(i, 1);
				continue;
			}
			c.flash = Math.max(0, c.flash - dt * 4);
			c.panic = Math.max(0, c.panic - dt);
			if (c.sheltered) this.indoors(c, dt);
			else this.move(w, c, dt);
		}
		this.repopulate(w, dt);
	}

	/** Napalm pools and gas clouds: both count as the player's doing. */
	private hazards(w: World, dt: number): void {
		for (const f of w.fires.list) {
			if (f.dps <= 0) continue;
			for (const c of this.list) {
				if (!c.alive || c.sheltered) continue;
				if (Math.abs(c.x - f.x) > f.radius + 0.5 || Math.abs(c.z - f.z) > f.radius + 4) continue;
				c.hp -= f.dps * dt;
				c.char = Math.min(0.8, c.char + dt * 0.3);
				c.panic = 6;
				c.fleeX = f.x;
				c.fleeing = true;
				if (c.hp <= 0) this.kill(w, c, f.x, 'fire', 'player');
			}
		}
		for (const g of w.gas.list) {
			const k = w.gas.density(g);
			for (const c of this.list) {
				if (!c.alive || Math.abs(c.x - g.x) > g.radius || Math.abs(c.z - g.z) > g.radius) continue;
				// Houses don't keep the gas out.
				c.hp -= GAS_DPS * k * dt;
				c.panic = 6;
				c.fleeX = g.x;
				c.fleeing = !c.sheltered;
				if (c.hp <= 0) this.kill(w, c, g.x, 'fire', 'player');
			}
		}
	}

	private indoors(c: Civilian, dt: number): void {
		if (c.panic > 0) return;
		c.calm -= dt;
		if (c.calm > 0) return;
		c.sheltered = false;
		c.idle = rnd.range(1, 3);
	}

	private move(w: World, c: Civilian, dt: number): void {
		const z = c.zone;
		let speed = WALK;
		const shelter = c.home && !c.home.ruined ? c.home : null;
		if (!shelter && c.panic <= 0) c.fleeing = false;
		if (c.fleeing) {
			speed = c.def.speed;
			if (shelter) {
				c.tx = shelter.x;
				c.tz = shelter.z + 3;
			} else {
				// Nowhere to hide: run away from the danger, but stay in the village.
				const away = Math.sign(c.x - c.fleeX) || 1;
				c.tx = Math.max(z.x - z.half, Math.min(z.x + z.half, c.x + away * 20));
				c.tz = Z_NEAR - 1;
			}
		} else if (c.idle > 0) {
			c.idle -= dt;
			speed = 0;
		}
		const dx = c.tx - c.x,
			dz = c.tz - c.z;
		const dist = Math.hypot(dx, dz);
		if (dist < 0.6) {
			if (c.fleeing && shelter) {
				c.fleeing = false;
				c.sheltered = true;
				c.calm = rnd.range(6, 10);
				c.speed = 0;
				return;
			}
			if (!c.fleeing && c.idle <= 0) this.stroll(w, c);
			speed = 0;
		}
		c.speed = damp(c.speed, speed, 5, dt);
		if (dist > 1e-3) {
			const step = Math.min(dist, c.speed * dt);
			c.x += (dx / dist) * step;
			c.z += (dz / dist) * step;
			c.yaw = dampAngle(c.yaw, Math.atan2(-dz, dx), 6, dt);
			c.dir = dx >= 0 ? 1 : -1;
		}
		c.y = w.surface.support(c.x, c.y + 1, c.z);
		c.anim += (c.speed * dt) / 0.3;
	}

	/** Picks somewhere new to wander to, near home. */
	private stroll(w: World, c: Civilian): void {
		const z = c.zone;
		const around = c.home && !c.home.ruined ? c.home.x : c.x;
		c.tx = Math.max(z.x - z.half, Math.min(z.x + z.half, around + rnd.range(-14, 14)));
		c.tz = rnd.range(Z_FAR, Z_NEAR);
		c.idle = rnd.range(2, 7);
		if (!c.home || c.home.ruined) {
			const homes = this.homes(w, z);
			c.home = homes.length > 0 ? rnd.pick(homes) : null;
		}
	}

	/** People drift back into a village that has lost some of its own. */
	private repopulate(w: World, dt: number): void {
		for (const zone of this.zones) {
			let n = 0;
			for (const c of this.list) if (c.zone === zone) n++;
			if (n >= zone.population) {
				this.refill.delete(zone);
				continue;
			}
			const t = (this.refill.get(zone) ?? RETURN_TIME) - dt;
			if (t > 0) {
				this.refill.set(zone, t);
				continue;
			}
			this.refill.set(zone, RETURN_TIME);
			if (this.homes(w, zone).length > 0) this.spawn(w, zone);
		}
	}

	clear(): void {
		this.list.length = 0;
		this.refill.clear();
	}
}
