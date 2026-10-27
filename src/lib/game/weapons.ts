import { angleDiff, clamp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode } from './combat';
import { killUnit } from './deaths';
import { WORLD } from './constants';
import { BOMBLET_BLAST, BOMBS, type BombDef } from './defs-bombs';
import type { Designation, Owner, Unit } from './types';
import { empPulse, nuclearBlast } from './specials';
import type { World } from './world';

export interface Bomb {
	id: number;
	def: BombDef;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	angle: number;
	spin: number;
	age: number;
	owner: Owner;
	target: Unit | null;
	/** Guided bombs: ground x to glide to when there is no unit to track (NaN = none). */
	aimX: number;
	/** Guided bombs released onto a spot (not a unit) keep following the live laser spot. */
	followSpot: boolean;
	/** Penetrator: seconds spent burrowing. */
	dig: number;
	bomblet: boolean;
	alive: boolean;
}

export function dropBomb(
	w: World,
	def: BombDef,
	x: number,
	y: number,
	z: number,
	vx: number,
	vy: number,
	angle: number,
	designate: Designation | null = null
): Bomb {
	const guided = def.id === 'guided';
	const b: Bomb = {
		id: w.newId(),
		def,
		x,
		y,
		z,
		vx,
		vy,
		angle,
		spin: 0,
		age: 0,
		owner: 'player',
		// Guided bombs go where the pilot designated; with no designation they pick a target.
		target: guided ? (designate ? designate.unit : pickGuidedTarget(w, x, y, vx)) : null,
		aimX: guided && designate && !designate.unit ? designate.x : Number.NaN,
		followSpot: guided && !!designate && !designate.unit,
		dig: -1,
		bomblet: false,
		alive: true
	};
	w.bombs.push(b);
	w.sound.play('bombRelease', x, y, 0.6);
	return b;
}

/** Nearest live ground target ahead of and below the release point. */
function pickGuidedTarget(w: World, x: number, y: number, vx: number): Unit | null {
	let best: Unit | null = null;
	let bestScore = Infinity;
	const dir = Math.sign(vx) || 1;
	for (const u of w.units) {
		if (!u.alive) continue;
		const dx = (u.x - x) * dir;
		const drop = y - u.y;
		if (dx < -20 || dx > drop * 2.2 + 120) continue;
		const score = Math.abs(dx - drop * 0.6) - u.def.score * 0.15;
		if (score < bestScore) {
			bestScore = score;
			best = u;
		}
	}
	return best;
}

/** Simulates ballistic flight for the bomb sight. Returns the impact point. */
export function predictImpact(
	w: World,
	x: number,
	y: number,
	vx: number,
	vy: number,
	drag: number,
	out: number[] | null
): { x: number; y: number; t: number } {
	const dt = 1 / 30;
	let t = 0;
	if (out) out.length = 0;
	const wind = w.weather.baseWind;
	for (let i = 0; i < 360; i++) {
		const ax = vx - wind;
		const sp = Math.hypot(ax, vy);
		vx -= ax * sp * drag * dt;
		vy -= (vy * sp * drag + WORLD.gravity) * dt;
		x += vx * dt;
		y += vy * dt;
		t += dt;
		if (out && i % 4 === 0) out.push(x, y);
		const g = w.ground(x);
		if (y <= g) return { x, y: g, t };
	}
	return { x, y, t };
}

export function updateBombs(w: World, dt: number): void {
	for (let i = w.bombs.length - 1; i >= 0; i--) {
		const b = w.bombs[i];
		if (!b.alive) {
			w.bombs.splice(i, 1);
			continue;
		}
		b.age += dt;
		if (b.dig >= 0) {
			updateDig(w, b, dt);
			continue;
		}
		// Drag acts on airspeed, so the wind carries bombs (and the sight allows for it).
		const ax = b.vx - w.weather.wind;
		const sp = Math.hypot(ax, b.vy);
		b.vx -= ax * sp * b.def.drag * dt;
		b.vy -= (b.vy * sp * b.def.drag + WORLD.gravity) * dt;
		if (b.def.id === 'guided' && b.age > 0.35) steerGuided(w, b, dt);
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		if (b.def.id === 'napalm') {
			b.spin += dt * 6;
			b.angle += dt * 4;
		} else {
			b.angle +=
				angleDiff(b.angle, Math.atan2(b.vy, b.vx)) * Math.min(1, dt * 3) +
				Math.sin(b.age * 9) * dt * 0.3;
		}
		if (b.def.id === 'guided' && b.target) {
			w.fx.immediateGlow(
				b.x + Math.cos(b.angle) * 1.0,
				b.y + Math.sin(b.angle) * 1.0,
				b.z,
				0.5,
				6,
				0.6,
				0.4
			);
		}
		if (b.def.id === 'thunder' && rnd.chance(dt * 20))
			w.fx.trail(b.x, b.y, b.z, 0.5, 0.6, 0.3, 1, 0);
		w.sound.whistle(b.id, b.x, b.y, b.vy, true);

		if (b.def.id === 'cluster' && !b.bomblet) {
			const alt = b.y - w.ground(b.x);
			if (alt < 55 && b.age > 0.45) {
				splitCluster(w, b);
				continue;
			}
		}
		// Airburst fuzes: the nuke and the EMP go off above the ground.
		const fuze = b.def.id === 'nuke' ? 70 : b.def.id === 'emp' ? 32 : 0;
		if (fuze > 0 && b.age > 0.5 && b.y - w.ground(b.x) < fuze) {
			b.alive = false;
			w.sound.whistle(b.id, b.x, b.y, 0, false);
			if (b.def.id === 'nuke') nuclearBlast(w, b.x, b.y, b.z, b.owner);
			else empPulse(w, b.x, b.y, 140);
			continue;
		}
		const g = w.ground(b.x);
		let hit = b.y <= g;
		if (!hit) {
			for (const u of w.units) {
				if (!u.alive || Math.abs(u.x - b.x) > u.def.half[0] + 0.5) continue;
				if (b.y < u.y + u.def.half[1] * 2 + 0.3 && b.y > u.y - 1) {
					hit = true;
					break;
				}
			}
		}
		if (hit) impact(w, b, Math.max(b.y, g));
	}
}

function steerGuided(w: World, b: Bomb, dt: number): void {
	const t = b.target;
	let goalX: number;
	let lead = 0;
	if (t && t.alive) {
		goalX = t.x;
		lead = t.dir * t.speed;
		b.aimX = t.x;
	} else if (b.followSpot && w.designator) {
		// Laser-guided: ride the pilot's reticle wherever it is now.
		goalX = w.designator.x;
		b.aimX = goalX;
	} else if (!Number.isNaN(b.aimX)) {
		goalX = b.aimX;
	} else {
		return;
	}
	const goalY = w.ground(goalX);
	const tGo = Math.max(
		0.2,
		Math.hypot(goalX - b.x, goalY - b.y) / Math.max(30, Math.hypot(b.vx, b.vy))
	);
	const wantVx = (goalX + lead * tGo - b.x) / tGo;
	b.vx += clamp(wantVx - b.vx, -30 * dt, 30 * dt);
	b.vy -= 2 * dt;
}

function splitCluster(w: World, b: Bomb): void {
	b.alive = false;
	w.fx.airburst(b.x, b.y, b.z, 0.6);
	w.sound.play('flakBurst', b.x, b.y, 0.6);
	const n = 16;
	for (let k = 0; k < n; k++) {
		const spread = (k / (n - 1) - 0.5) * 2;
		w.bombs.push({
			id: w.newId(),
			def: { ...BOMBS.cluster, mesh: 'bomblet', drag: 0.004, blast: BOMBLET_BLAST },
			x: b.x,
			y: b.y,
			z: b.z + rnd.gauss(2.5),
			vx: b.vx * 0.85 + spread * 26 + rnd.gauss(3),
			vy: b.vy * 0.6 + rnd.range(-4, 6),
			angle: -Math.PI / 2,
			spin: rnd.range(-10, 10),
			age: 0,
			owner: b.owner,
			target: null,
			aimX: Number.NaN,
			followSpot: false,
			dig: -1,
			bomblet: true,
			alive: true
		});
	}
}

function impact(w: World, b: Bomb, y: number): void {
	w.sound.whistle(b.id, b.x, b.y, 0, false);
	const id = b.def.id;
	if (id === 'penetrator') {
		b.dig = 0;
		w.fx.impact(b.x, y, b.z, 'ground', true);
		w.fx.dirtFountain(b.x, y, b.z, 0.4);
		w.sound.play('impactGround', b.x, y, 1);
		return;
	}
	b.alive = false;
	if (id === 'napalm') return napalm(w, b, y);
	if (id === 'chemical') {
		explode(w, b.x, y, b.z, b.def.blast, b.owner);
		w.gas.release(b.x, y, b.z, 24, 15);
		return;
	}
	if (id === 'thunder') {
		w.fx.megaBlast(b.x, y, b.z);
		explode(w, b.x, y, b.z, b.def.blast, b.owner, { visual: 'none' });
		w.events.slowmo(0.25, 1.1);
		return;
	}
	explode(w, b.x, y, b.z, b.def.blast, b.owner);
}

/** The bunker buster burrows, then lifts the earth. */
function updateDig(w: World, b: Bomb, dt: number): void {
	b.dig += dt;
	b.y -= dt * 8;
	if (b.dig < 0.22) return;
	b.alive = false;
	const g = w.ground(b.x);
	explode(w, b.x, g, b.z, b.def.blast, b.owner, { visual: 'none' });
	w.fx.explosion(b.x, g, b.z, 1.2, true);
	w.fx.dirtFountain(b.x, g, b.z, 3);
	w.fx.dustRing(b.x, g, b.z, 2.2);
	w.fx.shockwave(b.x, g, b.z, 60, 2.2, 0.7);
}

function napalm(w: World, b: Bomb, y: number): void {
	const dir = Math.sign(b.vx) || 1;
	const speed = Math.abs(b.vx);
	w.fx.napalmSplash(b.x, y, b.z, dir, speed);
	w.sound.play('napalm', b.x, y, 1.1);
	explode(w, b.x, y, b.z, b.def.blast, b.owner, { visual: 'none' });
	const length = clamp(24 + speed * 0.45, 26, 70);
	const segments = 6;
	for (let k = 0; k < segments; k++) {
		const fx = b.x + dir * (k / (segments - 1)) * length - dir * 4;
		const fy = w.ground(fx);
		w.fires.add(fx, fy, 0, 2.4 - k * 0.15, rnd.range(7, 10), {
			radius: length / segments + 1.5,
			dps: 34
		});
		w.terrain.burn(fx, 0, length / segments + 3, 1, 1);
	}
	w.props.blast(b.x + (dir * length) / 2, y, 0, length * 0.7, 30);
}

/** Fire pools hurt whatever stands in them. */
export function applyFireDamage(w: World, dt: number): void {
	for (const f of w.fires.list) {
		if (f.dps <= 0) continue;
		for (const u of w.units) {
			if (!u.alive || Math.abs(u.x - f.x) > f.radius + u.def.half[0]) continue;
			u.hp -= f.dps * dt * (1 - u.def.armor * 0.6);
			u.char = Math.min(0.8, u.char + dt * 0.3);
			if (u.def.category === 'infantry') u.panic = 2;
			if (u.hp <= 0) killUnit(w, u, f.x, 'fire', 'player');
		}
	}
}
