import { angleDiff, clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { damageUnit, explode, inBattlePlane } from './combat';
import {
	BOMBS,
	FREEZE_TIME,
	TESLA_DAMAGE,
	TESLA_JUMPS,
	TESLA_REACH,
	type BlastSpec
} from './defs-bombs';
import { UNITS } from './defs-units';
import type { Player } from './player';
import { trackUnit } from './targeting';
import { predictImpact } from './weapons';
import type { BombId, Designation, Owner, Trackable, Unit } from './types';
import type { World } from './world';

/** A cruise missile skimming the terrain, or a ballistic warhead falling from space. */
export interface Strike {
	kind: 'cruise' | 'ballistic';
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	angle: number;
	/** Where it is going; follows a moving designated unit. */
	target: Trackable;
	/** Seconds until a ballistic warhead appears overhead. */
	delay: number;
	age: number;
	trail: number;
	alive: boolean;
	owner: Owner;
	/** What goes off on arrival, when not the weapon's own warhead (the commander's strikes). */
	blast?: BlastSpec;
	/** A nuclear warhead. */
	nuke?: boolean;
	/** Seconds a cruise missile may fly before it gives up (default 14). */
	life?: number;
}

export const CRUISE_SPEED = 150;
const CRUISE_ALT = 14;
const BALLISTIC_DELAY = 2.6;
export const BALLISTIC_SPEED = 430;

/** A fixed spot on the battle line. */
export function groundPoint(w: World, x: number): Trackable {
	return { x, y: w.ground(x), z: 0, vx: 0, vy: 0, alive: true, heat: 0 };
}

/** Where launched ordnance should go when the pilot has not designated anything. */
function aheadPoint(w: World, p: Player, dist: number): Trackable {
	const x = clamp(p.x + (Math.cos(p.angle) >= 0 ? 1 : -1) * dist, -200, 2600);
	return { x, y: w.ground(x), z: 0, vx: 0, vy: 0, alive: true, heat: 0 };
}

/** Launch, call in or drop ordnance that does not simply fall off a pylon. */
export function launchSpecial(
	w: World,
	p: Player,
	id: BombId,
	designate: Designation | null
): void {
	if (id === 'para') {
		w.troops.drop(w, p.x, p.y - 2, p.vx, 6);
		w.events.message('PARATROOPERS AWAY', 'They will take on enemy infantry once down', 'info');
		return;
	}
	if (id === 'cruise') {
		// Seeker: the designated unit, else the best target near the reticle or ahead.
		const near = designate && !designate.unit ? designate.x : null;
		const dir = Math.cos(p.angle) >= 0 ? 1 : -1;
		const target = designate?.unit
			? designate.track
			: (seek(w, near ?? p.x, dir, near !== null) ?? designate?.track ?? aheadPoint(w, p, 900));
		const ca = Math.cos(p.angle),
			sa = Math.sin(p.angle);
		w.strikes.push({
			kind: 'cruise',
			x: p.x + ca * 2,
			y: p.y - 2.5,
			z: 0,
			vx: p.vx * 0.9,
			vy: p.vy - 6,
			angle: Math.atan2(p.vy - 6, p.vx),
			target,
			delay: 0,
			age: 0,
			trail: 0,
			alive: true,
			owner: 'player'
		});
		w.sound.play('missileLaunch', p.x, p.y, 1.2, 0.7);
		w.fx.muzzleFlash(p.x, p.y - 2.5, 0, ca, sa, 2.4, [10, 6, 3]);
		return;
	}
	// Fired off the rail, it stands on its tail and climbs out of sight before re-entry.
	// The impact point is fixed at launch: the reticle spot, else where the bomb sight lands.
	const aim = designate
		? designate.x
		: predictImpact(w, p.x, p.y - 1, p.vx, p.vy, BOMBS.gp.drag, null).x;
	const target = groundPoint(w, aim);
	w.strikes.push({
		kind: 'ballistic',
		x: p.x,
		y: p.y - 3,
		z: 0,
		vx: p.vx * 0.8,
		vy: p.vy - 4,
		angle: p.angle,
		target,
		delay: BALLISTIC_DELAY,
		age: 0,
		trail: 0,
		alive: true,
		owner: 'player'
	});
	w.sound.play('missileLaunch', p.x, p.y, 1.4, 0.55);
	w.events.message(
		'BALLISTIC MISSILE AWAY',
		'Climbing for re-entry — clear the target area',
		'warn'
	);
}

export function updateStrikes(w: World, dt: number): void {
	for (let i = w.strikes.length - 1; i >= 0; i--) {
		const s = w.strikes[i];
		if (s.kind === 'cruise') cruise(w, s, dt);
		else ballistic(w, s, dt);
		if (!s.alive) w.strikes.splice(i, 1);
	}
}

/**
 * Picks the most valuable live enemy for a cruise missile: near `x` when the
 * pilot pointed somewhere, otherwise anywhere ahead within range.
 */
export function seek(w: World, x: number, dir: number, nearPoint: boolean): Trackable | null {
	let best: Unit | null = null;
	let bestScore = 0;
	for (const u of w.units) {
		if (!u.alive) continue;
		const dx = (u.x - x) * dir;
		const d = Math.abs(u.x - x);
		if (nearPoint ? d > 160 : dx < 60 || dx > 2200) continue;
		const score = u.def.score / (1 + d / (nearPoint ? 60 : 900));
		if (score > bestScore) {
			bestScore = score;
			best = u;
		}
	}
	return best ? trackUnit(best) : null;
}

/** The most valuable of our units near x, for an enemy cruise missile. */
export function seekAlly(w: World, x: number): Trackable | null {
	let best: Unit | null = null;
	let bestScore = 0;
	for (const u of w.allies.list) {
		if (!u.alive) continue;
		const d = Math.abs(u.x - x);
		if (d > 160) continue;
		const score = Math.max(10, UNITS[u.def.kind].score) / (1 + d / 60);
		if (score > bestScore) {
			bestScore = score;
			best = u;
		}
	}
	return best ? trackUnit(best) : null;
}

function cruise(w: World, s: Strike, dt: number): void {
	s.age += dt;
	// Target destroyed on the way in: the seeker hunts for the next one nearby.
	if (!s.target.alive) {
		const next = s.owner === 'enemy' ? seekAlly(w, s.target.x) : seek(w, s.target.x, 1, true);
		s.target = next ?? { ...s.target, alive: true };
	}
	const t = s.target;
	const dx = t.x - s.x;
	const dir = Math.sign(dx) || 1;
	// Terrain-follow at treetop height, then pop up and dive onto the target.
	let goalY = 0;
	for (let k = 0; k <= 4; k++) goalY = Math.max(goalY, w.surface.clearance(s.x + dir * k * 25));
	goalY += CRUISE_ALT;
	if (Math.abs(dx) < 160) goalY = Math.abs(dx) > 70 ? goalY + 22 : t.y;
	const want =
		Math.abs(dx) < 70
			? Math.atan2(t.y - s.y, dx)
			: Math.atan2(clamp(goalY - s.y, -40, 40), dir * 60);
	const speed = Math.min(CRUISE_SPEED, Math.hypot(s.vx, s.vy) + 80 * dt);
	s.angle += clamp(angleDiff(s.angle, want), -2.2 * dt, 2.2 * dt);
	s.vx = Math.cos(s.angle) * speed;
	s.vy = Math.sin(s.angle) * speed;
	s.x += s.vx * dt;
	s.y += s.vy * dt;
	// Launched from a pad off the road, it settles onto the battle line.
	s.z += (t.z - s.z) * Math.min(1, dt * 1.2);
	s.trail += dt;
	if (s.trail > 0.02) {
		s.trail = 0;
		w.fx.trail(
			s.x - Math.cos(s.angle) * 2.6,
			s.y - Math.sin(s.angle) * 2.6,
			s.z,
			0.7,
			0.75,
			0.4,
			1.6,
			0.2
		);
	}
	const hitGround = s.y <= w.ground(s.x) + 0.5;
	if (hitGround || Math.hypot(dx, t.y - s.y) < 3 || s.age > (s.life ?? 14))
		detonate(w, s, 'cruise');
}

function ballistic(w: World, s: Strike, dt: number): void {
	const t = s.target;
	if (s.delay > 0) {
		s.delay -= dt;
		// Boost phase: pitch up to vertical and burn hard for altitude.
		s.angle += clamp(angleDiff(s.angle, Math.PI / 2), -2.5 * dt, 2.5 * dt);
		const sp = Math.min(Math.hypot(s.vx, s.vy) + 260 * dt, 700);
		s.vx = Math.cos(s.angle) * sp;
		s.vy = Math.sin(s.angle) * sp;
		s.x += s.vx * dt;
		s.y += s.vy * dt;
		const bx = s.x - Math.cos(s.angle) * 3,
			by = s.y - Math.sin(s.angle) * 3;
		w.fx.immediateGlow(bx, by, s.z, 3.2, 16, 9, 3);
		w.fx.trail(bx, by, s.z, 2, 0.85, 0.55, 5, 0.1);
		// Laser marker pulsing on the target until impact.
		if (Math.sin(w.time * 18) > 0) w.fx.immediateGlow(t.x, t.y + 1, t.z, 3, 12, 1.5, 0.6);
		if (s.delay <= 0) {
			s.x = t.x - 120;
			s.y = t.y + 900;
			s.z = t.z;
			const d = Math.hypot(t.x - s.x, t.y - s.y);
			s.vx = ((t.x - s.x) / d) * BALLISTIC_SPEED;
			s.vy = ((t.y - s.y) / d) * BALLISTIC_SPEED;
			s.angle = Math.atan2(s.vy, s.vx);
			w.sound.play('siren', t.x, t.y, 0.8, 1.6);
		}
		return;
	}
	s.age += dt;
	s.x += s.vx * dt;
	s.y += s.vy * dt;
	// Plasma sheath and a contrail all the way down.
	w.fx.immediateGlow(s.x, s.y, s.z, 5, 14, 7, 3);
	w.fx.trail(s.x, s.y, s.z, 1.8, 0.85, 0.5, 4, 0.1);
	if (s.y <= w.ground(s.x) + 1) detonate(w, s, 'ballistic');
}

function detonate(w: World, s: Strike, id: 'cruise' | 'ballistic'): void {
	s.alive = false;
	const y = Math.max(s.y, w.ground(s.x));
	if (s.nuke) return nuclearBlast(w, s.x, y + 30, s.z, s.owner);
	const blast = s.blast ?? BOMBS[id].blast;
	explode(w, s.x, y, s.z, blast, s.owner, { shake: blast.shake });
	if (id === 'ballistic' && !s.blast) {
		w.fx.shockwave(s.x, y, s.z, 120, 3, 0.9);
		w.fx.dustRing(s.x, y, s.z, 4);
		w.fx.flash(1.6);
		w.events.slowmo(0.35, 0.9);
	}
}

/** Electromagnetic pulse: stalls machines, blinds radar, drops helicopters. */
export function empPulse(w: World, x: number, y: number, radius: number): void {
	for (const u of w.units) {
		if (!u.alive || Math.hypot(u.x - x, u.y - y) > radius) continue;
		if (u.def.category === 'infantry') continue;
		u.stun = 10;
		u.speed = 0;
		u.lock = 0;
		u.lamp?.release();
		u.lamp = null;
	}
	for (const a of w.air) {
		if (!a.alive || Math.hypot(a.x - x, a.y - y) > radius * 1.4) continue;
		a.damage(w, a.kind === 'heli' ? 9999 : 120, 'player');
	}
	for (const m of w.missiles) {
		if (m.owner !== 'enemy' || Math.hypot(m.x - x, m.y - y) > radius * 1.6) continue;
		m.target = null;
		m.age = Math.max(m.age, m.life - 0.6);
	}
	const p = w.player;
	if (p) p.lockedBy = 0;
	w.fx.shockwave(x, y, 0, radius * 1.2, 2.2, 0.8);
	w.fx.empBurst(x, y, radius);
	w.sound.play('emp', x, y, 1.3);
}

/** A tactical nuclear airburst. */
export function nuclearBlast(w: World, x: number, y: number, z: number, by: Owner): void {
	const g = w.ground(x);
	w.fx.megaBlast(x, g, z);
	w.fx.nukeFlash(x, y, z);
	explode(w, x, g + 2, z, BOMBS.nuke.blast, by, { visual: 'none', shake: 1.6 });
	empPulse(w, x, y, 420);
	for (let k = 0; k < 14; k++) {
		const fx = x + rnd.range(-130, 130);
		w.fires.add(fx, w.ground(fx), rnd.range(-20, 10), rnd.range(1.5, 3), rnd.range(20, 40), {
			radius: 4,
			dps: 20,
			ours: by === 'player'
		});
		w.terrain.burn(fx, 0, 18, 1, 0.6);
	}
	w.sound.boom(4.5, x, y);
	w.sound.play('thunder', x, y, 1.5);
	w.events.slowmo(0.2, 1.8);
}

/** Cryo: everything in the radius freezes solid: stopped, silenced and brittle. */
export function cryoBlast(w: World, x: number, y: number, z: number, by: Owner): void {
	const r = BOMBS.cryo.blast.radius;
	explode(w, x, y, z, BOMBS.cryo.blast, by, { visual: 'none' });
	for (const u of w.units) {
		if (!u.alive || !inBattlePlane(u) || Math.abs(u.x - x) > r + u.def.half[0]) continue;
		u.stun = Math.max(u.stun, FREEZE_TIME);
		u.frost = FREEZE_TIME;
		u.speed = 0;
		u.panic = 0;
	}
	w.fx.frostBurst(x, y, z, r);
	w.sound.play('emp', x, y, 0.9, 0.6);
}

/**
 * Tesla: lightning leaps from the impact to the nearest enemy, then on to the
 * nearest one it has not struck yet, as long as each hop is short enough.
 */
export function teslaStrike(w: World, x: number, y: number, z: number, by: Owner): Unit[] {
	const struck: Unit[] = [];
	let fromX = x,
		fromY = y + 1;
	for (let k = 0; k < TESLA_JUMPS; k++) {
		let next: Unit | null = null;
		let best = TESLA_REACH;
		for (const u of w.units) {
			if (!u.alive || !inBattlePlane(u) || struck.includes(u)) continue;
			const d = Math.hypot(u.x - fromX, u.y + u.def.half[1] - fromY);
			if (d < best) {
				best = d;
				next = u;
			}
		}
		if (!next) break;
		const toY = next.y + next.def.half[1];
		w.fx.lightning(fromX, fromY, next.x, toY, z);
		struck.push(next);
		damageUnit(w, next, TESLA_DAMAGE, 0.8, by, fromX, 'blast');
		fromX = next.x;
		fromY = toY;
	}
	w.lights.add(x, y + 3, z, [0.8, 0.6, 1.6], 120, 60, { life: 0.35 });
	w.sound.play('emp', x, y, 1, 1.4);
	return struck;
}
