import { angleDiff, clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { damageUnit, explode, segmentVsCircle, segmentVsUnit } from './combat';
import type { BlastSpec } from './defs-bombs';
import type { Owner, Trackable, Unit } from './types';
import { flareEmit, flareHeat } from './flare-fx';
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
}

export type ShellKind = 'flak' | 'tank' | 'artillery' | 'rocket';

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
}

export interface Missile extends Trackable {
	/** 'agm' is the player's guided air-to-ground missile. */
	kind: 'sam' | 'manpads' | 'air' | 'agm';
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
	m: Omit<Missile, 'age' | 'trail' | 'alive' | 'z' | 'heat' | 'vx' | 'vy'> & { z?: number }
): Missile {
	const missile: Missile = {
		...m,
		z: m.z ?? 0,
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
		if (!u.alive || Math.abs(u.x - b.x) > 30) continue;
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
	for (const m of w.missiles) {
		if (m.owner === 'player' || !m.alive) continue;
		if (segmentVsCircle(x0, y0, b.x, b.y, m.x, m.y, 2.2) >= 0) {
			m.age = m.life;
			w.events.kill('Missile', 25, m.x, m.y, 'player');
			return true;
		}
	}
	if (best > 1) return false;
	const hx = x0 + (b.x - x0) * best,
		hy = y0 + (b.y - y0) * best;
	if (unit) {
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
	}
	return true;
}

function updateBullets(w: World, dt: number): void {
	const p = w.player;
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
			} else if (
				p &&
				p.alive &&
				segmentVsCircle(x0, y0, b.x, b.y, p.x, p.y, p.def.radius * 0.6) >= 0
			) {
				p.hit(b.damage, w, x0, y0, false, `bullet:${b.size}`);
				w.fx.impact(p.x, p.y, 0, 'metal');
				dead = true;
			}
		}
		if (!dead) {
			const g = w.surface.under(b.x, y0, b.z);
			const kind = w.surface.kind;
			if (b.y < g) {
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
				}
				dead = true;
			}
		}
		if (dead) w.bullets.splice(i, 1);
	}
}

function updateShells(w: World, dt: number): void {
	const p = w.player;
	for (let i = w.shells.length - 1; i >= 0; i--) {
		const s = w.shells[i];
		const x0 = s.x,
			y0 = s.y;
		s.age += dt;
		const gravity = s.kind === 'rocket' ? 0 : s.kind === 'flak' ? 4 : 13;
		s.vy -= gravity * dt;
		s.x += s.vx * dt;
		s.y += s.vy * dt;
		if (s.kind === 'rocket' || s.kind === 'artillery') {
			s.trail += dt;
			if (s.trail > 0.03) {
				s.trail = 0;
				w.fx.trail(s.x, s.y, s.z, s.kind === 'rocket' ? 0.8 : 0.5, 0.5, 0.5, 1.5, 0.3);
			}
		}
		let detonate = false;
		let air = false;
		if (s.kind === 'flak' && s.age >= s.fuse) {
			detonate = true;
			air = true;
		}
		if (!detonate && p && p.alive && s.owner === 'enemy' && s.kind !== 'artillery') {
			if (segmentVsCircle(x0, y0, s.x, s.y, p.x, p.y, p.def.radius * 0.8) >= 0) {
				detonate = true;
				air = true;
			}
		}
		const g = w.ground(s.x);
		if (!detonate && s.y < g) detonate = true;
		if (!detonate && s.age > (s.kind === 'artillery' ? 30 : 12)) {
			w.shells.splice(i, 1);
			continue;
		}
		if (!detonate) continue;
		w.shells.splice(i, 1);
		if (s.kind === 'flak') {
			w.fx.airburst(s.x, s.y, s.z, 1);
			w.sound.play('flakBurst', s.x, s.y, 0.8);
			if (p && p.alive) {
				const d = Math.hypot(p.x - s.x, p.y - s.y);
				if (d < s.radius) p.hit(s.damage * (1 - d / s.radius) ** 1.4, w, s.x, s.y, false, 'flak');
			}
			if (!air) w.fx.impact(s.x, g, s.z, 'ground', true);
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
			if (p && p.alive) p.hit(s.damage, w, s.x, s.y, false, `shell:${s.kind}`);
			continue;
		}
		const spec =
			s.kind === 'rocket' ? SHELL_BLAST : s.kind === 'artillery' ? SHELL_BLAST : SMALL_BLAST;
		explode(
			w,
			s.x,
			Math.max(s.y, g),
			s.z,
			{ ...spec, damage: s.owner === 'enemy' ? 0 : spec.damage },
			s.owner,
			{ playerScale: 0 }
		);
	}
}

function updateMissiles(w: World, dt: number): void {
	for (let i = w.missiles.length - 1; i >= 0; i--) {
		const m = w.missiles[i];
		m.age += dt;
		const burning = m.age < m.burn;
		if (burning) m.speed = Math.min(m.maxSpeed, m.speed + m.accel * dt);
		else m.speed = Math.max(40, m.speed - 30 * dt);
		if (m.owner === 'enemy') seek(w, m);
		const t = m.target;
		if (t && t.alive) {
			const dx = t.x - m.x,
				dy = t.y - m.y;
			const dist = Math.hypot(dx, dy);
			const tGo = dist / Math.max(m.speed, 60);
			const desired = Math.atan2(t.y + t.vy * tGo * 0.75 - m.y, t.x + t.vx * tGo * 0.75 - m.x);
			const authority = burning ? 1 : 0.35;
			m.angle += clamp(
				angleDiff(m.angle, desired),
				-m.turnRate * dt * authority,
				m.turnRate * dt * authority
			);
			if (dist < 6.5) {
				detonateMissile(w, m, t);
				w.missiles.splice(i, 1);
				continue;
			}
		}
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
	const p = w.player;
	if (p && t === p) {
		p.hit(m.damage, w, m.x, m.y, false, `missile:${m.kind}`);
	} else {
		for (const a of w.air) if (a === t) a.damage(w, m.damage * 3, m.owner);
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
	const p = w.player;
	if (!t || !t.alive) {
		// Lost its flare: look for the aircraft again.
		const near = p && p.alive && Math.hypot(p.x - m.x, p.y - m.y) < REACQUIRE;
		if (p && near && apparent(m, p, 1, true, SEARCH_FOV) > 0) m.target = p;
		return;
	}
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
