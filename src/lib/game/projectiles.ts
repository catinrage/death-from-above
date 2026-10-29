import { angleDiff, clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { damageUnit, explode, inBattlePlane, segmentVsCircle, segmentVsUnit } from './combat';
import { homeOnEmitter } from './arm';
import { WORLD } from './constants';
import { BOMBS, type BlastSpec } from './defs-bombs';
import type { Player } from './player';
import type { AirUnit } from './enemy-air';
import type { AirAlly } from './wingman';
import type { Owner, Trackable, Unit } from './types';
import { flareEmit, flareHeat } from './flare-fx';
import { ALLY_BULLET_K } from './allies';
import type { World } from './world';

export interface Bullet {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	life: number;
	damage: number;
	pierce: number;
	owner: Owner;
	tracer: boolean;
	color: [number, number, number];
	size: number;
	explosive: number;
	/**
	 * Ground-to-ground fire: the x it was aimed at. The battle line is a
	 * cross-section of a wider valley, so rounds skim the humps in between and
	 * only meet the ground near their target.
	 */
	aimX?: number;
	/** Fired from the player's aircraft: friendly fire, so it strikes our own troops too. */
	aircraft?: boolean;
}

/** How far short of its aim point a ground-to-ground round can strike the ground. */
const SKIM = 20;

function skimming(x: number, vx: number, aimX: number | undefined): boolean {
	return aimX !== undefined && (aimX - x) * Math.sign(vx) > SKIM;
}

/** 'ffar' is the player's unguided air-to-ground rocket. */
export type ShellKind = 'flak' | 'tank' | 'artillery' | 'rocket' | 'ffar';

export interface Shell {
	kind: ShellKind;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	age: number;
	fuse: number;
	damage: number;
	radius: number;
	owner: Owner;
	trail: number;
	/** Ground-to-ground fire: the x it was aimed at (see Bullet.aimX). */
	aimX?: number;
	/** Enemy fire: what a direct hit does to a friendly unit, and how much armour it defeats. */
	punch?: number;
	pierce?: number;
}

export interface Missile extends Trackable {
	/** 'agm' is the player's guided air-to-ground missile, 'arm' its anti-radiation missile. */
	kind: 'sam' | 'manpads' | 'air' | 'agm' | 'arm';
	angle: number;
	speed: number;
	maxSpeed: number;
	accel: number;
	turnRate: number;
	target: Trackable | null;
	age: number;
	burn: number;
	life: number;
	damage: number;
	owner: Owner;
	seeker: 'radar' | 'heat';
	trail: number;
	/** Warhead for missiles that blow up what they hit (the player's); others damage directly. */
	blast?: BlastSpec;
	/** The seeker's smoothed idea of where its target is heading (lags a sudden break). */
	trackVx: number;
	trackVy: number;
	/** Anti-radiation missiles: the radar they are riding (null once it goes dark). */
	emitter?: Unit | null;
}

export interface Flare extends Trackable {
	age: number;
	life: number;
	/** Sideways drift toward or away from the camera (the fan of a salvo). */
	vz: number;
}

const SMALL_BLAST: BlastSpec = {
	radius: 5,
	damage: 18,
	pierce: 0.35,
	crater: [1.6, 0.4],
	size: 0.3,
	shake: 0.05
};
const SHELL_BLAST: BlastSpec = {
	radius: 7,
	damage: 22,
	pierce: 0.4,
	crater: [2.4, 0.7],
	size: 0.5,
	shake: 0.1
};
const MISSILE_BLAST: BlastSpec = {
	radius: 8,
	damage: 0,
	pierce: 0.5,
	crater: [2.5, 0.6],
	size: 0.6,
	shake: 0.15
};

export function spawnBullet(w: World, b: Bullet): void {
	if (w.bullets.length > 900) w.bullets.shift();
	w.bullets.push(b);
}

export function launchMissile(
	w: World,
	m: Omit<
		Missile,
		'age' | 'trail' | 'alive' | 'z' | 'heat' | 'vx' | 'vy' | 'trackVx' | 'trackVy'
	> & {
		z?: number;
	}
): Missile {
	const missile: Missile = {
		...m,
		z: m.z ?? 0,
		trackVx: m.target?.vx ?? 0,
		trackVy: m.target?.vy ?? 0,
		vx: Math.cos(m.angle) * m.speed,
		vy: Math.sin(m.angle) * m.speed,
		age: 0,
		trail: 0,
		alive: true,
		heat: 2
	};
	w.missiles.push(missile);
	w.sound.play('missileLaunch', m.x, m.y, 1);
	return missile;
}

export function updateProjectiles(w: World, dt: number): void {
	updateBullets(w, dt);
	updateShells(w, dt);
	updateMissiles(w, dt);
	updateFlares(w, dt);
}

function bulletHitsPlayerSide(w: World, b: Bullet, x0: number, y0: number): boolean {
	let best = 2;
	let unit: Unit | null = null;
	for (const u of w.units) {
		if (!u.alive || Math.abs(u.x - b.x) > 30 || !inBattlePlane(u)) continue;
		const t = segmentVsUnit(u, x0, y0, b.x, b.y, 0.25);
		if (t >= 0 && t < best) {
			best = t;
			unit = u;
		}
	}
	let airHit = null;
	for (const a of w.air) {
		if (!a.alive) continue;
		const t = segmentVsCircle(x0, y0, b.x, b.y, a.x, a.y, a.radius);
		if (t >= 0 && t < best) {
			best = t;
			airHit = a;
			unit = null;
		}
	}
	let droneHit = null;
	for (const d of w.drones) {
		if (!d.alive || d.side !== 'enemy') continue;
		const t = segmentVsCircle(x0, y0, b.x, b.y, d.x, d.y, d.radius + 0.6);
		if (t >= 0 && t < best) {
			best = t;
			droneHit = d;
			airHit = null;
			unit = null;
		}
	}
	for (const m of w.missiles) {
		if (m.owner === 'player' || !m.alive) continue;
		if (segmentVsCircle(x0, y0, b.x, b.y, m.x, m.y, 2.2) >= 0) {
			m.age = m.life;
			w.events.kill('Missile', 25, m.x, m.y, 'player');
			return true;
		}
	}
	// Friendly fire: our own column is in the way of the player's guns too.
	const ally = b.aircraft ? w.allies.firstHit(x0, y0, b.x, b.y, 0.25) : null;
	if (ally && ally.t < best) {
		best = ally.t;
		unit = null;
		airHit = null;
		droneHit = null;
	}
	if (best > 1) {
		if (b.aircraft && w.troops.bulletHit(x0, y0, b.x, b.y, b.damage)) {
			w.fx.impact(b.x, b.y, b.z, 'soft');
			return true;
		}
		return w.civilians.bulletHit(w, x0, y0, b.x, b.y, b.damage);
	}
	const hx = x0 + (b.x - x0) * best,
		hy = y0 + (b.y - y0) * best;
	if (droneHit) {
		droneHit.hit(w, b.damage);
		w.fx.impact(hx, hy, droneHit.z, 'metal');
	} else if (ally && !unit && !airHit) {
		w.allies.hit(ally.unit, b.damage, b.pierce, true);
		w.fx.impact(hx, hy, ally.unit.z, ally.unit.def.category === 'infantry' ? 'soft' : 'metal');
	} else if (unit) {
		const soft = unit.def.category === 'infantry';
		damageUnit(w, unit, b.damage, b.pierce, 'player', x0, 'bullet');
		w.fx.impact(hx, hy, unit.z, soft ? 'soft' : 'metal', b.explosive > 0);
		if (!soft && rnd.chance(0.3)) w.sound.play('impactMetal', hx, hy, 0.35);
	} else if (airHit) {
		airHit.damage(w, b.damage, 'player');
		w.fx.impact(hx, hy, airHit.z, 'metal');
	}
	if (b.explosive > 0) {
		w.fx.airburst(hx, hy, unit?.z ?? 0, 0.35);
		for (const u of w.units) {
			if (u !== unit && u.alive && Math.abs(u.x - hx) < b.explosive + u.def.half[0]) {
				damageUnit(w, u, b.damage * 0.4, b.pierce, 'player', hx, 'blast');
			}
		}
		w.civilians.blast(w, hx, hy, unit?.z ?? 0, b.explosive, b.damage * 0.4, 'player');
		if (b.aircraft) w.allies.blast(hx, hy, b.explosive, b.damage * 0.4, b.pierce, true);
	}
	return true;
}

function updateBullets(w: World, dt: number): void {
	const pilots = w.pilots();
	const jets = w.jets();
	for (let i = w.bullets.length - 1; i >= 0; i--) {
		const b = w.bullets[i];
		const x0 = b.x,
			y0 = b.y;
		b.vy -= 4 * dt;
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		b.life -= dt;
		let dead = b.life <= 0;
		if (!dead) {
			if (b.owner === 'player') {
				dead = bulletHitsPlayerSide(w, b, x0, y0);
			} else if (w.troops.bulletHit(x0, y0, b.x, b.y, b.damage)) {
				w.fx.impact(b.x, b.y, b.z, 'soft');
				dead = true;
			} else if (w.allies.bulletHit(x0, y0, b.x, b.y, b.damage * ALLY_BULLET_K)) {
				w.fx.impact(b.x, b.y, b.z, 'metal');
				dead = true;
			} else {
				for (const p of pilots) {
					if (!p.alive) continue;
					if (segmentVsCircle(x0, y0, b.x, b.y, p.x, p.y, p.def.radius * 0.6) < 0) continue;
					p.hit(b.damage, w, x0, y0, false, `bullet:${b.size}`);
					w.fx.impact(p.x, p.y, 0, 'metal');
					dead = true;
					break;
				}
				for (const wing of jets) {
					if (dead || !wing.active) continue;
					if (segmentVsCircle(x0, y0, b.x, b.y, wing.x, wing.y, wing.radius) < 0) continue;
					wing.hit(w, b.damage);
					w.fx.impact(wing.x, wing.y, 0, 'metal');
					dead = true;
				}
			}
		}
		if (!dead) {
			const g = w.surface.under(b.x, y0, b.z);
			const kind = w.surface.kind;
			if (b.y < g && !skimming(b.x, b.vx, b.aimX)) {
				if (kind === 'water') w.fx.water.spout(b.x, g, b.z);
				else w.fx.impact(b.x, g, b.z, kind === 'deck' ? 'metal' : 'ground', b.explosive > 0);
				if (kind === 'deck') {
					const span = w.bridge?.spanAt(b.x);
					if (span) w.bridge?.damage(w, span, b.damage * (b.explosive > 0 ? 0.35 : 0.04), b.owner);
				}
				if (b.explosive > 0) {
					if (kind === 'ground') w.terrain.crater(b.x, 0, 1.2, 0.25, 0.6);
					for (const u of w.units) {
						if (u.alive && Math.abs(u.x - b.x) < b.explosive + u.def.half[0]) {
							damageUnit(w, u, b.damage * 0.5, b.pierce, b.owner, b.x, 'blast');
						}
					}
					w.civilians.blast(w, b.x, g, b.z, b.explosive, b.damage * 0.5, b.owner);
				}
				dead = true;
			}
		}
		if (dead) w.bullets.splice(i, 1);
	}
}

function updateShells(w: World, dt: number): void {
	const pilots = w.pilots();
	const jets = w.jets();
	for (let i = w.shells.length - 1; i >= 0; i--) {
		const s = w.shells[i];
		const x0 = s.x,
			y0 = s.y;
		s.age += dt;
		const gravity =
			s.kind === 'rocket' ? 0 : s.kind === 'flak' ? 4 : s.kind === 'ffar' ? WORLD.gravity : 13;
		s.vy -= gravity * dt;
		s.x += s.vx * dt;
		s.y += s.vy * dt;
		if (s.kind === 'rocket' || s.kind === 'artillery' || s.kind === 'ffar') {
			s.trail += dt;
			if (s.trail > 0.03) {
				s.trail = 0;
				w.fx.trail(s.x, s.y, s.z, s.kind === 'artillery' ? 0.5 : 0.8, 0.5, 0.5, 1.5, 0.3);
			}
		}
		if (s.kind === 'ffar') {
			if (ffarHit(w, s, x0, y0)) w.shells.splice(i, 1);
			continue;
		}
		let detonate = false;
		let air = false;
		let wingHit: AirAlly | null = null;
		if (s.kind === 'flak' && s.age >= s.fuse) {
			detonate = true;
			air = true;
		}
		let struck: Player | null = null;
		if (!detonate && s.owner === 'enemy' && s.kind !== 'artillery') {
			for (const p of pilots) {
				if (!p.alive) continue;
				if (segmentVsCircle(x0, y0, s.x, s.y, p.x, p.y, p.def.radius * 0.8) >= 0) {
					detonate = true;
					air = true;
					struck = p;
					break;
				}
			}
		}
		if (!detonate && s.owner === 'enemy' && s.kind !== 'artillery') {
			for (const wing of jets) {
				if (!wing.active) continue;
				if (segmentVsCircle(x0, y0, s.x, s.y, wing.x, wing.y, wing.radius) < 0) continue;
				detonate = true;
				air = true;
				wingHit = wing;
				break;
			}
		}
		if (!detonate && s.kind === 'tank') {
			if (s.owner === 'enemy') {
				detonate = w.allies.shellHit(x0, y0, s.x, s.y, s.punch, s.pierce) !== null;
			} else {
				// A friendly tank round: a direct hit does the real damage, the burst the rest.
				for (const u of w.units) {
					if (!u.alive || segmentVsUnit(u, x0, y0, s.x, s.y, 0.3) < 0) continue;
					damageUnit(w, u, s.damage, 0.7, 'player', x0, 'blast');
					detonate = true;
					break;
				}
			}
		}
		const g = w.ground(s.x);
		if (!detonate && s.y < g && !skimming(s.x, s.vx, s.aimX)) detonate = true;
		if (!detonate && s.age > (s.kind === 'artillery' ? 30 : 12)) {
			w.shells.splice(i, 1);
			continue;
		}
		if (!detonate) continue;
		w.shells.splice(i, 1);
		if (s.kind === 'flak') {
			w.fx.airburst(s.x, s.y, s.z, 1);
			w.sound.play('flakBurst', s.x, s.y, 0.8);
			for (const p of pilots) {
				if (!p.alive) continue;
				const d = Math.hypot(p.x - s.x, p.y - s.y);
				if (d < s.radius) p.hit(s.damage * (1 - d / s.radius) ** 1.4, w, s.x, s.y, false, 'flak');
			}
			for (const wing of jets) {
				if (!wing.active) continue;
				const d = Math.hypot(wing.x - s.x, wing.y - s.y);
				if (d < s.radius) wing.hit(w, s.damage * (1 - d / s.radius) ** 1.4);
			}
			if (!air) w.fx.impact(s.x, g, s.z, 'ground', true);
			continue;
		}
		if (
			s.kind === 'artillery' &&
			w.war.ourHqUp &&
			s.owner === 'enemy' &&
			s.x < WORLD.ourHqMaxX + 20
		) {
			// Our HQ is hardened like theirs: the shells only show; the siege itself wears it down.
			const g = w.ground(s.x);
			w.fx.explosion(s.x, g, s.z, 0.55, true);
			w.sound.boom(0.6, s.x, g);
			continue;
		}
		if (s.kind === 'artillery' && s.x < w.base.maxX + 20) {
			w.base.shellHit(w, s.x, s.damage);
			continue;
		}
		if (air) {
			// A shell bursting next to the aircraft: a sharp flak-style pop, not a bomb.
			w.fx.airburst(s.x, s.y, s.z, 0.8);
			w.sound.play('flakBurst', s.x, s.y, 0.7);
			if (wingHit) wingHit.hit(w, s.damage);
			else if (struck?.alive) struck.hit(s.damage, w, s.x, s.y, false, `shell:${s.kind}`);
			continue;
		}
		const spec =
			s.kind === 'rocket' ? SHELL_BLAST : s.kind === 'artillery' ? SHELL_BLAST : SMALL_BLAST;
		const by = Math.max(s.y, g);
		// Enemy shells don't hurt their own side, but they do hurt the friendly column.
		if (s.owner === 'enemy') w.allies.blast(s.x, by, spec.radius, spec.damage, spec.pierce);
		explode(w, s.x, by, s.z, { ...spec, damage: s.owner === 'enemy' ? 0 : spec.damage }, s.owner, {
			playerScale: 0,
			// Our tanks and mortars, not the player.
			fromAircraft: false
		});
	}
}

/** Our rockets burst on whatever they strike first: a vehicle, an aircraft or the ground. */
function ffarHit(w: World, s: Shell, x0: number, y0: number): boolean {
	let best = 2;
	for (const u of w.units) {
		if (!u.alive || Math.abs(u.x - s.x) > 40) continue;
		const t = segmentVsUnit(u, x0, y0, s.x, s.y, 0.4);
		if (t >= 0 && t < best) best = t;
	}
	// They burst on our own troops just the same.
	const ally = w.allies.firstHit(x0, y0, s.x, s.y, 0.4);
	if (ally && ally.t < best) best = ally.t;
	for (const a of w.air) {
		if (!a.alive) continue;
		const t = segmentVsCircle(x0, y0, s.x, s.y, a.x, a.y, a.radius);
		if (t >= 0 && t < best) best = t;
	}
	let x = s.x,
		y = s.y;
	if (best <= 1) {
		x = x0 + (s.x - x0) * best;
		y = y0 + (s.y - y0) * best;
	} else {
		const g = w.ground(s.x);
		if (s.y >= g) return s.age > 12;
		y = g;
	}
	explode(w, x, y, s.z, BOMBS.rockets.blast, s.owner, { playerScale: 0 });
	return true;
}

/**
 * Missile flight model. A missile is fast but not magic: how hard it can turn is
 * a lateral acceleration (its G limit), so the faster it goes the wider it turns;
 * every turn bleeds speed it only gets back while the motor burns; and its seeker
 * sees the target's motion a beat late and can only look so far off its nose.
 * A pilot who breaks hard as it closes makes it overshoot, and once the aircraft
 * slides out of the seeker's view the lock is gone. Agile aircraft make that
 * break sharper, so they shake missiles that a bomber never could.
 */
/** Speed at which a missile pulls its full rated turn rate; above it the G limit takes over. */
export const MISSILE_CORNER_SPEED = 60;
/** Below this speed fins lose bite and the missile can pull less. */
const MISSILE_CONTROL_SPEED = 150;
/** Fraction of speed lost per radian of heading change (induced drag). */
export const MISSILE_TURN_BLEED = 0.3;
/** Seeker tracking lag (s): how long it takes to notice the target changed direction. */
export const SEEKER_LAG = 0.4;
/** Seeker gimbal limit (rad): a target further off the nose than this breaks the lock. */
export const SEEKER_GIMBAL = 1.05;
/** Too slow to fly: a coasting missile below this falls out of the sky. */
const MISSILE_STALL = 55;

/** The tightest turn (rad/s) a missile can pull at its current speed. */
export function missileTurnLimit(m: Missile, burning: boolean): number {
	// The player's own missiles keep their simple, reliable guidance.
	if (m.owner === 'player') return m.turnRate * (burning ? 1 : 0.35);
	const v = Math.max(m.speed, 1);
	const lateral = m.turnRate * MISSILE_CORNER_SPEED * clamp(v / MISSILE_CONTROL_SPEED, 0.35, 1);
	return Math.min(m.turnRate, lateral / v) * (burning ? 1 : 0.7);
}

function updateMissiles(w: World, dt: number): void {
	for (let i = w.missiles.length - 1; i >= 0; i--) {
		const m = w.missiles[i];
		m.age += dt;
		const burning = m.age < m.burn;
		if (burning) m.speed = Math.min(m.maxSpeed, m.speed + m.accel * dt);
		else m.speed = Math.max(MISSILE_STALL * 0.7, m.speed - 30 * dt);
		if (m.owner === 'enemy') seek(w, m);
		else if (m.kind === 'arm') homeOnEmitter(w, m);
		else seekAir(w, m);
		const t = m.target;
		if (t && t.alive) {
			const dx = t.x - m.x,
				dy = t.y - m.y;
			const dist = Math.hypot(dx, dy);
			if (dist < 6.5) {
				detonateMissile(w, m, t);
				w.missiles.splice(i, 1);
				continue;
			}
			const enemy = m.owner === 'enemy';
			if (
				enemy &&
				m.age > 0.5 &&
				Math.abs(angleDiff(m.angle, Math.atan2(dy, dx))) > SEEKER_GIMBAL
			) {
				// Overshot: the target slid out of the seeker's view and the lock is lost.
				m.target = null;
				if (w.pilots().some((p) => p === t)) w.events.message('MISSILE EVADED', '', 'good');
			} else {
				const k = enemy ? 1 - Math.exp(-dt / SEEKER_LAG) : 1;
				m.trackVx += (t.vx - m.trackVx) * k;
				m.trackVy += (t.vy - m.trackVy) * k;
				const tGo = dist / Math.max(m.speed, 60);
				const desired = Math.atan2(
					t.y + m.trackVy * tGo * 0.75 - m.y,
					t.x + m.trackVx * tGo * 0.75 - m.x
				);
				const limit = missileTurnLimit(m, burning) * dt;
				const turn = clamp(angleDiff(m.angle, desired), -limit, limit);
				m.angle += turn;
				if (enemy) m.speed -= m.speed * Math.abs(turn) * MISSILE_TURN_BLEED;
			}
		}
		if (m.owner === 'enemy' && !burning && m.speed < MISSILE_STALL) m.target = null;
		m.vx = Math.cos(m.angle) * m.speed;
		m.vy = Math.sin(m.angle) * m.speed - (burning ? 0 : Math.min(m.age - m.burn, 3) * 6);
		m.x += m.vx * dt;
		m.y += m.vy * dt;
		m.trail += dt;
		while (m.trail > 0.016) {
			m.trail -= 0.016;
			if (burning)
				w.fx.trail(
					m.x - Math.cos(m.angle) * 1.6,
					m.y - Math.sin(m.angle) * 1.6,
					m.z,
					0.9,
					0.62,
					0.75,
					2.8,
					0.25
				);
		}
		const g = w.ground(m.x);
		if (m.y < g || m.age > m.life) {
			const air = m.y >= g;
			explode(w, m.x, air ? m.y : g, m.z, m.blast ?? MISSILE_BLAST, m.owner, {
				playerScale: m.owner === 'player' ? 0 : 0.4
			});
			if (!air) w.fx.impact(m.x, g, m.z, 'ground', true);
			w.missiles.splice(i, 1);
		}
	}
}

function detonateMissile(w: World, m: Missile, t: Trackable): void {
	m.alive = false;
	if (m.blast) {
		// Our missiles: the warhead does the work (ground targets and aircraft alike).
		explode(w, m.x, m.y, m.z, m.blast, m.owner, { playerScale: 0 });
		return;
	}
	explode(w, m.x, m.y, m.z, MISSILE_BLAST, m.owner, { playerScale: 0 });
	const p = w.pilots().find((q) => q === t);
	if (p) {
		p.hit(m.damage, w, m.x, m.y, false, `missile:${m.kind}`);
	} else if (w.jets().some((j) => j === t)) {
		(t as AirAlly).hit(w, m.damage);
	} else {
		for (const a of w.air) if (a === t) a.damage(w, m.damage * 3, m.owner);
		for (const d of w.drones) if (d === t) d.hit(w, m.damage * 3);
	}
}

/** A salvo of four flares fanned out behind an aircraft. */
export function popFlares(
	w: World,
	x: number,
	y: number,
	vx: number,
	vy: number,
	angle: number,
	heat = 4
): void {
	const ca = Math.cos(angle),
		sa = Math.sin(angle);
	for (let i = 0; i < 4; i++) {
		const side = i % 2 === 0 ? 1 : -1;
		w.flares.push({
			x: x - ca * 2.5,
			y: y - sa * 2.5 - 0.8,
			z: 0,
			vx: vx * 0.8 - ca * 6,
			vy: vy * 0.8 - sa * 6 - 8 - i * 2,
			vz: side * (5 + i * 1.4),
			alive: true,
			heat,
			age: 0,
			life: rnd.range(2.8, 3.6)
		});
	}
	w.sound.play('flare', x, y, 0.5);
}

/** Chance an AI pilot doesn't see a missile coming until it is too late to flare it. */
export const FLARE_MISS = 0.2;
/** Chance it flares, but badly: mistimed, the salvo never outshines the aircraft to the seeker. */
export const FLARE_DUD = 0.3;
/** How close a missile has to be before the pilot takes any notice. */
const FLARE_WATCH = 650;

/**
 * An AI pilot's flare drill. It notices each missile chasing it (or misses it
 * altogether) once, judges a range to flare at, and pops a salvo when the
 * missile closes inside it. The luck is in whether the salvo takes: a good one
 * pulls the seeker off, a mistimed one is too cool against the engines and the
 * missile comes straight through.
 */
export class FlareDrill {
	private readonly reaction = new WeakMap<Missile, { at: number; heat: number }>();
	private cd = 0;

	update(w: World, dt: number, self: Trackable & { angle: number }, foe: Owner): void {
		this.cd -= dt;
		if (this.cd > 0) return;
		for (const m of w.missiles) {
			if (m.owner !== foe || m.target !== self || !m.alive) continue;
			const d = Math.hypot(m.x - self.x, m.y - self.y);
			if (d > FLARE_WATCH) continue;
			let r = this.reaction.get(m);
			if (!r) {
				const luck = rnd.next();
				r = {
					at: luck < FLARE_MISS ? -1 : rnd.range(140, 440),
					heat: luck < FLARE_MISS + FLARE_DUD ? 0.3 : 4
				};
				this.reaction.set(m, r);
			}
			if (d > r.at) continue;
			this.cd = rnd.range(1.6, 2.4);
			popFlares(w, self.x, self.y, self.vx, self.vy, self.angle, r.heat);
			return;
		}
	}
}

function updateFlares(w: World, dt: number): void {
	for (let i = w.flares.length - 1; i >= 0; i--) {
		const f = w.flares[i];
		f.age += dt;
		const px = f.x,
			py = f.y,
			pz = f.z;
		// Light pellets: they shed the aircraft's speed fast and drop in a curve.
		const drag = Math.exp(-1.6 * dt);
		f.vx *= drag;
		f.vz *= drag;
		f.vy = f.vy * drag - 9 * dt;
		f.x += f.vx * dt;
		f.y += f.vy * dt;
		f.z += f.vz * dt;
		flareEmit(w.fx, f, px, py, pz, dt);
		if (f.age > f.life || f.y < w.ground(f.x)) {
			f.alive = false;
			w.flares.splice(i, 1);
		}
	}
}

/** Seeker half-angle: heat seekers look wide; radar seekers barely notice a flare off-axis. */
const SEEKER_FOV = { heat: 0.2, radar: 0.06 };
/** How bright a flare looks to each seeker relative to its heat (radar sees it as weak chaff). */
const FLARE_GAIN = { heat: 1, radar: 0.35 };
/** A seeker that lost its flare re-searches a wider cone out to this range. */
const REACQUIRE = 1000;
const SEARCH_FOV = 0.9;
/** Beyond this a seeker cannot tell a flare from the aircraft beside it (the flare window). */
export const RESOLVE = 450;
/** Clear-air range at which a heat seeker can hold the aircraft; rain and snow shorten it. */
export const IR_RANGE = 1100;

/** Apparent strength of a source in the seeker's view: 0 when outside the cone. */
function apparent(
	m: Missile,
	t: Trackable,
	heat: number,
	cone: boolean,
	fov = SEEKER_FOV[m.seeker]
): number {
	const dx = t.x - m.x,
		dy = t.y - m.y;
	const d = Math.hypot(dx, dy);
	if (cone && d > 1) {
		const off = (dx * Math.cos(m.angle) + dy * Math.sin(m.angle)) / d;
		if (off < Math.cos(fov)) return 0;
	}
	return heat / (d * d + 100);
}

/**
 * An enemy seeker locks the brightest thing in its field of view. A flare only
 * fools it if it outshines the aircraft from where the missile is looking: so
 * it has to sit between them, and be hot enough, close enough, at the right time.
 */
function seek(w: World, m: Missile): void {
	const t = m.target;
	const ir = m.seeker === 'heat' ? w.weather.irScale() : 1;
	if (
		t &&
		ir < 1 &&
		w.pilots().some((p) => p === t) &&
		Math.hypot(t.x - m.x, t.y - m.y) > IR_RANGE * ir
	) {
		// The aircraft's heat is lost in the rain: the seeker goes blind until it closes in.
		m.target = null;
		return;
	}
	if (!t || !t.alive) {
		const p = w.nearestPilot(m.x, m.y);
		// Lost its flare: look for the aircraft again.
		const near =
			p && p.alive && Math.hypot(p.x - m.x, p.y - m.y) < Math.min(REACQUIRE, IR_RANGE * ir);
		if (p && near && apparent(m, p, 1, true, SEARCH_FOV) > 0) m.target = p;
		return;
	}
	decoy(w, m, t);
}

/**
 * Our missiles after enemy aircraft and drones: their flares can pull them off
 * the same way, and one that loses its flare looks again for the nearest bandit.
 */
function seekAir(w: World, m: Missile): void {
	const t = m.target;
	if (t && t.alive) {
		if (w.air.includes(t as AirUnit) || w.flares.includes(t as Flare)) decoy(w, m, t);
		return;
	}
	if (t === null || !w.flares.includes(t as Flare)) return;
	let best: Trackable | null = null;
	let bestD = REACQUIRE;
	for (const a of w.air) {
		if (!a.alive || a.dying) continue;
		const d = Math.hypot(a.x - m.x, a.y - m.y);
		if (d < bestD && apparent(m, a, 1, true, SEARCH_FOV) > 0) {
			bestD = d;
			best = a;
		}
	}
	m.target = best;
}

/** A flare that outshines the seeker's target from where the missile is looking steals the lock. */
function decoy(w: World, m: Missile, t: Trackable): void {
	if (w.flares.includes(t as Flare)) return;
	let best = apparent(m, t, m.seeker === 'heat' ? t.heat : 1, false);
	// Range gate: a flare farther away than the aircraft cannot steal the lock.
	const gate = Math.hypot(t.x - m.x, t.y - m.y) * 1.1;
	for (const f of w.flares) {
		const fd = Math.hypot(f.x - m.x, f.y - m.y);
		if (fd > gate || fd > RESOLVE) continue;
		const s = apparent(m, f, f.heat * flareHeat(f) * FLARE_GAIN[m.seeker], true);
		if (s > best) {
			best = s;
			m.target = f;
		}
	}
}
