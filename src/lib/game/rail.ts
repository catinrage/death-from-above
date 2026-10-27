import { clamp, lerp, smoothstep } from '../engine/math';
import type { River } from './river';

export interface RailSpec {
	/** Depth of the line: behind the road and the villages beside it. */
	z: number;
	/** Railhead (buffer stop) at the airbase end. */
	start: number;
	/** How far the rail viaduct stands above the road bridge's deck. */
	lift: number;
}

export const RAIL: RailSpec = {
	z: -46,
	start: 900,
	lift: 9
};

/** Rail top above the formation (ballast and sleepers in between). */
export const RAIL_TOP = 0.6;
/** Half-width of the embankment crown. */
const CROWN = 3.5;
/** Beyond this depth from the line the embankment has blended back into the land. */
const TOE = 11;
/** Half-length of the moving average that irons the land's bumps out of the grade. */
const SMOOTH = 70;
/** Distance over which the line climbs from the land to the viaduct. */
const RAMP = 240;
/** The formation sits this far above the smoothed land. */
const BED = 0.5;

/**
 * Where the railway runs: a graded line parallel to the road, ironed smooth
 * so the train never bucks, climbing onto a viaduct where it crosses the
 * river. Pure geometry: it shapes the terrain and answers height queries.
 */
export class RailLine {
	readonly z: number;
	readonly start: number;
	readonly end: number;
	/** Formation height of the rail viaduct over the river, or null without one. */
	readonly deckY: number | null;
	/** River crossing: [west, east] abutments, or null. */
	readonly crossing: [number, number] | null;
	/** Grade samples every metre from `x0`. */
	private readonly grade: Float32Array;
	private readonly x0: number;

	constructor(spec: RailSpec, profile: (x: number) => number, maxX: number, river: River | null) {
		this.z = spec.z;
		this.start = spec.start;
		this.end = maxX;
		const x0 = spec.start - SMOOTH - 40;
		const count = Math.ceil(maxX - x0) + 1;
		// Two passes of a moving average over the land along the battle line.
		const land = Array.from({ length: count + SMOOTH * 4 }, (_, i) => profile(x0 - SMOOTH * 2 + i));
		const once = average(land, SMOOTH);
		this.grade = new Float32Array(average(once, SMOOTH).map((h) => h + BED));
		this.x0 = x0;
		if (river) {
			this.deckY = river.deckY + spec.lift;
			this.crossing = [river.x0 - river.bridgeHalf, river.x0 + river.bridgeHalf];
			for (let i = 0; i < count; i++) {
				const along = Math.abs(x0 + i - river.x0) - river.bridgeHalf;
				const k = smoothstep(RAMP, 4, along);
				this.grade[i] = lerp(this.grade[i], this.deckY, k);
			}
		} else {
			this.deckY = null;
			this.crossing = null;
		}
	}

	/** Formation height (top of the embankment or viaduct deck) at x. */
	formation(x: number): number {
		const g = this.grade;
		const f = clamp(x - this.x0, 0, g.length - 1.001);
		const i = Math.floor(f);
		const t = f - i;
		return g[i] * (1 - t) + g[i + 1] * t;
	}

	/** Height the wheels run at. */
	railY(x: number): number {
		return this.formation(x) + RAIL_TOP;
	}

	/** Gradient of the line at x (radians, positive rising to +X). */
	slope(x: number): number {
		return Math.atan2(this.formation(x + 3) - this.formation(x - 3), 6);
	}

	/** Whether x lies on the viaduct rather than the embankment. */
	onViaduct(x: number): boolean {
		const c = this.crossing;
		return c !== null && x > c[0] && x < c[1];
	}

	/** Builds the embankment into a natural height `h` at (x, z). */
	carve(x: number, z: number, h: number): number {
		const dz = Math.abs(z - this.z);
		if (dz > TOE || x < this.start - 60) return h;
		// The viaduct spans the valley: nothing is filled under it.
		const c = this.crossing;
		if (c && x > c[0] + 1.5 && x < c[1] - 1.5) return h;
		const w = (1 - smoothstep(CROWN, TOE, dz)) * smoothstep(this.start - 60, this.start - 20, x);
		return lerp(h, this.formation(x), w);
	}
}

/** Moving average over `r` samples either side; the result is `2r` samples shorter. */
function average(v: readonly number[], r: number): number[] {
	const sums = new Float64Array(v.length + 1);
	for (let i = 0; i < v.length; i++) sums[i + 1] = sums[i] + v[i];
	const out: number[] = [];
	for (let i = 0; i + 2 * r < v.length; i++)
		out.push((sums[i + 2 * r + 1] - sums[i]) / (2 * r + 1));
	return out;
}
