import { clamp, lerp, smoothstep } from '../engine/math';
import { Noise } from '../engine/noise';
import { TERRAIN_ROWS, WORLD } from './constants';
import { River, type RiverSpec } from './river';

export const CHUNK_COLS = 64;
const MAX_DIG = 9;

interface HotZone {
	r0: number;
	r1: number;
	c0: number;
	c1: number;
}

/**
 * Deformable heightfield. Columns are spaced `dx` metres along X; rows sit at
 * the fixed Z values in TERRAIN_ROWS. Gameplay happens on the z = 0 row.
 */
export class Terrain {
	readonly minX: number;
	readonly maxX: number;
	readonly dx = 1;
	readonly cols: number;
	readonly rows = TERRAIN_ROWS.length;
	readonly zeroRow: number;
	readonly heights: Float32Array;
	readonly base: Float32Array;
	readonly normals: Float32Array;
	readonly scorch: Float32Array;
	readonly chunkCount: number;
	readonly dirtyChunks = new Set<number>();
	/** The river carved through the battlefield, if any. */
	readonly river: River | null;
	private readonly noise: Noise;
	private hotZones: HotZone[] = [];
	private coolTimer = 0;

	constructor(
		seed = 2024,
		minX: number = WORLD.terrainMinX,
		maxX: number = WORLD.terrainMaxX,
		river: RiverSpec | null = null
	) {
		this.noise = new Noise(seed);
		this.minX = minX;
		this.maxX = maxX;
		this.cols = Math.round((maxX - minX) / this.dx) + 1;
		this.zeroRow = TERRAIN_ROWS.indexOf(0);
		const n = this.cols * this.rows;
		this.heights = new Float32Array(n);
		this.base = new Float32Array(n);
		this.normals = new Float32Array(n * 3);
		this.scorch = new Float32Array(n);
		this.chunkCount = Math.ceil((this.cols - 1) / CHUNK_COLS);
		const prof = new Float32Array(this.cols);
		for (let c = 0; c < this.cols; c++) prof[c] = this.profile(this.minX + c * this.dx);
		this.river = river ? new River(river, (x) => this.profile(x)) : null;
		for (let r = 0; r < this.rows; r++) {
			const z = TERRAIN_ROWS[r];
			for (let c = 0; c < this.cols; c++) {
				const x = this.minX + c * this.dx;
				let h = this.generate(x, z, prof[c]);
				if (this.river) h = this.river.carve(x, z, h);
				this.heights[r * this.cols + c] = h;
				this.base[r * this.cols + c] = h;
			}
		}
		this.computeNormals(0, this.rows - 1, 0, this.cols - 1);
	}

	/** Height of the battle line before any craters. */
	profile(x: number): number {
		const n = this.noise;
		let h = n.fbm1(x * 0.0017, 4) * 24 + n.fbm1(x * 0.011 + 50, 3) * 4.5;
		h += n.fbm1(x * 0.06 + 9, 2) * 0.35;
		const flat =
			smoothstep(WORLD.baseMaxX + 170, WORLD.baseMaxX, x) *
			smoothstep(WORLD.baseMinX - 160, WORLD.baseMinX, x);
		return lerp(h, WORLD.baseHeight, flat);
	}

	private generate(x: number, z: number, profile: number): number {
		const n = this.noise;
		let h = profile;
		const road = 1 - smoothstep(3.5, 9, Math.abs(z));
		if (z < 0) {
			const t = smoothstep(-8, -110, z);
			const hills = (n.fbm2(x * 0.0042, z * 0.006, 4) * 0.5 + 0.5) * 26 + 3;
			const far = smoothstep(-110, -420, z) * (n.ridge2(x * 0.0021, z * 0.0035) * 26 + 6);
			h += t * hills + far;
		} else {
			const t = smoothstep(6, 80, z);
			h += n.fbm2(x * 0.011, z * 0.021, 3) * 3.5 * t - t * 9;
		}
		h += n.fbm2(x * 0.05, z * 0.05, 2) * 0.7 * (1 - road);
		// Keep the airbase apron flat in depth as well.
		const baseW =
			smoothstep(WORLD.baseMaxX + 120, WORLD.baseMaxX, x) *
			smoothstep(WORLD.baseMinX - 120, WORLD.baseMinX, x) *
			smoothstep(-90, -55, z) *
			smoothstep(40, 20, z);
		return lerp(h, WORLD.baseHeight, baseW);
	}

	colOf(x: number): number {
		return (x - this.minX) / this.dx;
	}

	/** Gameplay ground height on the z = 0 line. */
	heightAt(x: number): number {
		const fc = clamp(this.colOf(x), 0, this.cols - 1.001);
		const c = Math.floor(fc);
		const t = fc - c;
		const o = this.zeroRow * this.cols;
		return this.heights[o + c] * (1 - t) + this.heights[o + c + 1] * t;
	}

	/** Bilinear height anywhere on the grid. */
	heightAtXZ(x: number, z: number): number {
		const fc = clamp(this.colOf(x), 0, this.cols - 1.001);
		const c = Math.floor(fc);
		const tc = fc - c;
		const rows = TERRAIN_ROWS;
		let r = 0;
		if (z <= rows[0]) r = 0;
		else if (z >= rows[this.rows - 1]) r = this.rows - 2;
		else while (r < this.rows - 2 && rows[r + 1] < z) r++;
		const tr = clamp((z - rows[r]) / (rows[r + 1] - rows[r]), 0, 1);
		const H = this.heights,
			W = this.cols;
		const h0 = H[r * W + c] * (1 - tc) + H[r * W + c + 1] * tc;
		const h1 = H[(r + 1) * W + c] * (1 - tc) + H[(r + 1) * W + c + 1] * tc;
		return h0 * (1 - tr) + h1 * tr;
	}

	/** Slope angle (radians) of the battle line at x, positive when rising to +X. */
	slopeAt(x: number, span = 2): number {
		return Math.atan2(this.heightAt(x + span) - this.heightAt(x - span), span * 2);
	}

	/** Scorch level at x on the battle line (0 clean, 1 burnt). */
	scorchAt(x: number, z = 0): number {
		const c = Math.round(clamp(this.colOf(x), 0, this.cols - 1));
		let r = this.zeroRow;
		while (r > 0 && TERRAIN_ROWS[r] > z) r--;
		while (r < this.rows - 1 && TERRAIN_ROWS[r] < z) r++;
		return Math.min(this.scorch[r * this.cols + c], 1);
	}

	/**
	 * Blasts a bowl-shaped crater with a raised lip and scorches the ground.
	 * `heat` > 0 leaves glowing embers that cool over a few seconds.
	 */
	crater(cx: number, cz: number, radius: number, depth: number, scorchAmount = 1, heat = 0): void {
		const reach = radius * 1.65;
		const c0 = Math.max(1, Math.floor(this.colOf(cx - reach)));
		const c1 = Math.min(this.cols - 2, Math.ceil(this.colOf(cx + reach)));
		if (c1 < c0) return;
		let r0 = this.rows,
			r1 = -1;
		for (let r = 1; r < this.rows - 1; r++) {
			const z = TERRAIN_ROWS[r];
			if (Math.abs(z - cz) > reach) continue;
			r0 = Math.min(r0, r);
			r1 = Math.max(r1, r);
			for (let c = c0; c <= c1; c++) {
				const x = this.minX + c * this.dx;
				const d = Math.hypot(x - cx, z - cz) / radius;
				if (d >= 1.65) continue;
				let dh = 0;
				if (d < 1) dh -= depth * (1 - d * d);
				if (d > 0.85) dh += depth * 0.25 * Math.sin((Math.PI * (d - 0.85)) / 0.8);
				const i = r * this.cols + c;
				this.heights[i] = Math.max(this.heights[i] + dh, this.base[i] - MAX_DIG);
				const s = smoothstep(1.5, 0.35, d) * scorchAmount;
				const hot = smoothstep(1.0, 0.2, d) * heat;
				this.scorch[i] = Math.min(Math.max(this.scorch[i], s) + s * 0.15 + hot, 2);
			}
		}
		if (r1 < 0) return;
		this.computeNormals(r0 - 1, r1 + 1, c0 - 1, c1 + 1);
		this.markDirty(c0 - 1, c1 + 1);
		if (heat > 0) this.hotZones.push({ r0, r1, c0, c1 });
	}

	/** Burns the ground without deforming it (napalm, burning wrecks). */
	burn(cx: number, cz: number, radius: number, amount: number, heat = 0): void {
		this.crater(cx, cz, radius, 0, amount, heat);
	}

	/** Restores the untouched landscape (new game). */
	reset(): void {
		this.heights.set(this.base);
		this.scorch.fill(0);
		this.hotZones = [];
		this.computeNormals(0, this.rows - 1, 0, this.cols - 1);
		for (let k = 0; k < this.chunkCount; k++) this.dirtyChunks.add(k);
	}

	/** Lets glowing scorch marks cool back to plain charcoal. */
	update(dt: number): void {
		if (this.hotZones.length === 0) {
			this.coolTimer = 0;
			return;
		}
		this.coolTimer += dt;
		if (this.coolTimer < 0.2) return;
		const step = this.coolTimer * 0.22;
		this.coolTimer = 0;
		const keep: HotZone[] = [];
		for (const z of this.hotZones) {
			let stillHot = false;
			for (let r = z.r0; r <= z.r1; r++) {
				for (let c = z.c0; c <= z.c1; c++) {
					const i = r * this.cols + c;
					if (this.scorch[i] > 1) {
						this.scorch[i] = Math.max(1, this.scorch[i] - step);
						stillHot ||= this.scorch[i] > 1;
					}
				}
			}
			this.markDirty(z.c0, z.c1);
			if (stillHot) keep.push(z);
		}
		this.hotZones = keep;
	}

	private markDirty(c0: number, c1: number): void {
		const k0 = Math.max(0, Math.floor((c0 - 1) / CHUNK_COLS));
		const k1 = Math.min(this.chunkCount - 1, Math.floor((c1 + 1) / CHUNK_COLS));
		for (let k = k0; k <= k1; k++) this.dirtyChunks.add(k);
	}

	private computeNormals(r0: number, r1: number, c0: number, c1: number): void {
		const W = this.cols,
			H = this.heights,
			N = this.normals,
			rows = TERRAIN_ROWS;
		r0 = Math.max(0, r0);
		r1 = Math.min(this.rows - 1, r1);
		c0 = Math.max(0, c0);
		c1 = Math.min(W - 1, c1);
		for (let r = r0; r <= r1; r++) {
			const ra = Math.max(0, r - 1),
				rb = Math.min(this.rows - 1, r + 1);
			const dz = rows[rb] - rows[ra];
			for (let c = c0; c <= c1; c++) {
				const ca = Math.max(0, c - 1),
					cb = Math.min(W - 1, c + 1);
				const dhdx = (H[r * W + cb] - H[r * W + ca]) / ((cb - ca) * this.dx);
				const dhdz = (H[rb * W + c] - H[ra * W + c]) / dz;
				const l = Math.hypot(dhdx, 1, dhdz);
				const i = (r * W + c) * 3;
				N[i] = -dhdx / l;
				N[i + 1] = 1 / l;
				N[i + 2] = -dhdz / l;
			}
		}
	}

	chunkRange(k: number): [number, number] {
		const c0 = k * CHUNK_COLS;
		return [c0, Math.min(this.cols - 1, c0 + CHUNK_COLS)];
	}

	/** Interleaved position, normal, scorch for one chunk. */
	chunkVertices(k: number, out?: Float32Array): Float32Array {
		const [c0, c1] = this.chunkRange(k);
		const w = c1 - c0 + 1;
		const data = out ?? new Float32Array(w * this.rows * 7);
		let o = 0;
		for (let r = 0; r < this.rows; r++) {
			const z = TERRAIN_ROWS[r];
			for (let c = c0; c <= c1; c++) {
				const i = r * this.cols + c;
				data[o++] = this.minX + c * this.dx;
				data[o++] = this.heights[i];
				data[o++] = z;
				data[o++] = this.normals[i * 3];
				data[o++] = this.normals[i * 3 + 1];
				data[o++] = this.normals[i * 3 + 2];
				data[o++] = this.scorch[i];
			}
		}
		return data;
	}

	chunkIndices(k: number): Uint32Array {
		const [c0, c1] = this.chunkRange(k);
		const w = c1 - c0 + 1;
		const idx = new Uint32Array((w - 1) * (this.rows - 1) * 6);
		let o = 0;
		for (let r = 0; r < this.rows - 1; r++) {
			for (let c = 0; c < w - 1; c++) {
				const a = r * w + c,
					b = a + 1,
					d = a + w,
					e = d + 1;
				idx[o++] = a;
				idx[o++] = d;
				idx[o++] = b;
				idx[o++] = b;
				idx[o++] = d;
				idx[o++] = e;
			}
		}
		return idx;
	}
}
