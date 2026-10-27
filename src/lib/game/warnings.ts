import type { AlertState } from '../audio/cockpit';
import { noAlerts } from '../audio/cockpit';
import { WORLD } from './constants';
import type { Player } from './player';
import type { World } from './world';

/** Altitude below which the low-altitude caution sounds (away from the runway). */
const LOW_ALT = 22;

/** Which cockpit alerts the aircraft's state calls for right now. */
export function cockpitAlerts(w: World, p: Player): AlertState {
	const s = noAlerts();
	if (!p.alive || p.dying) return s;
	const alt = p.y - w.surface.clearance(p.x);
	const overRunway = p.x > WORLD.runwayMinX - 60 && p.x < WORLD.runwayMaxX + 60;
	s.pullUp = p.vy < -12 && alt < Math.max(40, -p.vy * 2.2);
	s.altitude = !s.pullUp && !p.landed && !overRunway && alt < LOW_ALT;
	s.stall = p.stalled && !p.landed;
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
