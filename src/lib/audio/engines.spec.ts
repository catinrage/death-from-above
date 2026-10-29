import { describe, expect, it } from 'vitest';
import { EngineChorus, MAX_ENGINES, engineMix, type EngineVoiceSource } from './engines';

const view = { x: 0, y: 200, halfW: 180, halfH: 100 };
const jet = (o: Partial<EngineVoiceSource> = {}): EngineVoiceSource => ({
	key: {},
	x: 0,
	y: 200,
	vx: 0,
	vy: 0,
	engine: 'jet',
	size: 1,
	...o
});

describe('engine mix', () => {
	it('is heard while the aircraft is in frame and silent well outside it', () => {
		const centre = engineMix(jet(), view).gain;
		expect(centre).toBeGreaterThan(0.5);
		expect(engineMix(jet({ x: 175 }), view).gain).toBeCloseTo(centre);
		expect(engineMix(jet({ x: 600 }), view).gain).toBe(0);
		expect(engineMix(jet({ y: 600 }), view).gain).toBe(0);
	});

	it('pans to where the aircraft is in the picture', () => {
		expect(engineMix(jet({ x: -150 }), view).pan).toBeLessThan(-0.5);
		expect(engineMix(jet({ x: 150 }), view).pan).toBeGreaterThan(0.5);
	});

	it('pitches up while closing on the middle of the view and down going away', () => {
		const coming = engineMix(jet({ x: -120, vx: 120 }), view).rate;
		const going = engineMix(jet({ x: 120, vx: 120 }), view).rate;
		expect(coming).toBeGreaterThan(1);
		expect(going).toBeLessThan(1);
	});

	it('makes bombers louder and deeper', () => {
		const fighter = engineMix(jet(), view);
		const bomber = engineMix(jet({ size: 2 }), view);
		expect(bomber.gain).toBeGreaterThan(fighter.gain);
		expect(bomber.rate).toBeLessThan(fighter.rate);
	});

	it('stays audible, if quieter, with the camera zoomed far out', () => {
		const wide = { ...view, halfW: 1400, halfH: 800 };
		const g = engineMix(jet(), wide).gain;
		expect(g).toBeLessThan(engineMix(jet(), view).gain);
		expect(g).toBeGreaterThan(0.25);
	});
});

/** Stand-in Web Audio context counting the engine loops left running. */
function fakeCtx() {
	const state = { currentTime: 0, running: 0 };
	const param = () => ({ value: 0, setTargetAtTime: () => undefined });
	const node = () => ({ connect: () => undefined, disconnect: () => undefined });
	const startable = () => ({
		...node(),
		start: () => state.running++,
		stop: () => state.running--
	});
	const ctx = {
		get currentTime() {
			return state.currentTime;
		},
		createGain: () => ({ ...node(), gain: param() }),
		createStereoPanner: () => ({ ...node(), pan: param() }),
		createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
		createOscillator: () => ({ ...startable(), type: '', frequency: param() }),
		createBufferSource: () => ({ ...startable(), buffer: null, loop: false, playbackRate: param() })
	};
	return { ctx: ctx as unknown as AudioContext, state };
}

describe('engine chorus', () => {
	const buf = { duration: 2 } as AudioBuffer;
	const bus = {} as AudioNode;

	it('voices only the loudest few engines in view', () => {
		const { ctx } = fakeCtx();
		const chorus = new EngineChorus(ctx, bus, bus, buf, buf);
		const many = Array.from({ length: 9 }, (_, i) => jet({ x: -160 + i * 40 }));
		chorus.update([...many, jet({ x: 2000 })], view, 1);
		expect(chorus.size).toBe(MAX_ENGINES);
	});

	it('fades an aircraft out when it leaves the frame and then frees its voice', () => {
		const { ctx, state } = fakeCtx();
		const chorus = new EngineChorus(ctx, bus, bus, buf, buf);
		const heli = jet({ engine: 'rotor' });
		chorus.update([heli], view, 1);
		expect(state.running).toBeGreaterThan(0);
		heli.x = 3000;
		chorus.update([heli], view, 1);
		expect(chorus.size).toBe(1);
		state.currentTime = 1.5;
		chorus.update([heli], view, 1);
		expect(chorus.size).toBe(0);
		expect(state.running).toBe(0);
	});
});
