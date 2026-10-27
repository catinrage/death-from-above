import type { SfxId, SoundSink } from '../game/world';
import { softClipCurve, synthBoom, type BoomContext } from './boom';
import { ALERTS, ALERT_ORDER, Announcer, type Alert, type AlertState } from './cockpit';
import { MusicDirector } from './music';
import {
	RADIO,
	RADIO_CUES,
	RECORDED,
	RadioDesk,
	estimateLength,
	type RadioCue,
	type Speaker,
	type Transmission
} from './radio';
import { Score } from './score';

interface Voice {
	gain: GainNode;
	pan: StereoPannerNode;
}

interface Whistle {
	osc: OscillatorNode;
	gain: GainNode;
	pan: StereoPannerNode;
	seen: number;
}

/** Interface sounds keep their pitch when the world slows down. */
const UI_SOUNDS = new Set<SfxId>([
	'select',
	'empty',
	'lockOn',
	'lockTone',
	'launchWarn',
	'rearm',
	'pickup',
	'focusIn',
	'focusOut',
	'caution',
	'masterWarning',
	'stallHorn'
]);

const MIN_GAP: Partial<Record<SfxId, number>> = {
	gun: 0.03,
	cannon: 0.05,
	rifle: 0.06,
	mg: 0.04,
	aaGun: 0.05,
	impactMetal: 0.05,
	impactGround: 0.05,
	hit: 0.08,
	select: 0.05,
	lockOn: 0.04,
	rearm: 0.15,
	debris: 0.1
};

/** Fully synthesised sound: no audio files, everything is built from noise and oscillators. */
export class AudioEngine implements SoundSink {
	private ctx: AudioContext | null = null;
	private master!: GainNode;
	private bus!: GainNode;
	/** Interface sounds: straight to the compressor, never muffled by slow motion. */
	private uiBus!: GainNode;
	private send!: GainNode;
	/** Saturated, bass-shelved bus every explosion goes through. */
	private boomBus!: GainNode;
	/** Master low-pass that muffles the world in slow motion. */
	private warpFilter!: BiquadFilterNode;
	private boomGraph: BoomContext | null = null;
	/** Pitch multiplier for world sounds (below 1 in slow motion). */
	private pitchWarp = 1;
	private booms = 0;
	/** Booms requested in the current audio tick (one blast can kill a crowd at once). */
	private tickBooms = 0;
	private boomTick = -1;
	private white!: AudioBuffer;
	private brown!: AudioBuffer;
	private readonly last = new Map<SfxId, number>();
	private readonly whistles = new Map<number, Whistle>();
	private engineNodes: {
		saw: OscillatorNode;
		sawGain: GainNode;
		noiseFilter: BiquadFilterNode;
		noiseGain: GainNode;
		wind: GainNode;
		windFilter: BiquadFilterNode;
		siren: OscillatorNode;
		sirenGain: GainNode;
		chop: GainNode;
	} | null = null;
	private listenerX = 0;
	private listenerY = 0;
	private warnTimer = 0;
	private hornTimer = 0;
	private readonly announcer = new Announcer();
	/** Recorded voice callouts; anything missing falls back to the browser's speech voice. */
	private readonly voiceClips = new Map<Alert, AudioBuffer>();
	private readonly radioDesk = new RadioDesk();
	/** Recorded radio calls by clip file; anything missing falls back to the speech voice. */
	private readonly radioClips = new Map<string, AudioBuffer>();
	private radioBus!: GainNode;
	private readonly director = new MusicDirector();
	private score: Score | null = null;
	private musicBus: GainNode | null = null;
	/** Score loudness last asked for (-1 = never). */
	private musicLevel = -1;
	private ambienceTimer = 3;
	private voices = 0;
	volume = 0.8;
	music = 0.6;

	get ready(): boolean {
		return this.ctx !== null && this.ctx.state === 'running';
	}

	/** Must be called from a user gesture (browser autoplay rules). */
	async unlock(): Promise<void> {
		if (!this.ctx) {
			const Ctor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return;
			this.ctx = new Ctor();
			this.build();
		}
		if (this.ctx.state !== 'running') await this.ctx.resume();
	}

	private build(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.knee.value = 12;
		comp.ratio.value = 5;
		comp.attack.value = 0.004;
		comp.release.value = 0.25;
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		this.warpFilter = ctx.createBiquadFilter();
		this.warpFilter.type = 'lowpass';
		this.warpFilter.frequency.value = 20000;
		this.warpFilter.Q.value = 0.5;
		this.warpFilter.connect(comp);
		this.bus = ctx.createGain();
		this.bus.connect(this.warpFilter);
		this.uiBus = ctx.createGain();
		this.uiBus.connect(comp);
		comp.connect(this.master);
		this.master.connect(ctx.destination);
		const reverb = ctx.createConvolver();
		reverb.buffer = this.impulse(3.2);
		this.send = ctx.createGain();
		this.send.gain.value = 0.32;
		this.send.connect(reverb);
		reverb.connect(this.warpFilter);
		// Explosions: soft-clip drive for weight, then a bass shelf for the chest punch.
		const shaper = ctx.createWaveShaper();
		shaper.curve = softClipCurve(2.2);
		shaper.oversample = '2x';
		const shelf = ctx.createBiquadFilter();
		shelf.type = 'lowshelf';
		shelf.frequency.value = 120;
		shelf.gain.value = 6;
		this.boomBus = ctx.createGain();
		this.boomBus.gain.value = 0.85;
		this.boomBus.connect(shaper);
		shaper.connect(shelf);
		shelf.connect(this.bus);
		this.white = this.noiseBuffer(2, false);
		this.brown = this.noiseBuffer(8, true);
		this.boomGraph = {
			ctx,
			out: this.boomBus,
			dry: this.bus,
			reverb: this.send,
			white: this.white,
			brown: this.brown
		};
		this.startEngine();
		this.startAmbience();
		this.loadVoices();
		this.buildRadio(comp);
		const musicBus = ctx.createGain();
		musicBus.gain.value = this.music;
		musicBus.connect(comp);
		this.musicBus = musicBus;
		this.score = new Score(ctx, musicBus, this.white);
	}

	/** Radio band: thin, a little crunchy, so the tower and wingman sound miles away. */
	private buildRadio(dest: AudioNode): void {
		const ctx = this.ctx as AudioContext;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 450;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 2900;
		const shaper = ctx.createWaveShaper();
		shaper.curve = softClipCurve(3);
		this.radioBus = ctx.createGain();
		this.radioBus.gain.value = 0.9;
		this.radioBus.connect(hp);
		hp.connect(shaper);
		shaper.connect(lp);
		lp.connect(dest);
		for (const c of RADIO_CUES)
			for (const line of RADIO[c].lines) {
				if (!RECORDED.has(line.file)) continue;
				const url = new URL(`audio/radio/${line.file}.mp3`, document.baseURI);
				if (typeof fetch === 'undefined') return;
				fetch(url)
					.then((r) => (r.ok ? r.arrayBuffer() : null))
					.then((data) => (data ? ctx.decodeAudioData(data) : null))
					.then((buf) => {
						if (buf) this.radioClips.set(line.file, buf);
					})
					// No clip yet: the call is read by the speech voice instead.
					.catch(() => this.radioClips.delete(line.file));
			}
	}

	private noiseBuffer(seconds: number, brown: boolean): AudioBuffer {
		const ctx = this.ctx as AudioContext;
		const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
		const d = buf.getChannelData(0);
		let last = 0;
		for (let i = 0; i < d.length; i++) {
			const w = Math.random() * 2 - 1;
			if (brown) {
				last = (last + 0.02 * w) / 1.02;
				d[i] = last * 3.5;
			} else {
				d[i] = w;
			}
		}
		return buf;
	}

	private impulse(seconds: number): AudioBuffer {
		const ctx = this.ctx as AudioContext;
		const len = Math.floor(ctx.sampleRate * seconds);
		const buf = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let c = 0; c < 2; c++) {
			const d = buf.getChannelData(c);
			for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
		}
		return buf;
	}

	setVolume(v: number): void {
		this.volume = v;
		if (this.master) this.master.gain.value = v;
	}

	setMusicVolume(v: number): void {
		this.music = v;
		if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
	}

	/**
	 * Dynamic score, called every frame: `threat` (0..1) drives which layers
	 * play, `level` (0..1) how loud the whole score is (0 fades it out).
	 */
	updateMusic(dt: number, threat: number, level: number): void {
		const score = this.score;
		if (!score || !this.ready) return;
		if (level !== this.musicLevel) {
			this.musicLevel = level;
			score.setLevel(level, level > 0 ? 2 : 1.2);
		}
		this.director.update(dt, threat);
		score.update(this.director.layers);
	}

	/** Current music intensity 0..1 (for debugging and the HUD). */
	get intensity(): number {
		return this.director.level;
	}

	/** Queues radio calls; the desk decides when (and whether) each goes out. */
	radio(cues: readonly RadioCue[]): void {
		for (const c of cues) this.radioDesk.push(c);
	}

	/** Puts the next radio call on the air, waiting while the cockpit voice talks. Null clears the channel. */
	updateRadio(dt: number, active: boolean): void {
		if (!this.ready) return;
		if (!active) {
			this.radioDesk.reset();
			return;
		}
		const tx = this.radioDesk.update(dt, this.announcer.speaking);
		if (tx) this.transmit(tx);
	}

	private transmit(tx: Transmission): void {
		const ctx = this.ctx as AudioContext;
		const t = ctx.currentTime + 0.02;
		const clip = this.radioClips.get(tx.line.file);
		const length = clip ? clip.duration + 0.25 : this.speakRadio(tx.line.text, tx.speaker);
		this.squelch(t, 0.07);
		if (clip) {
			const src = ctx.createBufferSource();
			src.buffer = clip;
			src.connect(this.radioBus);
			src.start(t + 0.08);
		}
		this.squelch(t + length, 0.12);
		this.radioDesk.onAir(length + 0.1);
	}

	/** The key-up/key-down hiss that brackets every transmission. */
	private squelch(t: number, dur: number): void {
		const ctx = this.ctx as AudioContext;
		const src = ctx.createBufferSource();
		src.buffer = this.white;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 2200;
		bp.Q.value = 0.6;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(bp);
		bp.connect(g);
		g.connect(this.radioBus);
		src.start(t, Math.random());
		src.stop(t + dur + 0.05);
	}

	/** Speech fallback for a radio call; returns roughly how long it will take. */
	private speakRadio(text: string, speaker: Speaker): number {
		const length = estimateLength(text);
		if (typeof speechSynthesis === 'undefined') return length;
		const u = new SpeechSynthesisUtterance(text);
		u.rate = speaker === 'wingman' ? 1.18 : 1.05;
		u.pitch = speaker === 'wingman' ? 1 : 0.8;
		u.volume = Math.min(1, this.volume * 0.9);
		const male = speechSynthesis
			.getVoices()
			.filter(
				(v) => v.lang.startsWith('en') && /male|david|daniel|alex|fred|guy|mark/i.test(v.name)
			);
		const voice = male[speaker === 'wingman' ? male.length - 1 : 0];
		if (voice) u.voice = voice;
		// The cockpit voice cancels speech when it must talk; the radio never interrupts it.
		setTimeout(() => speechSynthesis.speak(u), 90);
		return length;
	}

	setListener(x: number, y: number): void {
		this.listenerX = x;
		this.listenerY = y;
	}

	/** Output chain for one sound: gain → pan → bus (+ reverb). Returns null when culled. */
	private voice(x: number, y: number, vol: number, wet = 0.4, ui = false): Voice | null {
		const ctx = this.ctx;
		if (!ctx || ctx.state !== 'running' || this.voices > 56) return null;
		const dx = x - this.listenerX,
			dy = y - this.listenerY;
		const dist = Math.hypot(dx, dy);
		const att = 1 / (1 + Math.max(0, dist - 70) / 160);
		if (att * vol < 0.02) return null;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		const pan = ctx.createStereoPanner();
		pan.pan.value = Math.max(-0.9, Math.min(0.9, dx / 260));
		const out = ctx.createGain();
		out.gain.value = att * vol;
		gain.connect(pan);
		pan.connect(out);
		out.connect(ui ? this.uiBus : this.bus);
		if (wet > 0) {
			const s = ctx.createGain();
			s.gain.value = wet * (0.5 + Math.min(dist / 400, 1) * 0.8);
			out.connect(s);
			s.connect(this.send);
		}
		this.voices++;
		return { gain, pan };
	}

	private release(seconds: number): void {
		setTimeout(() => (this.voices = Math.max(0, this.voices - 1)), seconds * 1000 + 50);
	}

	private noise(
		v: Voice,
		t: number,
		dur: number,
		type: BiquadFilterType,
		f0: number,
		f1: number,
		peak: number,
		q = 0.8,
		brown = false
	): void {
		const ctx = this.ctx as AudioContext;
		const src = ctx.createBufferSource();
		src.buffer = brown ? this.brown : this.white;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.Q.value = q;
		filter.frequency.setValueAtTime(f0, t);
		filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(filter);
		filter.connect(g);
		g.connect(v.gain);
		src.start(t, Math.random() * 1.2);
		src.stop(t + dur + 0.05);
	}

	private tone(
		v: Voice,
		t: number,
		dur: number,
		type: OscillatorType,
		f0: number,
		f1: number,
		peak: number,
		attack = 0.004
	): void {
		const ctx = this.ctx as AudioContext;
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.setValueAtTime(f0, t);
		osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(g);
		g.connect(v.gain);
		osc.start(t);
		osc.stop(t + dur + 0.05);
	}

	/**
	 * An explosion scaled by blast `power` (0.3 shell … 1 bomb … 4 Thunderclap).
	 * Bigger blasts carry further; distant ones arrive late, muffled and wet.
	 */
	boom(power: number, x: number, y: number, air = false): void {
		const ctx = this.ctx;
		const graph = this.boomGraph;
		if (!ctx || !graph || ctx.state !== 'running' || this.booms >= 20) return;
		if (ctx.currentTime !== this.boomTick) {
			this.boomTick = ctx.currentTime;
			this.tickBooms = 0;
		}
		// The blast itself is requested first; a few of the deaths it causes are plenty on top.
		if (this.tickBooms >= 4) return;
		const dx = x - this.listenerX,
			dy = y - this.listenerY;
		const dist = Math.hypot(dx, dy);
		const q = Math.sqrt(Math.max(power, 0.1));
		const att = 1 / (1 + Math.max(0, dist - 70) / (150 + 150 * q));
		const level = Math.min(1.25, 0.45 + 0.4 * q) * att;
		if (level < 0.02) return;
		const life = synthBoom(graph, {
			power,
			pan: Math.max(-0.85, Math.min(0.85, dx / 300)),
			level,
			near: Math.max(0, Math.min(1, 1 - dist / 520)),
			delay: Math.min(0.32, Math.max(0, dist - 60) / 1000),
			warp: this.pitchWarp,
			air
		});
		this.booms++;
		this.tickBooms++;
		setTimeout(() => (this.booms = Math.max(0, this.booms - 1)), life * 1000);
	}

	/** Slows the soundscape with the world: deeper pitch and a muffling low-pass. */
	setTimeWarp(scale: number): void {
		this.pitchWarp = 0.6 + 0.4 * scale;
		const ctx = this.ctx;
		if (!ctx || !this.warpFilter) return;
		const cutoff = scale > 0.995 ? 20000 : 450 + 19500 * scale * scale * scale;
		this.warpFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.06);
	}

	play(id: SfxId, x: number, y: number, volume = 1, pitch = 1): void {
		const ctx = this.ctx;
		if (!ctx || ctx.state !== 'running') return;
		// Every blast goes through the layered boom synth.
		if (id === 'explosion' || id === 'bigExplosion' || id === 'thunder' || id === 'flakBurst') {
			const power = { explosion: 1, bigExplosion: 1.8, thunder: 4, flakBurst: 0.4 }[id];
			this.boom(power * (0.6 + 0.4 * Math.min(volume, 1.5)), x, y, id === 'flakBurst');
			return;
		}
		if (id === 'crash') this.boom(1.8, x, y);
		const now = ctx.currentTime;
		const gap = MIN_GAP[id];
		if (gap) {
			const prev = this.last.get(id) ?? -1;
			if (now - prev < gap) return;
		}
		this.last.set(id, now);
		const ui = UI_SOUNDS.has(id);
		const wet = id === 'gun' || id === 'select' || id === 'empty' ? 0.1 : 0.45;
		const v = this.voice(x, y, volume, wet, ui);
		if (!v) return;
		v.gain.gain.value = 1;
		const p = pitch * (ui ? 1 : this.pitchWarp) * (0.94 + Math.random() * 0.12);
		const t = now + 0.005;
		let dur = 0.3;
		switch (id) {
			case 'gun':
				dur = 0.08;
				this.noise(v, t, 0.06, 'bandpass', 2600 * p, 1200, 0.5, 1.2);
				this.tone(v, t, 0.04, 'square', 160 * p, 60, 0.15);
				break;
			case 'cannon':
				dur = 0.2;
				this.noise(v, t, 0.12, 'lowpass', 2400 * p, 400, 0.7, 0.9);
				this.tone(v, t, 0.12, 'sine', 140 * p, 50, 0.5);
				break;
			case 'rifle':
				dur = 0.1;
				this.noise(v, t, 0.06, 'highpass', 2500 * p, 4000, 0.25, 0.7);
				break;
			case 'mg':
				dur = 0.1;
				this.noise(v, t, 0.07, 'bandpass', 1500 * p, 700, 0.4, 1);
				break;
			case 'aaGun':
				dur = 0.15;
				this.noise(v, t, 0.1, 'bandpass', 1000 * p, 400, 0.6, 0.8);
				this.tone(v, t, 0.08, 'sine', 120, 60, 0.4);
				break;
			case 'flak':
			case 'tankGun':
				dur = 0.9;
				this.noise(v, t, 0.7, 'lowpass', 1200 * p, 120, 0.8, 0.7, true);
				this.tone(v, t, 0.4, 'sine', 90 * p, 35, 0.8);
				break;
			case 'artillery':
				dur = 1.2;
				this.noise(v, t, 1.1, 'lowpass', 700 * p, 60, 0.9, 0.6, true);
				this.tone(v, t, 0.6, 'sine', 60, 25, 0.8);
				break;
			case 'missileLaunch':
				dur = 1.6;
				this.noise(v, t, 1.5, 'bandpass', 380 * p, 2600, 0.7, 1.4);
				this.noise(v, t, 0.3, 'lowpass', 900, 200, 0.5);
				break;
			case 'bombRelease':
				dur = 0.15;
				this.tone(v, t, 0.07, 'square', 95 * p, 50, 0.3);
				this.noise(v, t, 0.04, 'highpass', 2000, 3000, 0.2);
				break;
			case 'impactMetal':
				dur = 0.2;
				this.tone(v, t, 0.15, 'sine', 1700 + Math.random() * 1200, 1400, 0.18);
				this.noise(v, t, 0.04, 'highpass', 3000, 5000, 0.2);
				break;
			case 'impactGround':
				dur = 0.3;
				this.noise(v, t, 0.25, 'lowpass', 500, 80, 0.7, 0.7, true);
				break;
			case 'flare':
				dur = 0.8;
				this.noise(v, t, 0.7, 'highpass', 1800, 5000, 0.45, 0.5);
				this.tone(v, t, 0.06, 'square', 300, 120, 0.3);
				break;
			case 'crash':
				// The boom itself is played above; this is twisted metal.
				dur = 1;
				this.noise(v, t, 0.9, 'bandpass', 420, 160, 0.7, 2);
				this.noise(v, t + 0.12, 0.5, 'bandpass', 900, 300, 0.35, 3);
				break;
			case 'napalm':
				dur = 2;
				this.noise(v, t, 1.9, 'lowpass', 300, 1400, 0.9, 0.6, true);
				this.noise(v, t, 0.5, 'bandpass', 800, 300, 0.5);
				break;
			case 'debris':
				dur = 0.3;
				this.noise(v, t, 0.2, 'bandpass', 900, 500, 0.3, 3);
				break;
			case 'hit':
				dur = 0.25;
				this.tone(v, t, 0.1, 'square', 220 * p, 140, 0.25);
				this.noise(v, t, 0.15, 'bandpass', 1400, 700, 0.6, 1.5);
				break;
			case 'pickup':
				dur = 0.5;
				[660, 880, 1320].forEach((f, i) => this.tone(v, t + i * 0.07, 0.12, 'sine', f, f, 0.25));
				break;
			case 'rearm':
				dur = 0.3;
				this.tone(v, t, 0.08, 'sine', 880, 880, 0.18);
				this.tone(v, t + 0.09, 0.1, 'sine', 1175, 1175, 0.18);
				break;
			case 'siren': {
				dur = 4.5;
				const ctx2 = this.ctx as AudioContext;
				const osc = ctx2.createOscillator();
				osc.type = 'sawtooth';
				const f = osc.frequency;
				f.setValueAtTime(220, t);
				f.linearRampToValueAtTime(620, t + 1.3);
				f.linearRampToValueAtTime(560, t + 2.0);
				f.linearRampToValueAtTime(640, t + 3.0);
				f.linearRampToValueAtTime(200, t + 4.4);
				const lp = ctx2.createBiquadFilter();
				lp.type = 'lowpass';
				lp.frequency.value = 1100;
				const g = ctx2.createGain();
				g.gain.setValueAtTime(0.0001, t);
				g.gain.exponentialRampToValueAtTime(0.22, t + 0.6);
				g.gain.setValueAtTime(0.22, t + 3.6);
				g.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
				osc.connect(lp);
				lp.connect(g);
				g.connect(v.gain);
				osc.start(t);
				osc.stop(t + 4.5);
				break;
			}
			case 'lockTone':
				dur = 0.1;
				this.tone(v, t, 0.07, 'square', 980, 980, 0.12, 0.002);
				break;
			case 'launchWarn':
				dur = 0.1;
				this.tone(v, t, 0.06, 'square', 1500, 1500, 0.14, 0.002);
				break;
			case 'empty':
				dur = 0.05;
				this.tone(v, t, 0.03, 'triangle', 1300, 900, 0.15);
				break;
			case 'select':
				dur = 0.05;
				this.tone(v, t, 0.03, 'sine', 1700, 1500, 0.12);
				break;
			case 'focusIn':
				// Time sinks: a falling whoomp under a closing filter.
				dur = 0.9;
				this.tone(v, t, 0.8, 'sine', 190, 46, 0.55, 0.01);
				this.noise(v, t, 0.7, 'lowpass', 2600, 140, 0.32, 0.8, true);
				this.tone(v, t + 0.02, 0.35, 'triangle', 820, 260, 0.08);
				break;
			case 'focusOut':
				dur = 0.6;
				this.noise(v, t, 0.45, 'bandpass', 240, 2600, 0.3, 1.1);
				this.tone(v, t, 0.3, 'sine', 70, 150, 0.3);
				break;
			case 'splash':
				// Watery crash: a hissing wash with a hollow gulp underneath.
				dur = 1.6;
				this.noise(v, t, 1.4, 'bandpass', 2400 * p, 500, 0.55, 0.6);
				this.noise(v, t + 0.02, 0.9, 'lowpass', 900 * p, 120, 0.5, 0.7, true);
				this.tone(v, t, 0.25, 'sine', 180 * p, 60, 0.35);
				for (let i = 0; i < 6; i++) {
					const at = t + 0.3 + Math.random() * 1.1;
					this.noise(v, at, 0.08, 'bandpass', (1500 + Math.random() * 2500) * p, 900, 0.12, 2);
				}
				break;
			case 'emp':
				// Electric crack, a falling whine as everything powers down, then hum.
				dur = 2.4;
				this.noise(v, t, 0.18, 'highpass', 6000, 2500, 0.5, 0.7);
				this.tone(v, t, 1.8, 'sawtooth', 2400 * p, 60, 0.12, 0.01);
				this.tone(v, t + 0.05, 2.2, 'square', 120 * p, 40, 0.08, 0.05);
				for (let i = 0; i < 7; i++) {
					const at = t + Math.random() * 0.8;
					this.noise(v, at, 0.05, 'bandpass', 4000 + Math.random() * 3000, 2000, 0.25, 3);
				}
				break;
			case 'collapse':
				// Tearing steel: groaning metal, a shriek of rivets, then the crash.
				dur = 3.2;
				this.tone(v, t, 1.6, 'sawtooth', 95 * p, 42, 0.18, 0.3);
				this.tone(v, t + 0.1, 1.2, 'sawtooth', 141 * p, 70, 0.12, 0.2);
				this.noise(v, t, 0.9, 'bandpass', 3800 * p, 1400, 0.22, 4);
				this.noise(v, t + 0.6, 2.4, 'lowpass', 1600 * p, 90, 0.6, 0.7, true);
				for (let i = 0; i < 8; i++) {
					const at = t + 0.5 + Math.random() * 1.8;
					this.noise(v, at, 0.12, 'bandpass', (700 + Math.random() * 2400) * p, 400, 0.2, 3);
				}
				break;
			case 'airbrake':
				// Speed brakes biting into the airflow: a rising rush and a low rumble.
				dur = 0.9;
				this.noise(v, t, 0.8, 'bandpass', 500 * p, 1400 * p, 0.45, 0.8);
				this.noise(v, t, 0.9, 'lowpass', 260 * p, 120, 0.35, 0.7, true);
				break;
			case 'caution':
				// Two-tone attention chime.
				dur = 0.6;
				this.tone(v, t, 0.22, 'sine', 1180, 1180, 0.22, 0.004);
				this.tone(v, t + 0.24, 0.3, 'sine', 880, 880, 0.22, 0.004);
				break;
			case 'masterWarning':
				// Master warning: three urgent high beeps.
				dur = 0.55;
				for (let i = 0; i < 3; i++)
					this.tone(v, t + i * 0.13, 0.09, 'square', 2600, 2600, 0.09, 0.002);
				break;
			case 'stallHorn':
				// Stall warning horn / stick shaker rattle.
				dur = 0.32;
				this.tone(v, t, 0.28, 'sawtooth', 420, 400, 0.08, 0.01);
				this.tone(v, t, 0.28, 'square', 211, 205, 0.05, 0.01);
				break;
			case 'lockOn':
				dur = 0.12;
				this.tone(v, t, 0.04, 'square', 1480, 1480, 0.1, 0.002);
				this.tone(v, t + 0.05, 0.05, 'square', 1975, 1975, 0.1, 0.002);
				break;
		}
		this.release(dur);
	}

	/** Falling-bomb whistle; pitch drops as the bomb picks up speed. */
	whistle(id: number, x: number, y: number, vy: number, active: boolean): void {
		const ctx = this.ctx;
		if (!ctx || ctx.state !== 'running') return;
		const w = this.whistles.get(id);
		if (!active) {
			if (w) {
				w.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
				w.osc.stop(ctx.currentTime + 0.1);
				this.whistles.delete(id);
			}
			return;
		}
		const dx = x - this.listenerX;
		const att = 1 / (1 + Math.max(0, Math.hypot(dx, y - this.listenerY) - 60) / 140);
		const freq = Math.max(380, 1250 + vy * 9);
		if (!w) {
			if (this.whistles.size >= 4) return;
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			const gain = ctx.createGain();
			gain.gain.value = 0;
			const pan = ctx.createStereoPanner();
			osc.connect(gain);
			gain.connect(pan);
			pan.connect(this.bus);
			osc.frequency.value = freq;
			osc.start();
			this.whistles.set(id, { osc, gain, pan, seen: ctx.currentTime });
			return;
		}
		w.seen = ctx.currentTime;
		w.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
		w.gain.gain.setTargetAtTime(0.06 * att, ctx.currentTime, 0.1);
		w.pan.pan.value = Math.max(-0.9, Math.min(0.9, dx / 260));
	}

	private startEngine(): void {
		const ctx = this.ctx as AudioContext;
		const saw = ctx.createOscillator();
		saw.type = 'sawtooth';
		saw.frequency.value = 90;
		const sawFilter = ctx.createBiquadFilter();
		sawFilter.type = 'lowpass';
		sawFilter.frequency.value = 700;
		const sawGain = ctx.createGain();
		sawGain.gain.value = 0;
		saw.connect(sawFilter);
		sawFilter.connect(sawGain);
		sawGain.connect(this.bus);
		const src = ctx.createBufferSource();
		src.buffer = this.white;
		src.loop = true;
		const noiseFilter = ctx.createBiquadFilter();
		noiseFilter.type = 'bandpass';
		noiseFilter.Q.value = 0.7;
		noiseFilter.frequency.value = 600;
		const noiseGain = ctx.createGain();
		noiseGain.gain.value = 0;
		src.connect(noiseFilter);
		noiseFilter.connect(noiseGain);
		noiseGain.connect(this.bus);
		const wsrc = ctx.createBufferSource();
		wsrc.buffer = this.brown;
		wsrc.loop = true;
		const windFilter = ctx.createBiquadFilter();
		windFilter.type = 'lowpass';
		windFilter.frequency.value = 300;
		const wind = ctx.createGain();
		wind.gain.value = 0;
		wsrc.connect(windFilter);
		windFilter.connect(wind);
		wind.connect(this.bus);
		// Dive siren: a wind-driven trumpet whose wail climbs with the airspeed.
		const siren = ctx.createOscillator();
		siren.type = 'sawtooth';
		siren.frequency.value = 280;
		const sirenFilter = ctx.createBiquadFilter();
		sirenFilter.type = 'bandpass';
		sirenFilter.Q.value = 2.5;
		sirenFilter.frequency.value = 900;
		const sirenGain = ctx.createGain();
		sirenGain.gain.value = 0;
		siren.connect(sirenFilter);
		sirenFilter.connect(sirenGain);
		sirenGain.connect(this.bus);
		// Rotor blade slap: the engine noise pulsed by a slow square wave.
		const chopLfo = ctx.createOscillator();
		chopLfo.type = 'square';
		chopLfo.frequency.value = 18;
		const chop = ctx.createGain();
		chop.gain.value = 0;
		chopLfo.connect(chop);
		chop.connect(noiseGain.gain);
		saw.start();
		src.start();
		wsrc.start();
		siren.start();
		chopLfo.start();
		this.engineNodes = {
			saw,
			sawGain,
			noiseFilter,
			noiseGain,
			wind,
			windFilter,
			siren,
			sirenGain,
			chop
		};
	}

	private startAmbience(): void {
		const ctx = this.ctx as AudioContext;
		const src = ctx.createBufferSource();
		src.buffer = this.brown;
		src.loop = true;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 140;
		const g = ctx.createGain();
		g.gain.value = 0.09;
		src.connect(lp);
		lp.connect(g);
		g.connect(this.bus);
		src.start();
	}

	private loadVoices(): void {
		const ctx = this.ctx;
		if (!ctx || typeof fetch === 'undefined') return;
		for (const a of ALERT_ORDER) {
			const url = new URL(`audio/voice/${ALERTS[a].file}.mp3`, document.baseURI);
			fetch(url)
				.then((r) => (r.ok ? r.arrayBuffer() : null))
				.then((data) => (data ? ctx.decodeAudioData(data) : null))
				.then((buf) => {
					if (buf) this.voiceClips.set(a, buf);
				})
				// No clip (not generated yet): that callout uses the speech fallback instead.
				.catch(() => this.voiceClips.delete(a));
		}
	}

	/**
	 * Cockpit voice warnings: called every frame with which alerts are live.
	 * The stall horn rattles continuously; spoken callouts repeat on their own
	 * cadence behind an attention tone, most urgent first.
	 */
	alerts(dt: number, s: AlertState | null): void {
		const ctx = this.ctx;
		if (!ctx || ctx.state !== 'running') return;
		if (!s) {
			this.announcer.reset();
			if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
			return;
		}
		this.hornTimer -= dt;
		if (s.stall && this.hornTimer <= 0) {
			this.play('stallHorn', this.listenerX, this.listenerY, 0.8);
			this.hornTimer = 0.42;
		}
		const pick = this.announcer.update(dt, s, 1.4);
		if (!pick) return;
		const spec = ALERTS[pick];
		if (spec.tone === 'caution') this.play('caution', this.listenerX, this.listenerY, 0.8);
		if (spec.tone === 'warning') this.play('masterWarning', this.listenerX, this.listenerY, 0.8);
		this.say(pick, spec.tone === 'none' ? 0 : 0.42);
	}

	private say(a: Alert, delay: number): void {
		const ctx = this.ctx as AudioContext;
		const clip = this.voiceClips.get(a);
		if (clip) {
			// Through a thin cockpit-intercom band so it sits apart from the battle.
			const src = ctx.createBufferSource();
			src.buffer = clip;
			const hp = ctx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.value = 320;
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 4200;
			const g = ctx.createGain();
			g.gain.value = 1.1;
			src.connect(hp);
			hp.connect(lp);
			lp.connect(g);
			g.connect(this.uiBus);
			src.start(ctx.currentTime + delay);
			return;
		}
		if (typeof speechSynthesis === 'undefined') return;
		const u = new SpeechSynthesisUtterance(ALERTS[a].text);
		u.rate = 1.15;
		u.pitch = 1.05;
		u.volume = Math.min(1, this.volume * 1.2);
		const voice = speechSynthesis
			.getVoices()
			.find(
				(v) =>
					v.lang.startsWith('en') && /female|zira|samantha|susan|hazel|aria|jenny/i.test(v.name)
			);
		if (voice) u.voice = voice;
		setTimeout(() => {
			speechSynthesis.cancel();
			speechSynthesis.speak(u);
		}, delay * 1000);
	}

	/** Called every frame with the player's flight state. */
	update(
		dt: number,
		s: {
			alive: boolean;
			throttle: number;
			speed: number;
			boosting: boolean;
			prop: boolean;
			rotor?: boolean;
			/** Dive siren level 0..1. */
			siren?: number;
			lock: number;
			inbound: boolean;
			active: boolean;
		}
	): void {
		const ctx = this.ctx;
		const e = this.engineNodes;
		if (!ctx || !e || ctx.state !== 'running') return;
		const t = ctx.currentTime;
		const on = s.alive && s.active ? 1 : 0;
		const siren = on * (s.siren ?? 0);
		e.siren.frequency.setTargetAtTime(260 + siren * 520, t, 0.15);
		e.sirenGain.gain.setTargetAtTime(siren * 0.13, t, 0.1);
		e.chop.gain.setTargetAtTime(s.rotor ? on * 0.05 : 0, t, 0.1);
		if (s.rotor) {
			e.saw.frequency.setTargetAtTime(30 + s.throttle * 14, t, 0.1);
			e.sawGain.gain.setTargetAtTime(on * (0.05 + s.throttle * 0.04), t, 0.1);
			e.noiseFilter.frequency.setTargetAtTime(380 + s.throttle * 260, t, 0.1);
			e.noiseGain.gain.setTargetAtTime(on * 0.06, t, 0.1);
		} else if (s.prop) {
			e.saw.frequency.setTargetAtTime(48 + s.throttle * 30 + s.speed * 0.15, t, 0.1);
			e.sawGain.gain.setTargetAtTime(on * (0.07 + s.throttle * 0.05), t, 0.1);
			e.noiseGain.gain.setTargetAtTime(on * 0.03, t, 0.1);
		} else {
			e.saw.frequency.setTargetAtTime(70 + s.speed * 1.1, t, 0.1);
			e.sawGain.gain.setTargetAtTime(on * (0.025 + s.throttle * 0.02), t, 0.1);
			e.noiseFilter.frequency.setTargetAtTime(
				500 + s.throttle * 700 + (s.boosting ? 900 : 0),
				t,
				0.1
			);
			e.noiseGain.gain.setTargetAtTime(
				on * (0.07 + s.throttle * 0.05 + (s.boosting ? 0.12 : 0)),
				t,
				0.1
			);
		}
		e.windFilter.frequency.setTargetAtTime(180 + s.speed * 6, t, 0.2);
		e.wind.gain.setTargetAtTime(on * Math.min(0.2, s.speed / 600), t, 0.2);

		this.warnTimer -= dt;
		if (s.active && s.alive && this.warnTimer <= 0) {
			if (s.inbound) {
				this.play('launchWarn', this.listenerX, this.listenerY, 0.7);
				this.warnTimer = 0.14;
			} else if (s.lock > 0) {
				this.play('lockTone', this.listenerX, this.listenerY, 0.6);
				this.warnTimer = s.lock > 0.75 ? 0.12 : 0.38;
			}
		}
		this.ambienceTimer -= dt;
		if (this.ambienceTimer <= 0 && s.active) {
			this.ambienceTimer = 2 + Math.random() * 6;
			this.play(
				'artillery',
				this.listenerX + (Math.random() - 0.5) * 3000,
				this.listenerY + 900,
				0.6,
				0.6
			);
		}
		for (const [id, w] of this.whistles) {
			if (t - w.seen > 0.25) this.whistle(id, 0, 0, 0, false);
		}
	}

	silenceAll(): void {
		for (const id of [...this.whistles.keys()]) this.whistle(id, 0, 0, 0, false);
		this.radioDesk.reset();
	}

	/** Stops every loop and releases the AudioContext (unmount / hot reload). */
	dispose(): void {
		this.silenceAll();
		const ctx = this.ctx;
		this.ctx = null;
		this.engineNodes = null;
		this.score = null;
		this.musicBus = null;
		if (ctx) void ctx.close();
	}
}
