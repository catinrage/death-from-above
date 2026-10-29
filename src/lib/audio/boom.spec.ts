import { describe, expect, it } from 'vitest';
import { BoomBank, softClipCurve, synthBoom, type BoomContext, type BoomParams } from './boom';

interface FakeParam {
	value: number;
	/** Time and value of the earliest automation event. */
	first: number;
	firstValue: number;
}

interface FakeOsc {
	started: number;
	dest: { gain?: FakeParam } | null;
}

/** Records what an explosion voice plays, standing in for Web Audio. */
function recorder() {
	const made = {
		oscs: [] as FakeOsc[],
		plays: [] as { length: number; rate: number; at: number }[],
		renders: 0
	};
	const param = (initial: number) => ({
		value: initial,
		first: Infinity,
		firstValue: NaN,
		note(v: number, t: number) {
			if (t < this.first) {
				this.first = t;
				this.firstValue = v;
			}
		},
		setValueAtTime(v: number, t: number) {
			this.note(v, t);
			return this;
		},
		exponentialRampToValueAtTime(v: number, t: number) {
			this.note(v, t);
			return this;
		}
	});
	const node = () => ({ connect: () => undefined });
	const ctx = {
		currentTime: 0,
		createGain: () => ({ ...node(), gain: param(1) }),
		createStereoPanner: () => ({ ...node(), pan: param(0) }),
		createBiquadFilter: () => ({ ...node(), Q: param(1), frequency: param(350), type: '' }),
		createOscillator() {
			const o = {
				type: '',
				frequency: param(440),
				started: NaN,
				dest: null as FakeOsc['dest'],
				connect(n: FakeOsc['dest']) {
					o.dest = n;
				},
				start(t: number) {
					o.started = t;
				},
				stop: () => undefined
			};
			made.oscs.push(o);
			return o;
		},
		createBuffer(channels: number, length: number, sampleRate: number) {
			if (channels === 2 && length > sampleRate) made.renders++;
			const data = Array.from({ length: channels }, () => new Float32Array(length));
			return {
				length,
				sampleRate,
				duration: length / sampleRate,
				getChannelData: (c: number) => data[c]
			};
		},
		createBufferSource() {
			const s = {
				...node(),
				buffer: null as { length: number; duration: number } | null,
				playbackRate: param(1),
				start(t: number) {
					made.plays.push({ length: s.buffer?.duration ?? 0, rate: s.playbackRate.value, at: t });
				}
			};
			return s;
		}
	};
	const bank = new BoomBank(ctx as unknown as BaseAudioContext);
	const b = { ctx, out: node(), dry: node(), reverb: node(), bank };
	return { b: b as unknown as BoomContext, made };
}

// One shared bank: rendering is the slow part, and every test may reuse its takes.
const shared = recorder();

const boom = (o: Partial<BoomParams>) => {
	const { b, made } = shared;
	made.oscs.length = 0;
	made.plays.length = 0;
	const life = synthBoom(b, {
		power: 1,
		pan: 0,
		level: 1,
		near: 0.6,
		delay: 0,
		warp: 1,
		air: false,
		...o
	});
	return { life, oscs: [...made.oscs], plays: [...made.plays] };
};

describe('explosion voice', () => {
	it('rings on longer the bigger the blast', () => {
		const lives = [0.4, 1, 1.8, 4].map((power) => boom({ power }).life);
		for (let i = 1; i < lives.length; i++) expect(lives[i]).toBeGreaterThan(lives[i - 1]);
		expect(lives[3]).toBeGreaterThan(5);
		expect(lives[0]).toBeLessThan(3.5);
	});

	it('is built from rendered blasts, not ringing oscillators', () => {
		expect(boom({ power: 1.8, near: 0.9 }).oscs).toHaveLength(0);
	});

	it('only adds the crack and debris up close', () => {
		expect(boom({ near: 0.6 }).plays).toHaveLength(2);
		expect(boom({ near: 0 }).plays).toHaveLength(1);
	});

	it('starts the ear ringing silent instead of at full gain', () => {
		const { oscs } = boom({ power: 4, near: 0.9 });
		expect(oscs).toHaveLength(1);
		for (const o of oscs) {
			const g = o.dest?.gain;
			if (!g) throw new Error('oscillator not routed through a gain');
			const atStart = g.first <= o.started ? g.firstValue : g.value;
			expect(atStart).toBeLessThan(0.01);
		}
	});

	it('arrives late from far away and drags out deeper in slow motion', () => {
		const late = boom({ delay: 0.3 });
		expect(late.plays[0].at).toBeCloseTo(0.305);
		const slow = boom({ warp: 0.7 });
		const normal = boom({});
		expect(slow.plays[0].rate).toBeLessThan(normal.plays[0].rate);
		expect(slow.life).toBeGreaterThan(normal.life);
	});

	it('picks the nearest size class and renders each take only once', () => {
		expect(BoomBank.classFor(0.3, false)).toBe(0.4);
		expect(BoomBank.classFor(1.4, false)).toBe(1);
		expect(BoomBank.classFor(4.5, false)).toBe(4);
		expect(BoomBank.classFor(4.5, true)).toBe(2);
		const before = shared.made.renders;
		for (let i = 0; i < 6; i++) boom({ power: 1 });
		expect(shared.made.renders).toBe(before);
	});
});

describe('boom saturation', () => {
	it('is a symmetric soft clip that stays within ±1', () => {
		const c = softClipCurve(2.2, 257);
		expect(c[0]).toBeCloseTo(-1);
		expect(c[256]).toBeCloseTo(1);
		expect(c[128]).toBeCloseTo(0);
		for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
	});
});
