/**
 * Offline explosion renderer. Real blasts are not tones: they are a pressure
 * wave (one huge push of air, then a pull), a roaring fireball, a grumble that
 * rolls around the hills and dirt raining back down. Rendering them sample by
 * sample lets each layer be shaped like that, with no oscillators to ring.
 */

/** Rate the blasts are rendered at: everything that matters in a boom sits below 12 kHz. */
export const BLAST_RATE = 24000;

export interface BlastSpec {
	/** Blast size: ~0.3 shell, 1 a 250 kg bomb, 4 the Thunderclap. */
	power: number;
	/** Airburst: sharper and brighter, no ground rumble or debris. */
	air: boolean;
	seed: number;
	sampleRate?: number;
}

export type Stereo = [Float32Array, Float32Array];

export interface Blast {
	sampleRate: number;
	/** Thump, fireball roar, rolling rumble and echoes: heard from any distance. */
	body: Stereo;
	/** Supersonic crack, fireball crackle and falling debris: only heard up close. */
	near: Stereo;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Small seeded generator so every rendered variant is repeatable. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** RBJ biquad, direct form I (safe to retune while running). */
class Biquad {
	private b0 = 1;
	private b1 = 0;
	private b2 = 0;
	private a1 = 0;
	private a2 = 0;
	private x1 = 0;
	private x2 = 0;
	private y1 = 0;
	private y2 = 0;

	constructor(private readonly sr: number) {}

	private set(f: number, q: number, kind: 'lp' | 'hp' | 'bp'): this {
		const w = (2 * Math.PI * clamp(f, 10, this.sr * 0.45)) / this.sr;
		const s = Math.sin(w),
			c = Math.cos(w);
		const alpha = s / (2 * q);
		const a0 = 1 + alpha;
		if (kind === 'lp') {
			this.b0 = (1 - c) / 2 / a0;
			this.b1 = (1 - c) / a0;
			this.b2 = this.b0;
		} else if (kind === 'hp') {
			this.b0 = (1 + c) / 2 / a0;
			this.b1 = -(1 + c) / a0;
			this.b2 = this.b0;
		} else {
			this.b0 = alpha / a0;
			this.b1 = 0;
			this.b2 = -alpha / a0;
		}
		this.a1 = (-2 * c) / a0;
		this.a2 = (1 - alpha) / a0;
		return this;
	}

	lowpass(f: number, q = Math.SQRT1_2): this {
		return this.set(f, q, 'lp');
	}

	highpass(f: number, q = Math.SQRT1_2): this {
		return this.set(f, q, 'hp');
	}

	bandpass(f: number, q: number): this {
		return this.set(f, q, 'bp');
	}

	step(x: number): number {
		const y =
			this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
		this.x2 = this.x1;
		this.x1 = x;
		this.y2 = this.y1;
		this.y1 = y;
		return y;
	}
}

/** Smooth random 0…1 drifting at about `rate` Hz: turbulence, swells, rolling. */
function wander(rand: () => number, n: number, sr: number, rate: number): Float32Array {
	const out = new Float32Array(n);
	const span = Math.max(1, Math.round(sr / rate));
	let a = rand(),
		b = rand();
	for (let i = 0; i < n; i++) {
		const k = i % span;
		if (k === 0 && i > 0) {
			a = b;
			b = rand();
		}
		const u = (1 - Math.cos((Math.PI * k) / span)) / 2;
		out[i] = a + (b - a) * u;
	}
	return out;
}

function white(rand: () => number): number {
	return rand() * 2 - 1;
}

/** Brown noise source: a leaky integral of white noise, all weight and no fizz. */
function brownSource(rand: () => number): () => number {
	let last = 0;
	return () => {
		last = (last + 0.02 * white(rand)) / 1.02;
		return last * 3.5;
	};
}

function peak(...chans: Float32Array[]): number {
	let m = 0;
	for (const c of chans) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
	return m;
}

function normalize(to: number, ...chans: Float32Array[]): void {
	const m = peak(...chans);
	if (m <= 0) return;
	const k = to / m;
	for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= k;
}

/** Fast attack, then a quick drop into a slower tail — how a fireball dies down. */
function decay(t: number, attack: number, tau: number, tail = 0.35, tailStretch = 3.5): number {
	if (t < attack) return t / attack;
	const s = t - attack;
	return (1 - tail) * Math.exp(-s / tau) + tail * Math.exp(-s / (tau * tailStretch));
}

/**
 * The blast wave itself: a Friedlander pulse (instant overpressure, then the
 * suction behind it). Low-passed it is the thump you feel in your chest.
 */
function pressureWave(n: number, sr: number, td: number, cutoff: number): Float32Array {
	const out = new Float32Array(n);
	const lp = new Biquad(sr).lowpass(cutoff, 0.6);
	const lp2 = new Biquad(sr).lowpass(cutoff * 1.6, 0.6);
	// The pulse is over in a few tens of milliseconds; the filters settle soon after.
	const end = Math.min(n, Math.round(sr * (td * 10 + 0.3)));
	for (let i = 0; i < end; i++) {
		const t = i / sr;
		const x = t < td * 10 ? (1 - t / td) * Math.exp((-1.6 * t) / td) : 0;
		out[i] = lp2.step(lp.step(x));
	}
	normalize(1, out);
	return out;
}

/** Brown noise under a low-pass: the mass of the thump, non-tonal. */
function subBody(
	n: number,
	sr: number,
	rand: () => number,
	cutoff: number,
	tau: number
): Float32Array {
	const out = new Float32Array(n);
	const src = brownSource(rand);
	const a = new Biquad(sr).lowpass(cutoff, 0.7);
	const b = new Biquad(sr).lowpass(cutoff, 0.7);
	for (let i = 0; i < n; i++) out[i] = b.step(a.step(src())) * decay(i / sr, 0.004, tau, 0.25, 3);
	normalize(1, out);
	return out;
}

/** The fireball: white noise behind a low-pass that closes as it burns out, churned by turbulence. */
function roar(
	n: number,
	sr: number,
	rand: () => number,
	f0: number,
	tau: number,
	shared: Float32Array | null
): Float32Array {
	const out = new Float32Array(n);
	const a = new Biquad(sr);
	const b = new Biquad(sr);
	const turb = wander(rand, n, sr, 22);
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		if (i % 16 === 0) {
			const f = 160 + (f0 - 160) * Math.exp(-t / (tau * 2));
			a.lowpass(f, 0.55);
			b.lowpass(f * 1.3, 0.55);
		}
		// Mostly the same fireball in both ears, with a little width.
		const x = shared ? 0.75 * shared[i] + 0.25 * white(rand) : white(rand);
		out[i] = b.step(a.step(x)) * decay(t, 0.002, tau) * (0.55 + 0.45 * turb[i]);
	}
	normalize(1, out);
	return out;
}

/** Low-mid grumble that rolls and swells: what you actually hear of a boom on headphones. */
function grumble(
	n: number,
	sr: number,
	rand: () => number,
	centre: number,
	tau: number
): Float32Array {
	const out = new Float32Array(n);
	const bp = new Biquad(sr).bandpass(centre, 0.9);
	const lp = new Biquad(sr).lowpass(centre * 2.4, 0.7);
	const roll = wander(rand, n, sr, 7);
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		const swell = 0.3 + 0.7 * roll[i] * Math.sqrt(roll[i]);
		out[i] = lp.step(bp.step(white(rand))) * decay(t, 0.01, tau, 0.4, 2.5) * swell;
	}
	normalize(1, out);
	return out;
}

/** Rolling thunder: deep brown noise rising late and swelling for seconds. */
function rumble(
	n: number,
	sr: number,
	rand: () => number,
	rise: number,
	tau: number
): Float32Array {
	const out = new Float32Array(n);
	const src = brownSource(rand);
	const a = new Biquad(sr).lowpass(120, 0.7);
	const b = new Biquad(sr).lowpass(150, 0.7);
	const swell = wander(rand, n, sr, 2.5);
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		const env = Math.min(1, t / rise) * Math.exp(-t / tau);
		out[i] = b.step(a.step(src())) * env * (0.35 + 0.65 * swell[i]);
	}
	normalize(1, out);
	return out;
}

/** The N-wave of the shock front: a sharp crack, then a short snap of noise. */
function crack(L: Float32Array, R: Float32Array, sr: number, rand: () => number, q: number): void {
	const tn = 0.0012 + 0.0012 * q;
	const hpL = new Biquad(sr).highpass(1200);
	const hpR = new Biquad(sr).highpass(1200);
	const n = Math.min(L.length, Math.round(sr * 0.08));
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		const nWave = t < tn ? 1 - (2 * t) / tn : 0;
		const snap = Math.exp(-t / 0.012) * 0.55;
		const s = white(rand);
		L[i] += nWave + hpL.step(0.7 * s + 0.3 * white(rand)) * snap;
		R[i] += nWave + hpR.step(0.7 * s + 0.3 * white(rand)) * snap;
	}
}

/** One short burst of filtered noise placed in the stereo field (crackle, clods, stones). */
function grain(
	L: Float32Array,
	R: Float32Array,
	sr: number,
	rand: () => number,
	at: number,
	dur: number,
	cutoff: number,
	amp: number,
	pan: number
): void {
	const start = Math.round(at * sr);
	const n = Math.min(L.length - start, Math.round(dur * sr));
	if (n <= 0) return;
	const lp = new Biquad(sr).lowpass(cutoff, 0.6);
	const gl = Math.cos(((pan + 1) * Math.PI) / 4) * amp;
	const gr = Math.sin(((pan + 1) * Math.PI) / 4) * amp;
	const tau = dur / 3.5;
	for (let i = 0; i < n; i++) {
		const t = i / sr;
		const v = lp.step(white(rand)) * Math.min(1, t / 0.0015) * Math.exp(-t / tau);
		L[start + i] += v * gl;
		R[start + i] += v * gr;
	}
}

/** Duller, later copies of the blast thrown back by the hills, alternating sides. */
function echoes(
	L: Float32Array,
	R: Float32Array,
	src: Float32Array,
	sr: number,
	rand: () => number,
	q: number
): void {
	const lp = new Biquad(sr).lowpass(650, 0.6);
	const lp2 = new Biquad(sr).lowpass(650, 0.6);
	const dull = src.map((v) => lp2.step(lp.step(v)));
	const stretch = 0.85 + 0.2 * q;
	const taps = [
		{ d: 0.32 + 0.12 * rand(), g: 0.32, side: -0.6 },
		{ d: 0.75 + 0.25 * rand(), g: 0.2, side: 0.7 },
		{ d: 1.3 + 0.4 * rand(), g: 0.11, side: -0.2 }
	];
	for (const tap of taps) {
		const off = Math.round(tap.d * stretch * sr);
		const gl = tap.g * (1 - tap.side * 0.6);
		const gr = tap.g * (1 + tap.side * 0.6);
		for (let i = off; i < L.length; i++) {
			L[i] += dull[i - off] * gl;
			R[i] += dull[i - off] * gr;
		}
	}
}

function highpass(f: number, sr: number, ...chans: Float32Array[]): void {
	for (const c of chans) {
		const a = new Biquad(sr).highpass(f);
		const b = new Biquad(sr).highpass(f);
		for (let i = 0; i < c.length; i++) c[i] = b.step(a.step(c[i]));
	}
}

/** Gentle tanh saturation: rounds the peak of the pressure wave and lifts the body. */
function saturate(drive: number, ...chans: Float32Array[]): void {
	const norm = Math.tanh(drive);
	for (const c of chans) for (let i = 0; i < c.length; i++) c[i] = Math.tanh(drive * c[i]) / norm;
}

function fadeOut(frac: number, ...chans: Float32Array[]): void {
	for (const c of chans) {
		const n = Math.round(c.length * frac);
		for (let i = 0; i < n; i++) {
			const u = i / n;
			c[c.length - n + i] *= 0.5 + 0.5 * Math.cos(Math.PI * u);
		}
	}
}

/** Renders one explosion as two stereo layers. Bigger blasts are longer, deeper and roll on. */
export function renderBlast(spec: BlastSpec): Blast {
	const sr = spec.sampleRate ?? BLAST_RATE;
	const p = clamp(spec.power, 0.15, 4.5);
	const q = Math.sqrt(p);
	const air = spec.air;
	const rand = mulberry32(spec.seed);
	const n = Math.round(sr * (air ? 1 + 1.5 * q : 1.2 + 2.2 * q));

	// Big fireballs roar lower and longer.
	const tauRoar = air ? 0.07 + 0.08 * q : 0.1 + 0.14 * q;
	const press = pressureWave(n, sr, air ? 0.003 + 0.003 * q : 0.004 + 0.005 * q, air ? 380 : 320);
	const sub = subBody(
		n,
		sr,
		rand,
		(air ? 170 : 140) / Math.pow(q, 0.2),
		air ? 0.12 + 0.12 * q : 0.2 + 0.28 * q
	);
	const fireball = new Float32Array(n).map(() => white(rand));
	const f0 = (air ? 6000 : 3600) / Math.pow(q, 0.3);
	const roarL = roar(n, sr, rand, f0, tauRoar, fireball);
	const roarR = roar(n, sr, rand, f0, tauRoar, fireball);
	const centre = 320 / Math.pow(q, 0.25);
	const tauMid = air ? 0.25 + 0.3 * q : 0.35 + 0.45 * q;
	const midL = grumble(n, sr, rand, centre, tauMid);
	const midR = grumble(n, sr, rand, centre, tauMid);
	const rolls = !air && p >= 0.45;
	const rise = 0.08 + 0.08 * q,
		tauRumble = 0.45 + 0.6 * q;
	const rumbleL = rolls ? rumble(n, sr, rand, rise, tauRumble) : null;
	const rumbleR = rolls ? rumble(n, sr, rand, rise, tauRumble) : null;

	const [wP, wS, wR, wM, wU] = air
		? [0.75, 0.35, 0.7, 0.3, 0]
		: [0.8, 0.65 + 0.12 * q, 0.6, 0.6, 0.5 * Math.min(1, p)];
	const L = new Float32Array(n),
		R = new Float32Array(n);
	const mono = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const core = wP * press[i] + wS * sub[i];
		L[i] = core + wR * roarL[i] + wM * midL[i] + (rumbleL ? wU * rumbleL[i] : 0);
		R[i] = core + wR * roarR[i] + wM * midR[i] + (rumbleR ? wU * rumbleR[i] : 0);
		mono[i] = 0.5 * core + 0.5 * wR * (roarL[i] + roarR[i]) + 0.5 * wM * (midL[i] + midR[i]);
	}
	if (p >= 0.9) echoes(L, R, mono, sr, rand, q);
	// Nothing below ~30 Hz: headphones can't play it and it only eats headroom.
	highpass(30, sr, L, R);
	normalize(1, L, R);
	saturate(1.8, L, R);
	fadeOut(0.2, L, R);
	normalize(0.95, L, R);

	return { sampleRate: sr, body: [L, R], near: renderNear(sr, p, q, air, rand) };
}

/** The close-up layer: crack, crackle of the fireball and debris pattering down. */
function renderNear(sr: number, p: number, q: number, air: boolean, rand: () => number): Stereo {
	const debris = !air && p >= 0.6;
	const spread = 1.2 + 0.8 * q;
	const n = Math.round(sr * (debris ? 0.5 + spread : 0.6));
	const L = new Float32Array(n),
		R = new Float32Array(n);
	crack(L, R, sr, rand, q);
	const crackleSpan = 0.15 + 0.35 * q;
	const crackles = Math.round(10 + 25 * q);
	for (let i = 0; i < crackles; i++) {
		const u = rand() * rand();
		const at = 0.005 + crackleSpan * u;
		grain(
			L,
			R,
			sr,
			rand,
			at,
			0.001 + 0.003 * rand(),
			3500,
			(0.1 + 0.3 * rand()) * (1 - u),
			rand() * 2 - 1
		);
	}
	if (debris) {
		// Clods of earth, stones and bits of whatever was hit, thumping back down.
		const count = Math.round(6 + 7 * Math.min(q, 2));
		for (let i = 0; i < count; i++) {
			const u = Math.pow(rand(), 0.7);
			const at = 0.3 + u * spread;
			const size = rand();
			const amp = (0.15 + 0.4 * size) * (1 - 0.4 * u);
			const cutoff = 2200 - 1600 * size;
			const pan = rand() * 2 - 1;
			grain(L, R, sr, rand, at, 0.015 + 0.035 * size, cutoff, amp, pan);
			const bounces = Math.floor(rand() * 3);
			for (let k = 1; k <= bounces; k++)
				grain(
					L,
					R,
					sr,
					rand,
					at + k * (0.03 + 0.05 * rand()),
					0.012,
					cutoff * 1.2,
					(amp * 0.35) / k,
					pan
				);
		}
	}
	normalize(0.9, L, R);
	return [L, R];
}

/**
 * Impulse response for the shared reverb: open air, not a room. A few slaps
 * off the terrain, then a tail whose highs die off fast so nothing rings.
 */
export function outdoorImpulse(sr: number, seconds: number, seed = 7): Stereo {
	const n = Math.round(sr * seconds);
	const out: Stereo = [new Float32Array(n), new Float32Array(n)];
	const tau = seconds / 6.9;
	for (let c = 0; c < 2; c++) {
		const rand = mulberry32(seed + c * 101);
		const d = out[c];
		const lp = new Biquad(sr);
		for (let i = 0; i < n; i++) {
			const t = i / sr;
			if (i % 32 === 0) lp.lowpass(250 + 6000 * Math.exp(-t / 0.3), 0.6);
			const onset = Math.min(1, Math.max(0, (t - 0.012) / 0.03));
			d[i] = lp.step(white(rand)) * onset * Math.exp(-t / tau);
		}
		for (let k = 0; k < 8; k++) {
			const at = 0.02 + rand() * 0.28;
			const g = (0.6 - at) * (0.6 + 0.4 * rand());
			grain(d, d, sr, rand, at, 0.004, 2500, g * 0.7, 0);
		}
	}
	return out;
}
