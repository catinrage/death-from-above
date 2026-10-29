/** An aircraft as the mixer sees it (see `engineSources` in the game). */
export interface EngineVoiceSource {
	key: object;
	x: number;
	y: number;
	vx: number;
	vy: number;
	engine: 'jet' | 'prop' | 'rotor';
	/** 1 a fighter, 2 a heavy bomber, below 1 a drone. */
	size: number;
}

/** What the camera shows: its centre and half the view, in world units. */
export interface EngineView {
	x: number;
	y: number;
	halfW: number;
	halfH: number;
}

export interface EngineMix {
	gain: number;
	pan: number;
	/** Pitch and speed of the engine loop: Doppler; heavies run deeper, drones higher. */
	rate: number;
	/** Low-pass cutoff: engines at the edge of the frame sound further off. */
	cutoff: number;
}

/** Loudness of an AI engine in the middle of the frame (about as loud as the player's own). */
const LEVEL = 1.2;

/** Engines voiced at once; the loudest win. */
export const MAX_ENGINES = 5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * How one aircraft sounds from the camera: full while it is in frame, fading
 * out over the next third of a screen, panned to where it is in the picture
 * and pitched up while it closes on the middle of the view.
 */
export function engineMix(s: EngineVoiceSource, v: EngineView): EngineMix {
	const dx = s.x - v.x,
		dy = s.y - v.y;
	const u = Math.max(Math.abs(dx) / v.halfW, Math.abs(dy) / v.halfH);
	const inFrame = clamp((1.35 - u) / 0.35, 0, 1);
	// Zoomed far out the planes are far from the lens: quieter, but never silent.
	const zoom = clamp(200 / v.halfW, 0.45, 1);
	const dist = Math.hypot(dx, dy);
	const closing = dist > 1 ? -(dx * s.vx + dy * s.vy) / dist : 0;
	return {
		gain: LEVEL * inFrame * zoom * Math.sqrt(s.size),
		pan: clamp(dx / v.halfW, -1, 1) * 0.8,
		rate: clamp(1 + closing / 900, 0.85, 1.15) * Math.pow(s.size, -0.32),
		cutoff: 900 + 5500 * zoom * clamp(1.2 - u, 0, 1)
	};
}

interface EngineVoice {
	kind: EngineVoiceSource['engine'];
	out: GainNode;
	pan: StereoPannerNode;
	tone: BiquadFilterNode;
	/** Noise loops, re-pitched with the Doppler rate. */
	loops: AudioBufferSourceNode[];
	/** Oscillators and their base frequencies. */
	oscs: [OscillatorNode, number][];
	/** Set when the voice was released; it is torn down once it has faded. */
	fading: number | null;
}

/**
 * Engine noise of the aircraft on screen, so a commander (who has no engine of
 * their own) hears the jets, helicopters and bombers they are watching.
 */
export class EngineChorus {
	private readonly voices = new Map<object, EngineVoice>();

	constructor(
		private readonly ctx: AudioContext,
		private readonly bus: AudioNode,
		private readonly send: AudioNode,
		private readonly white: AudioBuffer,
		private readonly brown: AudioBuffer
	) {}

	get size(): number {
		return this.voices.size;
	}

	/** Called every frame with the aircraft flying and what the camera shows. */
	update(sources: readonly EngineVoiceSource[], view: EngineView, warp: number): void {
		const t = this.ctx.currentTime;
		const heard = sources
			.map((s) => ({ s, m: engineMix(s, view) }))
			.filter((h) => h.m.gain > 0.01)
			.sort((a, b) => b.m.gain - a.m.gain)
			.slice(0, MAX_ENGINES);
		const live = new Set<object>();
		for (const { s, m } of heard) {
			live.add(s.key);
			let v = this.voices.get(s.key);
			if (!v || v.kind !== s.engine) {
				if (v) this.stop(v, t);
				v = this.start(s.engine);
				this.voices.set(s.key, v);
			}
			v.fading = null;
			const rate = m.rate * warp;
			v.out.gain.setTargetAtTime(m.gain, t, 0.15);
			v.pan.pan.setTargetAtTime(m.pan, t, 0.1);
			v.tone.frequency.setTargetAtTime(m.cutoff, t, 0.15);
			for (const l of v.loops) l.playbackRate.setTargetAtTime(rate, t, 0.1);
			for (const [o, f] of v.oscs) o.frequency.setTargetAtTime(f * rate, t, 0.1);
		}
		for (const [key, v] of this.voices) {
			if (live.has(key)) continue;
			if (v.fading === null) {
				v.fading = t;
				v.out.gain.setTargetAtTime(0, t, 0.2);
			} else if (t - v.fading > 1) {
				this.stop(v, t);
				this.voices.delete(key);
			}
		}
	}

	private loop(buf: AudioBuffer): AudioBufferSourceNode {
		const s = this.ctx.createBufferSource();
		s.buffer = buf;
		s.loop = true;
		s.start(0, Math.random() * buf.duration);
		return s;
	}

	private osc(type: OscillatorType, f: number): OscillatorNode {
		const o = this.ctx.createOscillator();
		o.type = type;
		o.frequency.value = f;
		o.start();
		return o;
	}

	private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
		const b = this.ctx.createBiquadFilter();
		b.type = type;
		b.frequency.value = f;
		b.Q.value = q;
		return b;
	}

	private gain(v: number): GainNode {
		const g = this.ctx.createGain();
		g.gain.value = v;
		return g;
	}

	private start(kind: EngineVoiceSource['engine']): EngineVoice {
		const ctx = this.ctx;
		const out = this.gain(0);
		const tone = this.filter('lowpass', 4000, 0.5);
		const pan = ctx.createStereoPanner();
		tone.connect(out);
		out.connect(pan);
		pan.connect(this.bus);
		const wet = this.gain(0.35);
		pan.connect(wet);
		wet.connect(this.send);
		const v: EngineVoice = { kind, out, pan, tone, loops: [], oscs: [], fading: null };
		const into = (node: AudioNode, level: number, dest: AudioNode = tone): void => {
			const g = this.gain(level);
			node.connect(g);
			g.connect(dest);
		};
		if (kind === 'jet') {
			// Exhaust roar, a deep rumble under it and a faint turbine whine.
			const roar = this.loop(this.white);
			const roarLp = this.filter('lowpass', 1300, 0.5);
			roar.connect(roarLp);
			into(roarLp, 0.09);
			const rumble = this.loop(this.brown);
			const rumbleLp = this.filter('lowpass', 220);
			rumble.connect(rumbleLp);
			into(rumbleLp, 0.16);
			const whine = this.osc('triangle', 2600);
			const whineBp = this.filter('bandpass', 2900, 1.2);
			whine.connect(whineBp);
			into(whineBp, 0.008);
			v.loops.push(roar, rumble);
			v.oscs.push([whine, 2600]);
		} else if (kind === 'prop') {
			// Piston drone and propeller wash.
			const drone = this.osc('sawtooth', 78);
			const droneLp = this.filter('lowpass', 600);
			drone.connect(droneLp);
			into(droneLp, 0.06);
			const wash = this.loop(this.white);
			const washBp = this.filter('bandpass', 700);
			wash.connect(washBp);
			into(washBp, 0.05);
			v.loops.push(wash);
			v.oscs.push([drone, 78]);
		} else {
			// Rotor: turbine noise chopped by the blades, over a low throb.
			const wash = this.loop(this.white);
			const washBp = this.filter('bandpass', 450);
			wash.connect(washBp);
			const chop = this.gain(0.5);
			const slap = this.osc('square', 15);
			const depth = this.gain(0.5);
			slap.connect(depth);
			depth.connect(chop.gain);
			washBp.connect(chop);
			into(chop, 0.12);
			const throb = this.osc('sawtooth', 32);
			const throbLp = this.filter('lowpass', 200);
			throb.connect(throbLp);
			into(throbLp, 0.06);
			v.loops.push(wash);
			v.oscs.push([slap, 15], [throb, 32]);
		}
		return v;
	}

	private stop(v: EngineVoice, t: number): void {
		v.out.gain.setTargetAtTime(0, t, 0.05);
		for (const l of v.loops) l.stop(t + 0.3);
		for (const [o] of v.oscs) o.stop(t + 0.3);
		setTimeout(() => v.pan.disconnect(), 400);
	}
}
