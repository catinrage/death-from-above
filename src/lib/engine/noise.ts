import { Rng } from './rng';

/** Seeded gradient noise in 1D and 2D, plus fractal sums. Output is roughly in [-1, 1]. */
export class Noise {
	private readonly perm = new Uint8Array(512);
	private readonly grad1 = new Float32Array(256);

	constructor(seed = 1337) {
		const rng = new Rng(seed);
		const p = new Uint8Array(256);
		for (let i = 0; i < 256; i++) p[i] = i;
		for (let i = 255; i > 0; i--) {
			const j = Math.floor(rng.next() * (i + 1));
			const t = p[i];
			p[i] = p[j];
			p[j] = t;
		}
		for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
		for (let i = 0; i < 256; i++) this.grad1[i] = rng.range(-1, 1);
	}

	noise1(x: number): number {
		const i = Math.floor(x);
		const f = x - i;
		const g0 = this.grad1[this.perm[i & 255]];
		const g1 = this.grad1[this.perm[(i + 1) & 255]];
		const u = f * f * f * (f * (f * 6 - 15) + 10);
		return (g0 * f + (g1 * (f - 1) - g0 * f) * u) * 2;
	}

	noise2(x: number, y: number): number {
		const xi = Math.floor(x),
			yi = Math.floor(y);
		const xf = x - xi,
			yf = y - yi;
		const X = xi & 255,
			Y = yi & 255;
		const p = this.perm;
		const aa = p[p[X] + Y],
			ab = p[p[X] + Y + 1],
			ba = p[p[X + 1] + Y],
			bb = p[p[X + 1] + Y + 1];
		const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
		const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
		const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
		const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
		return lerp(x1, x2, v) * 1.4;
	}

	fbm1(x: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
		let sum = 0,
			amp = 1,
			norm = 0,
			f = 1;
		for (let o = 0; o < octaves; o++) {
			sum += this.noise1(x * f + o * 17.31) * amp;
			norm += amp;
			amp *= gain;
			f *= lacunarity;
		}
		return sum / norm;
	}

	fbm2(x: number, y: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
		let sum = 0,
			amp = 1,
			norm = 0,
			f = 1;
		for (let o = 0; o < octaves; o++) {
			sum += this.noise2(x * f + o * 31.7, y * f - o * 12.9) * amp;
			norm += amp;
			amp *= gain;
			f *= lacunarity;
		}
		return sum / norm;
	}

	/** Ridged fractal noise in [0, 1] — sharp crests for mountain silhouettes. */
	ridge2(x: number, y: number, octaves = 5): number {
		let sum = 0,
			amp = 0.5,
			f = 1,
			prev = 1;
		for (let o = 0; o < octaves; o++) {
			let n = 1 - Math.abs(this.noise2(x * f, y * f));
			n *= n;
			sum += n * amp * prev;
			prev = n;
			amp *= 0.5;
			f *= 2.1;
		}
		return sum;
	}
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function grad2(hash: number, x: number, y: number): number {
	switch (hash & 7) {
		case 0:
			return x + y;
		case 1:
			return -x + y;
		case 2:
			return x - y;
		case 3:
			return -x - y;
		case 4:
			return x;
		case 5:
			return -x;
		case 6:
			return y;
		default:
			return -y;
	}
}

/**
 * Builds a seamlessly tiling RGBA noise image. Each channel holds fractal value
 * noise at a different base frequency so shaders can layer detail with one fetch.
 */
export function buildTilingNoise(size: number, seed = 7): Uint8Array {
	const rng = new Rng(seed);
	const lattice = new Float32Array(256 * 256);
	for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
	const out = new Uint8Array(size * size * 4);
	const baseFreqs = [4, 8, 16, 32];

	const value = (x: number, y: number, period: number, salt: number): number => {
		const xi = Math.floor(x),
			yi = Math.floor(y);
		const fx = x - xi,
			fy = y - yi;
		const ux = fx * fx * (3 - 2 * fx),
			uy = fy * fy * (3 - 2 * fy);
		const at = (ix: number, iy: number): number => {
			const wx = ((ix % period) + period) % period;
			const wy = ((iy % period) + period) % period;
			return lattice[((wx * 7 + salt * 31) & 255) * 256 + ((wy * 13 + salt * 17) & 255)];
		};
		const a = at(xi, yi),
			b = at(xi + 1, yi),
			c = at(xi, yi + 1),
			d = at(xi + 1, yi + 1);
		return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
	};

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			for (let ch = 0; ch < 4; ch++) {
				let sum = 0,
					amp = 0.5,
					norm = 0;
				let freq = baseFreqs[ch];
				for (let o = 0; o < 4; o++) {
					sum += value((x / size) * freq, (y / size) * freq, freq, ch * 5 + o) * amp;
					norm += amp;
					amp *= 0.5;
					freq *= 2;
				}
				const v = sum / norm;
				// Stretch contrast a little; fractal sums cluster around 0.5.
				const s = Math.min(1, Math.max(0, (v - 0.5) * 1.6 + 0.5));
				out[(y * size + x) * 4 + ch] = Math.round(s * 255);
			}
		}
	}
	return out;
}
