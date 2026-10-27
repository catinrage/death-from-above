import type { AlertState } from '../audio/cockpit';
import { noAlerts } from '../audio/cockpit';
import { WORLD } from './constants';
import type { Player } from './player';
import type { World } from './world';

/** Altitude below which the low-altitude caution sounds (away from the runway). */
const LOW_ALT = 22;
/** "Too low, gear": below this height, sinking, slower than this many stall speeds, near the runway. */
const GEAR_ALT = 35;
const GEAR_SPEED = 1.8;
const GEAR_RANGE = 300;

/** Which cockpit alerts the aircraft's state calls for right now. */
export function cockpitAlerts(w: World, p: Player): AlertState {
	const s = noAlerts();
	if (!p.alive || p.dying) return s;
	const alt = p.y - w.surface.clearance(p.x);
	const overRunway = p.x > WORLD.runwayMinX - 60 && p.x < WORLD.runwayMaxX + 60;
	s.pullUp = p.vy < -12 && alt < Math.max(40, -p.vy * 2.2);
	s.altitude = !s.pullUp && !p.landed && !overRunway && alt < LOW_ALT;
	s.stall = p.stalled && !p.landed;
	s.gear = gearWarning(w, p, alt);
	s.missile = w.missiles.some((m) => m.target === p && m.alive);
	s.lock = p.lockProgress > 0.75;
	s.fire = p.hp < p.def.hp * 0.18;
	s.damage = !s.fire && p.hp < p.def.hp * 0.35;
	s.ceiling = p.ceiling;
	s.boundary = p.outOfBounds > 0;
	s.overheat = p.overheated;
	s.winchester = p.carried.every((id) => p.ammo[id] === 0);
	return s;
}

/** Low, sinking and slowing near the runway with the wheels still up: about to belly in. */
export function gearWarning(w: World, p: Player, alt = p.y - w.surface.clearance(p.x)): boolean {
	if (p.flight !== 'fixed' || p.landed || p.gear.down) return false;
	const near = p.x > WORLD.runwayMinX - GEAR_RANGE && p.x < WORLD.runwayMaxX + GEAR_RANGE;
	return near && alt < GEAR_ALT && p.vy < -1 && p.speed < p.def.stallSpeed * GEAR_SPEED;
}

/** Range and screen bearing (radians, 0 = right, clockwise) of the closest missile homing on the aircraft. */
export function missileThreat(
	w: World,
	p: Player | null
): { missileDist: number; missileDir: number } {
	let best = 0;
	let dir = 0;
	if (!p || !p.alive) return { missileDist: 0, missileDir: 0 };
	for (const m of w.missiles) {
		if (m.target !== p) continue;
		const d = Math.hypot(m.x - p.x, m.y - p.y);
		if (best === 0 || d < best) {
			best = d;
			dir = Math.atan2(-(m.y - p.y), m.x - p.x);
		}
	}
	return { missileDist: best, missileDir: dir };
}

/** Bearing (radians, 0 = right, clockwise) of the launcher closest to finishing its lock, or 0 when none is locking. */
export function lockThreat(p: Player | null): { lockDir: number } {
	let best: Player['lockers'][number] | null = null;
	if (p && p.alive) for (const l of p.lockers) if (!best || l.progress > best.progress) best = l;
	return { lockDir: best ? Math.atan2(-(best.y - p!.y), best.x - p!.x) : 0 };
}

/** Something hunting the aircraft: a missile in flight, or a launcher locking on. */
export interface Threat {
	kind: 'missile' | 'lock';
	x: number;
	y: number;
	/** Range in metres. */
	dist: number;
	/** 0..1 urgency: closeness for a missile, lock progress for a launcher. */
	level: number;
}

/** Furthest missile range that still registers any urgency. */
const THREAT_RANGE = 1500;

/** Every missile homing on the aircraft (closest first), then every launcher locking it (furthest along first). */
export function incomingThreats(w: World, p: Player | null, max = 8): Threat[] {
	if (!p || !p.alive || p.dying) return [];
	const missiles: Threat[] = [];
	for (const m of w.missiles) {
		if (m.target !== p || !m.alive) continue;
		const dist = Math.hypot(m.x - p.x, m.y - p.y);
		missiles.push({
			kind: 'missile',
			x: m.x,
			y: m.y,
			dist,
			level: Math.max(0, Math.min(1, 1 - dist / THREAT_RANGE))
		});
	}
	missiles.sort((a, b) => a.dist - b.dist);
	const locks: Threat[] = p.lockers.map((l) => ({
		kind: 'lock',
		x: l.x,
		y: l.y,
		dist: Math.hypot(l.x - p.x, l.y - p.y),
		level: l.progress
	}));
	locks.sort((a, b) => b.level - a.level);
	return missiles.concat(locks).slice(0, max);
}
