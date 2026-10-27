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
	x: 2850,
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

/**
 * A river flowing toward the camera, crossing the battle line under a bridge.
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
	private readonly slope0: number;

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
	}

	/**
	 * Channel centre line. It runs straight toward the camera: distant terrain
	 * rows are up to 90 m apart, and a bend between them would break the bank.
	 */
	centerX(_z: number): number {
		return this.x0;
	}

	halfWidthAt(_z: number): number {
		return this.halfWidth;
	}

	private wallSlope(z: number): number {
		// Gentle banks under the bridge, steeper valley walls back in the hills.
		return this.slope0 + smoothstep(-25, -200, z) * 0.45;
	}

	/** Lateral distance from the channel centre. */
	offset(x: number, z: number): number {
		return Math.abs(x - this.centerX(z));
	}

	/** Valley cross-section relative to the water surface (negative is under water). */
	private shape(d: number, z: number): number {
		const hw = this.halfWidthAt(z);
		if (d < hw) return lerp(-this.depth, BANK, smoothstep(hw - SHOAL, hw, d));
		return BANK + (d - hw) * this.wallSlope(z);
	}

	/** Cuts the valley and channel into a natural height `h` at (x, z). */
	carve(x: number, z: number, h: number): number {
		const d = this.offset(x, z);
		const shape = this.level + this.shape(d, z);
		const hw = this.halfWidthAt(z);
		if (d < hw) return shape;
		let out = Math.min(h, shape);
		const floor = this.level + BANK;
		if (out < floor) out = lerp(floor, out, smoothstep(hw + FILL, hw + FILL + FILL_FADE, d));
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
		return this.offset(x, z) < this.halfWidthAt(z) + STRIP ? this.level : -Infinity;
	}

	/** Horizontal extent worth drawing water for. */
	extent(): [number, number] {
		return [this.x0 - 140, this.x0 + 140];
	}

	/** Flat water strip following the channel: xyz positions and triangle indices. */
	mesh(across = 10): { vertices: Float32Array; indices: Uint32Array } {
		const rows = TERRAIN_ROWS;
		const cols = across + 1;
		const vertices = new Float32Array(rows.length * cols * 3);
		let o = 0;
		for (const z of rows) {
			const c = this.centerX(z),
				hw = this.halfWidthAt(z) + STRIP;
			for (let i = 0; i < cols; i++) {
				vertices[o++] = c - hw + (2 * hw * i) / across;
				vertices[o++] = this.level;
				vertices[o++] = z;
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
				indices.set([a, d, b, b, d, e], o);
				o += 6;
			}
		}
		return { vertices, indices };
	}
}
