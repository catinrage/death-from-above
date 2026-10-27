import { BPM, midiHz, stepAt, type MusicLayers } from './music';

const STEP = 60 / BPM / 4;
/** How far ahead notes are scheduled, so a slow frame never leaves a gap. */
const LOOKAHEAD = 0.25;

/**
 * The synthesised battle score: four layers on one sixteenth-note grid, each
 * on its own gain so the mix follows the music director without retriggering.
 * Silent layers schedule nothing.
 */
export class Score {
	private readonly out: GainNode;
	private readonly gains: Record<keyof MusicLayers, GainNode>;
	private readonly mix: MusicLayers = { pad: 0, bass: 0, drums: 0, lead: 0 };
	private next = 0;
	private index = 0;
	private playing = false;
	private target = 0;

	constructor(
		private readonly ctx: AudioContext,
		dest: AudioNode,
		private readonly noise: AudioBuffer
	) {
		this.out = ctx.createGain();
		this.out.gain.value = 0;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 7000;
		this.out.connect(lp);
		lp.connect(dest);
		const layer = (level: number) => {
			const g = ctx.createGain();
			g.gain.value = 0;
			const trim = ctx.createGain();
			trim.gain.value = level;
			g.connect(trim);
			trim.connect(this.out);
			return g;
		};
		this.gains = { pad: layer(0.16), bass: layer(0.2), drums: layer(0.32), lead: layer(0.09) };
	}

	/** Fades the whole score towards `level` (0 = silent). */
	setLevel(level: number, seconds = 1.5): void {
		const t = this.ctx.currentTime;
		this.target = level;
		this.out.gain.cancelScheduledValues(t);
		this.out.gain.setTargetAtTime(level, t, seconds / 3);
		if (level > 0 && !this.playing) {
			this.playing = true;
			this.next = t + 0.1;
		}
		// Once faded out, stop scheduling notes nobody can hear.
		if (level === 0)
			setTimeout(
				() => {
					if (this.target === 0) this.playing = false;
				},
				seconds * 1000 + 200
			);
	}

	/** Called every frame with the director's layer mix; schedules the next few steps. */
	update(layers: MusicLayers): void {
		const ctx = this.ctx;
		const t = ctx.currentTime;
		for (const k of Object.keys(layers) as (keyof MusicLayers)[]) {
			if (Math.abs(layers[k] - this.mix[k]) < 0.005) continue;
			this.mix[k] = layers[k];
			this.gains[k].gain.setTargetAtTime(layers[k], t, 0.6);
		}
		if (!this.playing) return;
		// Fell behind (tab in the background): skip ahead instead of bursting notes.
		if (this.next < t - 0.1) this.next = t + 0.05;
		while (this.next < t + LOOKAHEAD) {
			this.schedule(this.index, this.next);
			this.index++;
			this.next += STEP;
		}
	}

	private schedule(index: number, t: number): void {
		const s = stepAt(index);
		const m = this.mix;
		if (s.pos === 0 && m.pad > 0.01) for (const n of s.chord) this.pad(n, t, STEP * 16);
		if (m.bass > 0.01 && s.bass !== null) this.bass(s.bass, t);
		if (m.drums > 0.01) {
			if (s.kick) this.kick(t);
			if (s.snare) this.snare(t);
			if (s.hat && m.drums > 0.5) this.hat(t, s.pos % 4 === 2 ? 0.6 : 0.35);
		}
		if (m.lead > 0.01) {
			if (s.arp !== null) this.arp(s.arp, t);
			if (s.tom) this.tom(t);
		}
	}

	private env(dest: AudioNode, t: number, attack: number, dur: number, peak: number): GainNode {
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		g.connect(dest);
		return g;
	}

	private osc(type: OscillatorType, hz: number, t: number, dur: number, dest: AudioNode): void {
		const o = this.ctx.createOscillator();
		o.type = type;
		o.frequency.value = hz;
		o.connect(dest);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	private pad(note: number, t: number, dur: number): void {
		const lp = this.ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.setValueAtTime(500, t);
		lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
		lp.frequency.linearRampToValueAtTime(600, t + dur);
		lp.connect(this.gains.pad);
		const g = this.env(lp, t, dur * 0.3, dur * 1.05, 0.5);
		for (const detune of [-7, 7]) {
			const o = this.ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = midiHz(note);
			o.detune.value = detune;
			o.connect(g);
			o.start(t);
			o.stop(t + dur * 1.1);
		}
	}

	private bass(note: number, t: number): void {
		const lp = this.ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.Q.value = 4;
		lp.frequency.setValueAtTime(900, t);
		lp.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.6);
		lp.connect(this.gains.bass);
		this.osc('sawtooth', midiHz(note), t, STEP * 1.8, this.env(lp, t, 0.005, STEP * 1.8, 0.7));
	}

	private kick(t: number): void {
		const o = this.ctx.createOscillator();
		o.frequency.setValueAtTime(130, t);
		o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
		o.connect(this.env(this.gains.drums, t, 0.003, 0.32, 1));
		o.start(t);
		o.stop(t + 0.35);
	}

	private noiseHit(t: number, dur: number, type: BiquadFilterType, hz: number, peak: number): void {
		const src = this.ctx.createBufferSource();
		src.buffer = this.noise;
		const f = this.ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = hz;
		src.connect(f);
		f.connect(this.env(this.gains.drums, t, 0.002, dur, peak));
		src.start(t, Math.random() * 1.5);
		src.stop(t + dur + 0.05);
	}

	private snare(t: number): void {
		this.noiseHit(t, 0.2, 'bandpass', 1800, 0.55);
		this.osc('triangle', 190, t, 0.08, this.env(this.gains.drums, t, 0.002, 0.08, 0.35));
	}

	private hat(t: number, peak: number): void {
		this.noiseHit(t, 0.04, 'highpass', 7500, peak * 0.4);
	}

	private arp(note: number, t: number): void {
		const g = this.env(this.gains.lead, t, 0.004, STEP * 0.9, 0.5);
		this.osc('square', midiHz(note), t, STEP, g);
	}

	private tom(t: number): void {
		const o = this.ctx.createOscillator();
		o.frequency.setValueAtTime(95, t);
		o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
		o.connect(this.env(this.gains.lead, t, 0.004, 0.45, 2.4));
		o.start(t);
		o.stop(t + 0.5);
	}

	stop(): void {
		this.setLevel(0, 0.3);
	}
}
