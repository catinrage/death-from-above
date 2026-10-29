import { lerp, smoothstep } from '../engine/math';
import { TERRAIN_ROWS } from './constants';

export interface RiverSpec {
	/** Where the river crosses the battle line. */
	x: number;
	/** Half-width of the water where the bridge crosses. */
	halfWidth: number;
	/** Channel depth below the water surface. */
	depth: number;
	/** Distance from the river centre to each abutment. */
	bridgeHalf: number;
	/** Deck height above the water. */
	clearance: number;
}

export const RIVER: RiverSpec = {
	x: 2160,
	halfWidth: 22,
	depth: 4.5,
	bridgeHalf: 60,
	clearance: 9
};

/** Bank top above the water at the channel edge. */
const BANK = 0.6;
/** Width over which the bed shoals up to the bank. */
export const SHOAL = 12;
/** The water mesh reaches this far past the channel edge, under the banks. */
export const STRIP = 12;
/** Low ground this close to the channel is raised to bank height. */
const FILL = 15;
const FILL_FADE = 30;
/** Spacing of the centre-line samples, and how many make one coarse search segment. */
const STEP = 2;
const COARSE = 8;
/** Beyond this distance from the centre line the valley never cuts the hills. */
const REACH = 320;

/**
 * Upstream heading (radians from -Z, positive turning toward +X) by distance
 * along the channel from the bridge; negative distances run downstream toward
 * the camera. Straight through the bridge, a lazy meander either side, and far
 * upstream a hard bend that takes the river away behind the hills.
 */
const HEADING: readonly [number, number][] = [
	[-640, 0.1],
	[-470, -0.42],
	[-300, 0.5],
	[-140, -0.5],
	[-30, 0],
	[40, 0],
	[115, 0.55],
	[205, -0.55],
	[265, -0.15],
	[355, -1.4],
	[520, -1.5]
];
/** Upstream distance where the river ends, and where it starts thinning to a creek. */
const SOURCE = 500;
const TAPER = 360;

function heading(s: number): number {
	const k = HEADING;
	if (s <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) {
		if (s <= k[i][0]) return lerp(k[i - 1][1], k[i][1], smoothstep(k[i - 1][0], k[i][0], s));
	}
	return k[k.length - 1][1];
}

/** One sample of the channel centre line. */
export interface RiverPoint {
	x: number;
	z: number;
	/** Distance upstream of the bridge. */
	s: number;
	/** Unit normal pointing to the right bank (looking upstream). */
	nx: number;
	nz: number;
	/** Half-width of the water here. */
	hw: number;
	/** Bed depth below the surface here (negative where the creek runs dry). */
	depth: number;
}

/** Where a point sits relative to the channel. */
export interface ChannelHit {
	/** Lateral distance from the centre line. */
	d: number;
	/** Distance upstream of the bridge at the nearest centre-line point. */
	s: number;
	hw: number;
	depth: number;
}

/**
 * A river winding toward the camera, crossing the battle line under a bridge.
 * Pure geometry: carves its valley into the terrain and answers water queries.
 */
export class River {
	readonly x0: number;
	readonly halfWidth: number;
	readonly depth: number;
	readonly bridgeHalf: number;
	/** Road height at the abutments; the deck sits level with it. */
	readonly deckY: number;
	/** Water surface height. */
	readonly level: number;
	/** Centre line, upstream end last, sampled every STEP metres. */
	readonly path: readonly RiverPoint[];
	private readonly slope0: number;
	private readonly box: [number, number, number, number];
	private readonly hit: ChannelHit = { d: 0, s: 0, hw: 0, depth: 0 };

	constructor(spec: RiverSpec, profile: (x: number) => number) {
		this.x0 = spec.x;
		this.halfWidth = spec.halfWidth;
		this.depth = spec.depth;
		this.bridgeHalf = spec.bridgeHalf;
		const a = profile(spec.x - spec.bridgeHalf - 6),
			b = profile(spec.x + spec.bridgeHalf + 6);
		this.deckY = Math.min(a, b) - 0.3;
		this.level = this.deckY - spec.clearance;
		// Banks rise from the water's edge to exactly deck height at the abutments.
		this.slope0 = (spec.clearance - BANK) / (spec.bridgeHalf - spec.halfWidth);
		this.path = this.trace();
		let x0 = Infinity,
			x1 = -Infinity,
			z0 = Infinity,
			z1 = -Infinity;
		for (const p of this.path) {
			x0 = Math.min(x0, p.x);
			x1 = Math.max(x1, p.x);
			z0 = Math.min(z0, p.z);
			z1 = Math.max(z1, p.z);
		}
		this.box = [x0, x1, z0, z1];
	}

	/** Walks the heading curve out from the bridge in both directions. */
	private trace(): RiverPoint[] {
		const zNear = TERRAIN_ROWS[TERRAIN_ROWS.length - 1];
		const down: RiverPoint[] = [];
		let x = this.x0,
			z = 0;
		for (let s = 0; z < zNear + 20; s -= STEP) {
			const h = heading(s - STEP / 2);
			x -= Math.sin(h) * STEP;
			z += Math.cos(h) * STEP;
			down.push(this.point(x, z, s - STEP));
		}
		const up: RiverPoint[] = [this.point(this.x0, 0, 0)];
		x = this.x0;
		z = 0;
		for (let s = 0; s < SOURCE; s += STEP) {
			const h = heading(s + STEP / 2);
			x += Math.sin(h) * STEP;
			z -= Math.cos(h) * STEP;
			up.push(this.point(x, z, s + STEP));
		}
		return [...down.reverse(), ...up];
	}

	private point(x: number, z: number, s: number): RiverPoint {
		const h = heading(s);
		// Width wanders away from the bridge, and the river thins to a creek at its source.
		const away = smoothstep(40, 120, Math.abs(s));
		const wander =
			1 +
			away *
				(0.2 * Math.sin(s / 61 + 0.7) +
					0.09 * Math.sin(s / 23 + 2.1) +
					0.04 * Math.sin(s / 6.7 + 0.4) +
					0.025 * Math.sin(s / 3.3 + 1.9));
		const taper = smoothstep(SOURCE, TAPER, s);
		return {
			x,
			z,
			s,
			nx: Math.cos(h),
			nz: Math.sin(h),
			hw: this.halfWidth * wander * lerp(0.22, 1, taper),
			depth: lerp(-1, this.depth, Math.min(taper * 1.6, 1))
		};
	}

	/**
	 * Nearest point on the centre line: a coarse pass over long segments, then
	 * the fine samples around the best one. The returned object is reused.
	 */
	channel(x: number, z: number): ChannelHit {
		const P = this.path;
		const n = P.length;
		let best = Infinity,
			bk = 0;
		for (let i = 0; i < n - 1; i += COARSE) {
			const j = Math.min(i + COARSE, n - 1);
			const d = segDist2(x, z, P[i], P[j]);
			if (d < best) {
				best = d;
				bk = i;
			}
		}
		best = Infinity;
		let bi = 0,
			bt = 0;
		const i1 = Math.min(n - 1, bk + COARSE * 2);
		for (let i = Math.max(0, bk - COARSE); i < i1; i++) {
			const a = P[i],
				b = P[i + 1];
			const ex = b.x - a.x,
				ez = b.z - a.z;
			const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
			const dx = x - a.x - ex * t,
				dz = z - a.z - ez * t;
			const d = dx * dx + dz * dz;
			if (d < best) {
				best = d;
				bi = i;
				bt = t;
			}
		}
		const a = P[bi],
			b = P[bi + 1];
		const h = this.hit;
		h.d = Math.sqrt(best);
		h.s = lerp(a.s, b.s, bt);
		h.hw = lerp(a.hw, b.hw, bt);
		h.depth = lerp(a.depth, b.depth, bt);
		return h;
	}

	/** Lateral distance from the channel centre. */
	offset(x: number, z: number): number {
		return this.channel(x, z).d;
	}

	/** Whether (x, z) lies in the water or within `margin` of it. */
	inChannel(x: number, z: number, margin = 0): boolean {
		if (!this.near(x, z, margin + this.halfWidth * 2)) return false;
		const c = this.channel(x, z);
		return c.d < c.hw + margin;
	}

	private near(x: number, z: number, r: number): boolean {
		const b = this.box;
		return x > b[0] - r && x < b[1] + r && z > b[2] - r && z < b[3] + r;
	}

	private wallSlope(s: number): number {
		// Gentle banks under the bridge, steeper valley walls back in the hills.
		return this.slope0 + smoothstep(25, 200, s) * 0.45;
	}

	/** Valley cross-section relative to the water surface (negative is under water). */
	private shape(c: ChannelHit): number {
		if (c.d < c.hw) return lerp(-c.depth, BANK, smoothstep(c.hw - SHOAL, c.hw, c.d));
		return BANK + (c.d - c.hw) * this.wallSlope(c.s);
	}

	/** Cuts the valley and channel into a natural height `h` at (x, z). */
	carve(x: number, z: number, h: number): number {
		if (!this.near(x, z, REACH)) return h;
		const c = this.channel(x, z);
		const shape = this.level + this.shape(c);
		if (c.d < c.hw) return shape;
		let out = Math.min(h, shape);
		const floor = this.level + BANK;
		if (out < floor) out = lerp(floor, out, smoothstep(c.hw + FILL, c.hw + FILL + FILL_FADE, c.d));
		return this.approach(x, z, out);
	}

	/** Road embankments up to the abutments, so the deck meets the road. */
	private approach(x: number, z: number, h: number): number {
		const road = 1 - smoothstep(5, 10, Math.abs(z));
		const along = Math.abs(x - this.x0) - this.bridgeHalf;
		if (road <= 0 || along < -1.5 || along > 45) return h;
		const ramp = this.deckY - Math.max(0, along) * 0.12;
		return lerp(h, Math.max(h, ramp), road);
	}

	/** Water surface height at (x, z), or -Infinity away from the river. */
	waterAt(x: number, z: number): number {
		if (!this.near(x, z, this.halfWidth * 2 + STRIP)) return -Infinity;
		const c = this.channel(x, z);
		return c.d < c.hw + STRIP && c.depth > 0 ? this.level : -Infinity;
	}

	/** Horizontal extent worth drawing water for. */
	extent(): [number, number] {
		return [this.box[0] - 60, this.box[1] + 60];
	}

	/**
	 * Flat water ribbon following the channel. Each vertex carries xyz plus
	 * its signed distance from the centre line, the local half-width and bed
	 * depth, so the shader can shade the shallows analytically.
	 */
	mesh(across = 10): { vertices: Float32Array; indices: Uint32Array } {
		const zNear = TERRAIN_ROWS[TERRAIN_ROWS.length - 1];
		const rows = this.path.filter((p, i) => i % 2 === 0 && p.z <= zNear && p.depth > -0.5);
		const cols = across + 1;
		const vertices = new Float32Array(rows.length * cols * 6);
		let o = 0;
		for (const p of rows) {
			const w = p.hw + STRIP;
			for (let i = 0; i < cols; i++) {
				const u = -w + (2 * w * i) / across;
				vertices[o++] = p.x + p.nx * u;
				vertices[o++] = this.level;
				vertices[o++] = p.z + p.nz * u;
				vertices[o++] = u;
				vertices[o++] = p.hw;
				vertices[o++] = p.depth;
			}
		}
		const indices = new Uint32Array((rows.length - 1) * across * 6);
		o = 0;
		for (let r = 0; r < rows.length - 1; r++) {
			for (let i = 0; i < across; i++) {
				const a = r * cols + i,
					b = a + 1,
					d = a + cols,
					e = d + 1;
				indices.set([a, b, d, b, e, d], o);
				o += 6;
			}
		}
		return { vertices, indices };
	}
}

function segDist2(x: number, z: number, a: RiverPoint, b: RiverPoint): number {
	const ex = b.x - a.x,
		ez = b.z - a.z;
	const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
	const dx = x - a.x - ex * t,
		dz = z - a.z - ez * t;
	return dx * dx + dz * dz;
}
