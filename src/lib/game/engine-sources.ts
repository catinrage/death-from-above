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
	/** 1 a fighter, 2 a heavy bomber, below 1 a drone. */
	size: number;
}

/** A drone's motor: FPV quadcopters whine like rotors, delta wings buzz like a moped. */
const DRONE_ENGINE = { fpv: ['rotor', 0.5], delta: ['prop', 0.7] } as const;

/**
 * Every AI aircraft still flying: our wingman and jets, enemy fighters,
 * strikers and helicopters, both sides' drones and both commanders'
 * bombers. The player's own engine is voiced separately.
 */
export function engineSources(w: World): EngineSource[] {
	const out: EngineSource[] = [];
	const wings = w.wingman ? [w.wingman, ...w.escorts] : w.escorts;
	for (const j of wings)
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
				engine: a.airframe ? AIRCRAFT[a.airframe].engine : a.kind === 'heli' ? 'rotor' : 'jet',
				size: 1
			});
	for (const d of w.drones)
		if (d.alive) {
			const [engine, size] = DRONE_ENGINE[d.kind];
			out.push({ key: d, x: d.x, y: d.y, vx: d.vx, vy: d.vy, engine, size });
		}
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
