import { BLAST_RATE, renderBlast, type Stereo } from './blast';

/** Audio graph pieces an explosion is played into. */
export interface BoomContext {
	ctx: AudioContext;
	/** Explosion bus. */
	out: AudioNode;
	/** Clean bus (for sounds that must not be distorted, like ear ringing). */
	dry: AudioNode;
	/** Reverb send. */
	reverb: AudioNode;
	bank: BoomBank;
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

interface BlastBuffers {
	/** Size class the buffers were rendered at. */
	power: number;
	body: AudioBuffer;
	near: AudioBuffer;
}

/**
 * Pre-rendered explosions: a few takes of each size class, ground and air,
 * rendered the first time they are needed and kept.
 */
export class BoomBank {
	static readonly GROUND = [0.4, 1, 2, 4];
	static readonly AIR = [0.4, 1, 2];
	static readonly TAKES = 3;
	private readonly cache = new Map<string, BlastBuffers>();

	constructor(private readonly ctx: Pick<BaseAudioContext, 'createBuffer'>) {}

	/** The size class closest to `power` on a log scale. */
	static classFor(power: number, air: boolean): number {
		const classes = air ? BoomBank.AIR : BoomBank.GROUND;
		let best = classes[0];
		for (const c of classes)
			if (Math.abs(Math.log(c / power)) < Math.abs(Math.log(best / power))) best = c;
		return best;
	}

	/**
	 * A take of the class closest to `power`. A take not rendered yet is swapped
	 * for one that is: rendering only happens here if the class has none at all.
	 */
	get(power: number, air: boolean, take: number): BlastBuffers {
		const cls = BoomBank.classFor(power, air);
		for (let i = 0; i < BoomBank.TAKES; i++) {
			const hit = this.cache.get(BoomBank.key(cls, air, (take + i) % BoomBank.TAKES));
			if (hit) return hit;
		}
		return this.render(cls, air, take);
	}

	/** Renders every take a little at a time after start-up, so blasts in play never wait. */
	warm(): void {
		const jobs: [number, boolean, number][] = [];
		for (let take = 0; take < BoomBank.TAKES; take++) {
			for (const p of BoomBank.GROUND) jobs.push([p, false, take]);
			for (const p of BoomBank.AIR) jobs.push([p, true, take]);
		}
		jobs.forEach(([p, air, take], i) =>
			setTimeout(
				() => {
					if (!this.cache.has(BoomBank.key(p, air, take))) this.render(p, air, take);
				},
				120 * (i + 1)
			)
		);
	}

	private static key(cls: number, air: boolean, take: number): string {
		return `${air ? 'a' : 'g'}${cls}:${take}`;
	}

	private render(cls: number, air: boolean, take: number): BlastBuffers {
		const seed = Math.round(cls * 1000) + take * 7919 + (air ? 104729 : 0);
		const blast = renderBlast({ power: cls, air, seed });
		const hit = { power: cls, body: this.buffer(blast.body), near: this.buffer(blast.near) };
		this.cache.set(BoomBank.key(cls, air, take), hit);
		return hit;
	}

	private buffer([l, r]: Stereo): AudioBuffer {
		const buf = this.ctx.createBuffer(2, l.length, BLAST_RATE);
		buf.getChannelData(0).set(l);
		buf.getChannelData(1).set(r);
		return buf;
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

function play(b: BoomContext, buf: AudioBuffer, t: number, rate: number, dest: AudioNode): void {
	const src = b.ctx.createBufferSource();
	src.buffer = buf;
	src.playbackRate.value = rate;
	src.connect(dest);
	src.start(t);
}

/**
 * One explosion: a pre-rendered blast (pressure-wave thump, fireball roar,
 * rolling rumble and echoes off the hills) muffled by distance, with the
 * crack, crackle and falling debris layered on top up close and — for the
 * biggest blasts at point blank — ringing ears. Returns how long the voice
 * lasts, in seconds.
 */
export function synthBoom(b: BoomContext, o: BoomParams): number {
	const { ctx } = b;
	const p = clamp(o.power, 0.15, 4.5);
	const q = Math.sqrt(p);
	const blast = b.bank.get(p, o.air, Math.floor(Math.random() * BoomBank.TAKES));
	// Between size classes a bigger blast plays a touch slower and deeper; slow motion drags it out.
	const rate = o.warp * Math.pow(blast.power / p, 0.2) * (0.94 + Math.random() * 0.1);
	const t = ctx.currentTime + o.delay + 0.005;
	const out = voiceOut(b, o, q);

	// Air soaks up the highs over distance: far-off blasts are dull thuds.
	const air = ctx.createBiquadFilter();
	air.type = 'lowpass';
	air.Q.value = 0.5;
	air.frequency.value = 600 + 15000 * o.near * o.near;
	air.connect(out);
	play(b, blast.body, t, rate, air);

	if (o.near > 0.03) {
		const close = ctx.createGain();
		close.gain.value = Math.pow(o.near, 1.2) * (o.air ? 1 : 0.85);
		close.connect(out);
		play(b, blast.near, t, rate, close);
	}
	if (p >= 3 && o.near > 0.35) earRing(b, t, o.near);
	return o.delay + blast.body.duration / rate + 0.2;
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
