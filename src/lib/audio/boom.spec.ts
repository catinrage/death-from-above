import { describe, expect, it } from 'vitest';
import { softClipCurve, synthBoom, type BoomContext, type BoomParams } from './boom';

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

/** Records what an explosion voice builds, standing in for Web Audio. */
function recorder() {
	const made = {
		oscFreqs: [] as number[],
		oscs: [] as FakeOsc[],
		highpass: 0,
		curves: 0,
		sources: 0
	};
	const param = (initial: number, onSet?: (v: number) => void) => ({
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
			onSet?.(v);
			this.note(v, t);
			return this;
		},
		exponentialRampToValueAtTime(v: number, t: number) {
			this.note(v, t);
			return this;
		},
		setValueCurveAtTime(curve: Float32Array, t: number) {
			made.curves++;
			this.note(curve[0], t);
			return this;
		}
	});
	const node = () => ({ connect: () => undefined });
	const ctx = {
		currentTime: 0,
		createGain: () => ({ ...node(), gain: param(1) }),
		createStereoPanner: () => ({ ...node(), pan: param(0) }),
		createBiquadFilter() {
			const f = { ...node(), Q: param(1), frequency: param(350), type: '' };
			return new Proxy(f, {
				set(target, key, v) {
					if (key === 'type' && v === 'highpass') made.highpass++;
					return Reflect.set(target, key, v);
				}
			});
		},
		createOscillator() {
			const o = {
				type: '',
				frequency: param(440, (v) => made.oscFreqs.push(v)),
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
		createBufferSource: () => {
			made.sources++;
			return {
				...node(),
				buffer: null,
				loop: false,
				start: () => undefined,
				stop: () => undefined
			};
		}
	};
	const buf = { duration: 2 };
	const b = { ctx, out: node(), dry: node(), reverb: node(), white: buf, brown: buf };
	return { b: b as unknown as BoomContext, made };
}

const boom = (o: Partial<BoomParams>) => {
	const { b, made } = recorder();
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
	return { life, made };
};

describe('explosion voice', () => {
	it('rings on longer and builds more layers the bigger the blast', () => {
		const lives = [0.4, 1, 1.8, 4].map((power) => boom({ power }));
		for (let i = 1; i < lives.length; i++) {
			expect(lives[i].life).toBeGreaterThan(lives[i - 1].life);
			expect(lives[i].made.sources).toBeGreaterThanOrEqual(lives[i - 1].made.sources);
		}
		expect(lives[3].life).toBeGreaterThan(5);
		expect(lives[0].life).toBeLessThan(2.5);
	});

	it('pitches the thump lower for bigger blasts', () => {
		const small = Math.max(...boom({ power: 0.5 }).made.oscFreqs);
		const huge = Math.max(...boom({ power: 4 }).made.oscFreqs);
		expect(huge).toBeLessThan(small);
	});

	it('only cracks up close and only rumbles on the ground', () => {
		expect(boom({ near: 0.6 }).made.highpass).toBe(1);
		expect(boom({ near: 0 }).made.highpass).toBe(0);
		expect(boom({ air: false }).made.curves).toBe(1);
		expect(boom({ air: true }).made.curves).toBe(0);
	});

	it('starts every tone silent instead of at full gain', () => {
		// Power 4 point blank builds every layer, ear ringing included.
		const { made } = boom({ power: 4, near: 0.9 });
		expect(made.oscs.length).toBeGreaterThan(3);
		for (const o of made.oscs) {
			const g = o.dest?.gain;
			if (!g) throw new Error('oscillator not routed through a gain');
			const atStart = g.first <= o.started ? g.firstValue : g.value;
			expect(atStart).toBeLessThan(0.01);
		}
	});

	it('arrives late from far away and drags out deeper in slow motion', () => {
		expect(boom({ delay: 0.3 }).life).toBeCloseTo(boom({}).life + 0.3);
		const slow = boom({ warp: 0.7 });
		expect(slow.life).toBeGreaterThan(boom({}).life);
		expect(Math.max(...slow.made.oscFreqs)).toBeLessThan(Math.max(...boom({}).made.oscFreqs));
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
