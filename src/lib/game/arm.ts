import type { Missile } from './projectiles';
import { pointTrack, trackUnit } from './targeting';
import type { Unit } from './types';
import type { World } from './world';

/** Furthest an anti-radiation seeker can hear an emitter. */
export const ARM_RANGE = 2200;
/** Half-angle (cosine) of the seeker's view once in flight. */
const SEEKER_COS = Math.cos(1.0);

/** Can this unit ever radiate? */
export function isEmitterKind(u: Unit): boolean {
	const k = u.def.kind;
	return k === 'radar' || k === 'sam' || k === 'spaag' || k === 'cruiser';
}

/**
 * Is this unit's radar on right now? Search radars sweep all the time; SAM
 * and radar-gun vehicles only light up while they track the aircraft.
 * An EMP-stunned set is dark.
 */
export function isEmitting(u: Unit): boolean {
	if (!u.alive || u.stun > 0 || !isEmitterKind(u)) return false;
	if (u.def.kind === 'radar') return true;
	// The cruiser's fire-control radar is up while its SAM battery locks on.
	if (u.def.kind === 'cruiser') return (u.aux?.lock ?? 0) > 0;
	return u.lock > 0;
}

/** How much the seeker wants this emitter: a launcher locking us beats a search radar. */
function priority(u: Unit): number {
	if (u.def.kind === 'sam' || u.def.kind === 'cruiser') return 2.2;
	if (u.def.kind === 'radar') return 1.4;
	return 1;
}

/**
 * Best emitter for a missile at (x, y) looking along `angle`. `cone` limits
 * the search to the seeker's view; without it anything ahead of the launch
 * point (along `dir`) counts.
 */
export function pickEmitter(
	w: World,
	x: number,
	y: number,
	angle: number,
	cone: boolean
): Unit | null {
	const ca = Math.cos(angle),
		sa = Math.sin(angle);
	const dir = ca >= 0 ? 1 : -1;
	let best: Unit | null = null;
	let bestScore = 0;
	for (const u of w.units) {
		if (!isEmitting(u)) continue;
		const dx = u.x - x,
			dy = u.y - y;
		const d = Math.hypot(dx, dy);
		if (d > ARM_RANGE) continue;
		if (cone ? d > 1 && (dx * ca + dy * sa) / d < SEEKER_COS : dx * dir < -40) continue;
		const score = priority(u) / (d + 200);
		if (score > bestScore) {
			bestScore = score;
			best = u;
		}
	}
	return best;
}

/**
 * Per-frame guidance for an anti-radiation missile. It rides the emission of
 * its emitter; if the site goes dark it flies on to where it last heard it,
 * and it snaps onto any other emitter that lights up in front of it.
 */
export function homeOnEmitter(w: World, m: Missile): void {
	const e = m.emitter ?? null;
	if (e && isEmitting(e)) return;
	if (e) {
		// Gone dark (or dead): remember the spot, keep listening.
		m.target = pointTrack(e.x, w.ground(e.x) + e.def.half[1]);
		m.emitter = null;
	}
	const next = pickEmitter(w, m.x, m.y, m.angle, true);
	if (next) {
		m.emitter = next;
		m.target = trackUnit(next);
	}
}
