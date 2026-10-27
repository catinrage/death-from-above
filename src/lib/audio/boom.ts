/** Audio graph pieces an explosion is rendered into. */
export interface BoomContext {
	ctx: AudioContext;
	/** Saturating explosion bus. */
	out: AudioNode;
	/** Clean bus (for sounds that must not be distorted, like ear ringing). */
	dry: AudioNode;
	/** Reverb send. */
	reverb: AudioNode;
	white: AudioBuffer;
	brown: AudioBuffer;
}

export interface BoomParams {
	/** Blast size: ~0.3 shell, 1 a 250 kg bomb, 4 the Thunderclap. */
	power: number;
	pan: number;
	/** Distance-attenuated loudness. */
	level: number;
	/** 0 far away … 1 point blank: adds the crack, debris and ear ringing. */
	near: number;
	/** Seconds until the sound arrives (light is faster than sound). */
	delay: number;
	/** 1 normally; below 1 in slow motion (deeper and longer). */
	warp: number;
	/** Airburst: sharper crack, no ground rumble. */
	air: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Soft clipping curve: tanh drive normalised to ±1. */
export function softClipCurve(drive: number, n = 2048): Float32Array<ArrayBuffer> {
	const curve = new Float32Array(n);
	const norm = Math.tanh(drive);
	for (let i = 0; i < n; i++) {
		const x = (i / (n - 1)) * 2 - 1;
		curve[i] = Math.tanh(drive * x) / norm;
	}
	return curve;
}

function source(
	ctx: AudioContext,
	buf: AudioBuffer,
	t: number,
	dur: number
): AudioBufferSourceNode {
	const src = ctx.createBufferSource();
	src.buffer = buf;
	src.loop = true;
	src.start(t, Math.random() * buf.duration * 0.6);
	src.stop(t + dur + 0.1);
	return src;
}

/** Filtered noise with a punchy attack, a quick drop to a sustain and a long exponential tail. */
function noiseHit(
	b: BoomContext,
	dest: AudioNode,
	buf: AudioBuffer,
	t: number,
	dur: number,
	type: BiquadFilterType,
	f0: number,
	f1: number,
	peak: number,
	sustain = 0.4
): void {
	const { ctx } = b;
	const filter = ctx.createBiquadFilter();
	filter.type = type;
	filter.Q.value = 0.7;
	filter.frequency.setValueAtTime(f0, t);
	filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur * 0.75);
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
	g.gain.exponentialRampToValueAtTime(Math.max(peak * sustain, 0.0002), t + 0.008 + dur * 0.16);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	source(ctx, buf, t, dur).connect(filter);
	filter.connect(g);
	g.connect(dest);
}

/** Oscillator whose pitch falls while it decays — the chest-punch thump. */
function drop(
	b: BoomContext,
	dest: AudioNode,
	t: number,
	dur: number,
	type: OscillatorType,
	f0: number,
	f1: number,
	peak: number
): void {
	const { ctx } = b;
	const osc = ctx.createOscillator();
	osc.type = type;
	osc.frequency.setValueAtTime(f0, t);
	osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur * 0.8);
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(g);
	g.connect(dest);
	osc.start(t);
	osc.stop(t + dur + 0.05);
}

/** Low rolling thunder: brown noise with slow random swells. */
function rumble(
	b: BoomContext,
	dest: AudioNode,
	t: number,
	dur: number,
	cutoff: number,
	peak: number
): void {
	const { ctx } = b;
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = cutoff;
	lp.Q.value = 0.6;
	const g = ctx.createGain();
	g.gain.value = 0;
	const n = 48;
	const curve = new Float32Array(n);
	let wobble = 1;
	for (let i = 0; i < n; i++) {
		const u = i / (n - 1);
		const env = Math.min(1, u * 8) * Math.pow(1 - u, 1.5);
		wobble = clamp(wobble + (Math.random() - 0.5) * 0.55, 0.5, 1.4);
		curve[i] = env * wobble * peak;
	}
	g.gain.setValueCurveAtTime(curve, t, dur);
	source(ctx, b.brown, t, dur).connect(lp);
	lp.connect(g);
	g.connect(dest);
}

/** Clods and fragments pattering back down. */
function debris(
	b: BoomContext,
	dest: AudioNode,
	t: number,
	count: number,
	near: number,
	stretch: number
): void {
	for (let i = 0; i < count; i++) {
		const at = t + (0.35 + Math.random() * 1.7) * stretch;
		const f = 1300 + Math.random() * 2600;
		noiseHit(
			b,
			dest,
			b.white,
			at,
			0.03 + Math.random() * 0.03,
			'bandpass',
			f,
			f * 0.8,
			(0.05 + Math.random() * 0.08) * near,
			0.3
		);
	}
}

/** High whine in the ears after a point-blank blast. */
function earRing(b: BoomContext, t: number, strength: number): void {
	const { ctx } = b;
	const osc = ctx.createOscillator();
	osc.type = 'sine';
	osc.frequency.value = 3400 + Math.random() * 500;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.setValueAtTime(0.0001, t + 0.12);
	g.gain.exponentialRampToValueAtTime(0.045 * strength, t + 0.6);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
	osc.connect(g);
	g.connect(b.dry);
	osc.start(t);
	osc.stop(t + 5.1);
}

/** Slap-back echoes off the hills: duller, later copies of the blast roar. */
function echoes(
	b: BoomContext,
	dest: AudioNode,
	t: number,
	q: number,
	warp: number,
	stretch: number
): void {
	for (let i = 0; i < 2; i++) {
		const at = t + (0.38 + i * 0.55 + Math.random() * 0.25) * stretch;
		const dur = (0.5 + 0.35 * q) * stretch;
		noiseHit(b, dest, b.white, at, dur, 'lowpass', 900 * warp, 140 * warp, 0.2 / (1 + i), 0.5);
	}
}

/**
 * One explosion, layered: supersonic crack, a crunchy mid-range roar, a
 * brown-noise body under a closing low-pass (the "boom"), a punchy kick and a
 * sub thump that both drop in pitch, a rolling rumble with echoes off the
 * hills, debris and — for the biggest blasts up close — ringing ears.
 * Everything scales with `power`. Returns how long the voice lasts, in seconds.
 */
export function synthBoom(b: BoomContext, o: BoomParams): number {
	const { ctx } = b;
	const p = clamp(o.power, 0.15, 4.5);
	const q = Math.sqrt(p);
	const warp = o.warp;
	const stretch = 1 / warp;
	const t = ctx.currentTime + o.delay + 0.005;
	const out = voiceOut(b, o, q);

	if (o.near > 0.03) {
		const crack = (0.45 + 0.5 * o.near) * (o.air ? 1.3 : 1);
		noiseHit(
			b,
			out,
			b.white,
			t,
			(0.06 + 0.05 * q) * stretch,
			'highpass',
			2400 * warp,
			800 * warp,
			crack,
			0.35
		);
	}
	// Distance and size both darken the blast: air absorbs the highs, big fireballs roar lower.
	const bright = (0.55 + 0.6 * o.near) / Math.pow(q, 0.3);
	const roar = (0.55 + 0.6 * q) * stretch;
	noiseHit(
		b,
		out,
		b.white,
		t + 0.006,
		roar,
		'lowpass',
		(o.air ? 5200 : 3600) * bright * warp,
		160 * warp,
		0.55,
		0.32
	);
	const body = (0.9 + 1.25 * q) * stretch;
	noiseHit(
		b,
		out,
		b.brown,
		t,
		body,
		'lowpass',
		900 * bright * warp,
		55 * warp,
		0.95,
		o.air ? 0.3 : 0.45
	);
	const kick = (o.air ? 150 : 128 - 12 * Math.min(q, 2)) * warp;
	drop(b, out, t, (0.2 + 0.12 * q) * stretch, 'sine', kick, 40 * warp, 0.75);
	drop(
		b,
		out,
		t,
		(0.4 + 0.32 * q) * stretch,
		'sine',
		kick * 0.6,
		24 * warp,
		1.1 * Math.min(1.25, 0.7 + 0.3 * q)
	);
	drop(b, out, t, (0.26 + 0.2 * q) * stretch, 'triangle', kick * 1.4, 48 * warp, 0.22);
	let tail = body;
	if (p >= 0.75 && !o.air) {
		tail = body * (1.4 + 0.3 * q);
		rumble(b, out, t + 0.04 * stretch, tail, (125 + 45 * o.near) * warp, 0.32 + 0.18 * q);
	}
	if (p >= 1.5) echoes(b, out, t, q, warp, stretch);
	if (p >= 0.9 && o.near > 0.15)
		debris(b, out, t, Math.round(5 + 4 * Math.min(p, 2.5)), o.near, stretch);
	if (p >= 3 && o.near > 0.35) earRing(b, t, o.near);
	return o.delay + tail + 0.3;
}

/** Per-voice level and pan feeding the explosion bus, plus its reverb send. */
function voiceOut(b: BoomContext, o: BoomParams, q: number): GainNode {
	const { ctx } = b;
	const out = ctx.createGain();
	out.gain.value = o.level;
	const pan = ctx.createStereoPanner();
	pan.pan.value = o.pan;
	out.connect(pan);
	pan.connect(b.out);
	const wet = ctx.createGain();
	wet.gain.value = 0.16 + (1 - o.near) * 0.6 + q * 0.08;
	pan.connect(wet);
	wet.connect(b.reverb);
	return out;
}
