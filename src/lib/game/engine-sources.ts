import { AIRCRAFT } from './defs-aircraft';
import type { World } from './world';

/** One aircraft the sound engine can hear: where it is, how it moves and what drives it. */
export interface EngineSource {
	/** Stable identity across frames (the aircraft object itself). */
	key: object;
	x: number;
	y: number;
	vx: number;
	vy: number;
	engine: 'jet' | 'prop' | 'rotor';
	/** 1 a fighter, 2 a heavy bomber. */
	size: number;
}

/**
 * Every AI aircraft still flying: our jets, enemy fighters, strikers and
 * helicopters, and both commanders' bombers. The player's own engine is
 * voiced separately.
 */
export function engineSources(w: World): EngineSource[] {
	const out: EngineSource[] = [];
	for (const j of w.jets())
		if (j.alive && !j.dying)
			out.push({
				key: j,
				x: j.x,
				y: j.y,
				vx: j.vx,
				vy: j.vy,
				engine: AIRCRAFT[j.aircraft].engine,
				size: 1
			});
	for (const a of w.air)
		if (a.alive && !a.dying)
			out.push({
				key: a,
				x: a.x,
				y: a.y,
				vx: a.vx,
				vy: a.vy,
				engine: a.kind === 'heli' ? 'rotor' : 'jet',
				size: 1
			});
	for (const c of [w.command, w.enemyCommand])
		for (const f of c.flybys)
			out.push({
				key: f,
				x: f.x,
				y: f.y,
				vx: f.dir * f.speed,
				vy: f.vy,
				engine: AIRCRAFT[f.aircraft].engine,
				size: 2
			});
	return out;
}
