import { angleDiff, clamp, damp, dampAngle, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { WORLD } from './constants';
import { ENEMY_WEAPONS, type EnemyWeapon } from './defs-units';
import { launchMissile, spawnBullet } from './projectiles';
import type { Player } from './player';
import type { Unit } from './types';
import { muzzlePoint } from './unit-pose';
import { nearestFriendly, type Wingman } from './wingman';
import type { World } from './world';

const m3: [number, number, number] = [0, 0, 0];
const TURRET_RATE = 2.2;
const ELEVATE_RATE = 1.4;

export function updateUnits(w: World, dt: number): void {
	w.radarCoverage = false;
	w.spotted = false;
	for (const u of w.units) {
		if (!u.alive) continue;
		if (u.def.kind === 'radar') w.radarCoverage = true;
		if (u.spotting) w.spotted = true;
	}
	const p = w.player;
	if (p) {
		p.lockedBy = 0;
		p.lockProgress = 0;
		p.lockers.length = 0;
	}
	for (const u of w.units) {
		u.flash = Math.max(0, u.flash - dt * 4);
		if (!u.alive) {
			wreck(w, u, dt);
			continue;
		}
		u.stateTime += dt;
		if (u.stun > 0) {
			// Knocked out by an EMP: dead engines, dead radar, sparks from the wiring.
			u.stun -= dt;
			if (rnd.chance(dt * 4))
				w.fx.impact(u.x + rnd.gauss(1), u.y + u.def.half[1] * 1.6, u.z, 'metal');
			continue;
		}
		u.spin += dt * (u.def.kind === 'radar' ? 1.1 : 2.6);
		move(w, u, dt);
		if (u.def.kind === 'searchlight') searchlight(w, u, dt);
		else if (u.def.weapon) engage(w, u, dt);
	}
	for (let i = w.units.length - 1; i >= 0; i--) if (w.units[i].remove) w.units.splice(i, 1);
}

function siegeLine(u: Unit): number {
	if (u.def.kind === 'artillery') return WORLD.baseAttackX + 480;
	if (u.def.kind === 'tank') return WORLD.baseAttackX + 70;
	return WORLD.baseAttackX + u.def.half[0] * 2;
}

function move(w: World, u: Unit, dt: number): void {
	const def = u.def;
	if (def.isStatic) return;
	let want = def.speed;
	if (u.panic > 0) {
		u.panic -= dt;
		if (u.state !== 'flee') {
			u.state = 'flee';
			u.dir = 1;
		}
		want = def.speed * 1.7;
	} else if (u.state === 'flee') {
		u.state = 'advance';
		u.dir = -1;
	}
	if (u.state === 'advance' && u.x < siegeLine(u)) {
		u.state = 'siege';
		u.stateTime = 0;
	}
	if (u.state === 'siege' || u.state === 'hold') want = 0;
	if (u.state === 'hold' && u.stateTime > 2.2) u.state = 'advance';
	if (u.state === 'deploy') {
		want = 0;
		if (u.stateTime > 0.6 + u.deployed * 0.45 && u.deployed < 4) {
			const s = w.spawnUnit(
				'rifleman',
				u.x - u.dir * 4,
				clamp(u.z + rnd.range(-2.5, 2.5), -4, 4),
				-1
			);
			s.panic = 0;
			u.deployed++;
		}
		if (u.deployed >= 4 && u.stateTime > 3) u.state = 'advance';
	}
	// Keep convoy spacing: slow behind whoever is just ahead in the lane. Bridging
	// engineers are waved through to the front.
	for (const o of def.kind === 'engineer' ? [] : w.units) {
		if (o === u || !o.alive || o.def.isStatic || Math.abs(o.z - u.z) > 2.6) continue;
		const ahead = (o.x - u.x) * u.dir;
		const gap = o.def.half[0] + def.half[0] + (def.category === 'infantry' ? 1.2 : 4);
		if (ahead > 0 && ahead < gap) want = Math.min(want, Math.abs(o.speed) * 0.8);
	}
	// A fallen bridge span ahead: pull up at the broken edge.
	const stop = w.bridge?.stopLine(u.x, u.dir, def.half[0]);
	if (stop != null) {
		const room = (stop - u.x) * u.dir;
		if (room < 6) want = Math.min(want, Math.max(0, room) * 0.6);
	}
	u.speed = damp(u.speed, want, def.category === 'infantry' ? 6 : 1.6, dt);
	u.x += u.speed * u.dir * dt;
	if (stop != null && (u.x - stop) * u.dir > 0) {
		u.x = stop;
		u.speed = 0;
	}
	u.y = w.surface.support(u.x, u.y + 1, u.z);
	const targetYaw = u.dir < 0 ? Math.PI : 0;
	u.yaw = dampAngle(u.yaw, targetYaw, 3, dt);
	const slope = Math.atan2(
		w.surface.support(u.x + 2, u.y + 1, u.z) - w.surface.support(u.x - 2, u.y + 1, u.z),
		4
	);
	const facing = Math.cos(u.yaw) >= 0 ? 1 : -1;
	u.pitch = damp(u.pitch, slope * facing, 8, dt);
	u.anim += (u.speed * dt) / (def.category === 'infantry' ? 0.3 : 0.5);
}

/** Aims the turret toward a world point. Returns true when on target. */
function aimAt(u: Unit, dt: number, tx: number, ty: number, ox: number, oy: number): boolean {
	const worldYaw = tx >= u.x ? 0 : Math.PI;
	const relYaw = wrapAngle(worldYaw - u.yaw);
	u.aimYaw += clamp(angleDiff(u.aimYaw, relYaw), -TURRET_RATE * dt, TURRET_RATE * dt);
	const pitch = clamp(
		Math.atan2(ty - oy, Math.abs(tx - ox)) - u.pitch * (worldYaw === 0 ? 1 : -1),
		-0.1,
		1.45
	);
	u.aimPitch = moveToward(u.aimPitch, pitch, ELEVATE_RATE * dt);
	return Math.abs(angleDiff(u.aimYaw, relYaw)) < 0.14 && Math.abs(u.aimPitch - pitch) < 0.1;
}

function engage(w: World, u: Unit, dt: number): void {
	const spec = ENEMY_WEAPONS[u.def.weapon ?? 'rifle'];
	const kind = u.def.weapon;
	u.cooldown -= dt;
	const ox = u.x,
		oy = u.y + u.def.half[1] * 2;
	// Air defences shoot at whichever friendly aircraft is closer: the player or the wingman.
	const p = nearestFriendly(w, ox, oy);
	// Small arms turn on paratroopers that land close by.
	if (kind === 'rifle' || kind === 'mg' || kind === 'autocannon') {
		const t = w.troops.nearest(ox, oy, 95);
		if (t) {
			const ty = t.y + 1.1;
			if (aimAt(u, dt, t.x, ty, ox, oy)) fire(w, u, dt, spec, t.x, ty, 0.2);
			return;
		}
	}
	if (p) {
		const dx = p.x - ox,
			dy = p.y - oy;
		const dist = Math.hypot(dx, dy);
		const elev = Math.atan2(dy, Math.abs(dx));
		// Shoulder-launched heat seekers can't see as far through rain or snow.
		const ir = kind === 'manpads' ? w.weather.irScale() : 1;
		const range = u.def.range * ir * (w.night > 0.5 && !w.spotted ? 0.8 : 1);
		if (dist < range && elev > spec.minElev && !p.landed) {
			if (kind === 'sam' || kind === 'manpads') return missileSite(w, u, dt, spec, p, ox, oy);
			if (kind === 'cannon' && (p.y - u.y > 140 || dist > 460)) {
				if (u.state === 'siege') siege(w, u, dt);
				return;
			}
			const t = dist / Math.max(spec.speed, 1);
			const lead = spec.lead * (w.spotted ? 1 : 0.85);
			const tx = p.x + p.vx * t * lead;
			const ty = p.y + p.vy * t * lead + (kind === 'flak' ? 2 * t * t : 2 * t * t * 0.5);
			// Gunners need a moment to acquire a target that just came into range.
			u.lock = Math.min(u.lock + dt, 2);
			const ready = aimAt(u, dt, tx, ty, ox, oy) && u.lock > 1.1;
			if (u.def.category === 'infantry' && ready && u.state === 'advance' && u.cooldown <= 0) {
				u.state = 'hold';
				u.stateTime = 0;
			}
			if (ready) fire(w, u, dt, spec, tx, ty, t);
			return;
		}
	}
	u.lock = Math.max(0, u.lock - dt);
	if (u.state === 'siege') return siege(w, u, dt);
	// Idle: drift the turret back to the travel position.
	u.aimYaw = moveToward(u.aimYaw, 0, dt);
	u.aimPitch = moveToward(
		u.aimPitch,
		kind === 'flak' || kind === 'autocannon' ? 0.5 : kind === 'sam' ? 0.12 : 0.05,
		dt * 0.5
	);
}

function fire(
	w: World,
	u: Unit,
	dt: number,
	spec: EnemyWeapon,
	tx: number,
	ty: number,
	t: number
): void {
	const kind = u.def.weapon;
	if (u.burst > 0) {
		u.gap -= dt;
		if (u.gap > 0) return;
		u.gap = spec.burstGap;
		u.burst--;
	} else {
		if (u.cooldown > 0) return;
		u.cooldown = spec.interval * rnd.range(0.8, 1.25);
		u.burst = spec.burst - 1;
		u.gap = spec.burstGap;
	}
	const m = muzzlePoint(u, m3);
	const rookie = 1.5 - Math.min(w.wave, 10) * 0.07;
	const spread = spec.spread * rookie * (w.spotted ? 0.55 : 1);
	const a = Math.atan2(ty - m[1], tx - m[0]) + rnd.gauss(spread);
	if (kind === 'flak') {
		w.shells.push({
			kind: 'flak',
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(a) * spec.speed,
			vy: Math.sin(a) * spec.speed,
			age: 0,
			fuse: t * rnd.range(0.94, 1.08),
			damage: spec.damage,
			radius: 16,
			owner: 'enemy',
			trail: 0
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(a), Math.sin(a), 2.4, [12, 6, 2]);
		w.fx.gunSmoke(m[0], m[1], m[2], 2.5);
		w.sound.play('flak', m[0], m[1], 0.7);
		return;
	}
	if (kind === 'cannon') {
		w.shells.push({
			kind: 'tank',
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(a) * spec.speed,
			vy: Math.sin(a) * spec.speed,
			age: 0,
			fuse: Infinity,
			damage: spec.damage,
			radius: 6,
			owner: 'enemy',
			trail: 0
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(a), Math.sin(a), 3, [12, 6, 2]);
		w.fx.gunSmoke(m[0], m[1], m[2], 3.5);
		w.sound.play('tankGun', m[0], m[1], 0.8);
		return;
	}
	spawnBullet(w, {
		x: m[0],
		y: m[1],
		z: m[2],
		vx: Math.cos(a) * spec.speed,
		vy: Math.sin(a) * spec.speed,
		life: 2.4,
		damage: spec.damage,
		pierce: 0,
		owner: 'enemy',
		tracer: true,
		color: spec.tracer,
		size: kind === 'rifle' ? 0.1 : kind === 'autocannon' ? 0.26 : 0.18,
		explosive: 0
	});
	if (kind !== 'rifle' || rnd.chance(0.5)) {
		w.fx.muzzleFlash(
			m[0],
			m[1],
			m[2],
			Math.cos(a),
			Math.sin(a),
			kind === 'autocannon' ? 1.3 : 0.7,
			spec.tracer
		);
	}
	w.sound.play(kind === 'autocannon' ? 'aaGun' : kind === 'mg' ? 'mg' : 'rifle', m[0], m[1], 0.45);
}

function missileSite(
	w: World,
	u: Unit,
	dt: number,
	spec: EnemyWeapon,
	target: Player | Wingman,
	ox: number,
	oy: number
): void {
	const p = w.player;
	const px = target.x,
		py = target.y;
	const ready = aimAt(u, dt, px, py, ox, oy);
	if (u.def.kind === 'sam') u.aimPitch = moveToward(u.aimPitch, 0.85, dt);
	if (!ready && u.def.kind !== 'sam') return;
	const stealth = p && target === p ? p.def.stealth : 1;
	const lockTime = spec.lockTime * stealth * (w.radarCoverage && u.def.kind === 'sam' ? 0.65 : 1);
	u.lock += dt;
	const progress = Math.min(1, u.lock / lockTime);
	if (p && target === p) {
		p.lockedBy++;
		p.lockProgress = Math.max(p.lockProgress, progress);
		p.lockers.push({ x: u.x, y: u.y + u.def.half[1], progress });
	}
	if (u.lock < lockTime || u.cooldown > 0) return;
	u.lock = 0;
	u.cooldown = spec.interval * rnd.range(0.85, 1.2);
	const m = muzzlePoint(u, m3);
	const sam = u.def.kind === 'sam';
	const angle = sam
		? Math.atan2(py - m[1], px - m[0]) * 0.3 + (px >= u.x ? 0.95 : Math.PI - 0.95) * 0.7
		: Math.atan2(py - m[1], px - m[0]);
	launchMissile(w, {
		kind: sam ? 'sam' : 'manpads',
		x: m[0],
		y: m[1],
		z: m[2],
		angle,
		speed: sam ? 35 : 28,
		maxSpeed: sam ? 265 : 205,
		accel: sam ? 230 : 270,
		turnRate: sam ? 2.25 : 2.8,
		target,
		burn: sam ? 3.4 : 2.3,
		life: sam ? 9 : 5.5,
		damage: spec.damage,
		owner: 'enemy',
		seeker: sam ? 'radar' : 'heat'
	});
	w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(angle), Math.sin(angle), 2.5, [12, 7, 3]);
	for (let i = 0; i < 6; i++) w.fx.trail(m[0], m[1], m[2], 2.2, 0.55, 0.7, 3, 0.4);
	if (p && target === p) w.events.message('MISSILE LAUNCH', '', 'warn');
}

/** Units parked at the siege line bombard the airbase. */
function siege(w: World, u: Unit, dt: number): void {
	const tx = rnd.range(WORLD.baseMinX + 60, WORLD.baseMaxX - 20);
	const kind = u.def.weapon;
	if (kind === 'artillery') {
		aimAt(u, dt, tx, u.y + 400, u.x, u.y);
		u.aimPitch = moveToward(u.aimPitch, 0.75, dt * 0.5);
	} else {
		aimAt(u, dt, tx, w.ground(tx) + 3, u.x, u.y + u.def.half[1] * 2);
	}
	if (u.cooldown > 0) return;
	const spec = ENEMY_WEAPONS[kind ?? 'rifle'];
	u.cooldown = spec.interval * rnd.range(0.9, 1.6);
	const m = muzzlePoint(u, m3);
	if (kind === 'artillery' || kind === 'cannon') {
		const theta = kind === 'artillery' ? 0.9 : 0.25;
		const dist = Math.abs(tx - m[0]);
		const v = Math.sqrt((13 * dist) / Math.sin(2 * theta));
		const a = tx < m[0] ? Math.PI - theta : theta;
		w.shells.push({
			kind: 'artillery',
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(a) * v,
			vy: Math.sin(a) * v,
			age: 0,
			fuse: Infinity,
			damage: u.def.siege * 2.5,
			radius: 6,
			owner: 'enemy',
			trail: 0
		});
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(a), Math.sin(a), 3.2, [12, 6, 2]);
		w.fx.gunSmoke(m[0], m[1], m[2], 4);
		w.sound.play(kind === 'artillery' ? 'artillery' : 'tankGun', m[0], m[1], 0.7);
	} else if (kind === 'rifle' || kind === 'mg' || kind === 'autocannon') {
		const a = Math.atan2(w.ground(tx) + 3 - m[1], tx - m[0]) + rnd.gauss(0.03);
		spawnBullet(w, {
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(a) * spec.speed,
			vy: Math.sin(a) * spec.speed,
			life: 1.5,
			damage: 0,
			pierce: 0,
			owner: 'enemy',
			tracer: true,
			color: spec.tracer,
			size: 0.16,
			explosive: 0
		});
		u.cooldown = spec.burstGap > 0 ? spec.burstGap * 2 : 1;
	}
}

function searchlight(w: World, u: Unit, dt: number): void {
	const on = w.night > 0.35;
	u.spotting = false;
	if (!on) {
		u.lamp?.release();
		u.lamp = null;
		return;
	}
	const p = w.player;
	const ox = u.x,
		oy = u.y + 1.6;
	let candidate = false;
	if (p && p.alive) {
		const dist = Math.hypot(p.x - ox, p.y - oy);
		if (dist < u.def.range && p.y > oy + 20) {
			candidate = true;
			u.spotting = aimAt(u, dt, p.x, p.y, ox, oy) && dist < u.def.range * 0.9;
		}
	}
	if (!candidate) {
		// Lazy sweep across the sky, slewing so the beam never snaps.
		u.aimYaw = moveToward(u.aimYaw, Math.sin(w.time * 0.3 + u.id) * 0.9, dt * 0.8);
		u.aimPitch = moveToward(u.aimPitch, 0.75 + Math.sin(w.time * 0.47 + u.id * 2) * 0.35, dt * 0.6);
	}
	if (!u.lamp) u.lamp = w.lights.add(ox, oy, u.z, [1, 0.95, 0.85], 6, 18, { life: Infinity });
}

function wreck(w: World, u: Unit, dt: number): void {
	u.deadTime += dt;
	// Footing gone (a span fell): drop until something holds it up.
	const rest = w.surface.support(u.x, u.y + 0.5, u.z);
	if (u.y > rest + 0.05) {
		const level = w.surface.water(u.x, u.z);
		const wasDry = u.y > level;
		u.fall += WORLD.gravity * dt;
		u.y = Math.max(rest, u.y - u.fall * dt);
		if (wasDry && u.y <= level) {
			w.fx.water.splash(u.x, level, u.z, 1.4);
			w.sound.play('splash', u.x, level, 1);
		}
	} else u.fall = 0;
	if (u.fire?.dead) u.fire = null;
	if (u.def.category !== 'infantry' && u.deadTime < 4.5 && rnd.chance(dt * 1.3)) {
		w.fx.airburst(u.x + rnd.gauss(1.5), u.y + u.def.half[1] * 2 + rnd.range(0, 2), u.z, 0.35);
		w.sound.play('flakBurst', u.x, u.y, 0.3, 1.4);
	}
	const linger = u.def.isStatic ? 110 : 55;
	if (u.deadTime > linger) {
		u.y -= dt * 0.35;
		if (u.deadTime > linger + 7) u.remove = true;
	}
}
