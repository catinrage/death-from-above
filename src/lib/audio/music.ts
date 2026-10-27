/** What the score listens to: how much is going on around the aircraft. */
export interface ThreatInput {
	/** Enemy vehicles and aircraft alive anywhere. */
	hostiles: number;
	/** Of those, how many are within striking distance of the aircraft. */
	near: number;
	/** Enemy aircraft alive. */
	enemyAir: number;
	/** Missiles homing on the aircraft. */
	inbound: number;
	/** 0..1 progress of the closest enemy lock. */
	lock: number;
	/** Aircraft health, 0..1. */
	hp: number;
	baseUnderAttack: boolean;
	/** A wave is on (not briefing, not cleared). */
	waveActive: boolean;
	alive: boolean;
}

const sat = (x: number, k: number) => 1 - Math.exp(-x / k);

/**
 * Threat level 0..1. A quiet sky between waves sits near 0.1, a wave rolling
 * in around 0.4, close combat 0.6–0.8, and missiles in the air with the
 * aircraft hurt pushes it to 1.
 */
export function threatLevel(t: ThreatInput): number {
	if (!t.alive) return 0.15;
	let x = t.waveActive ? 0.22 : 0.06;
	x += 0.16 * sat(t.hostiles, 8);
	x += 0.26 * sat(t.near, 4);
	x += 0.12 * sat(t.enemyAir, 2);
	x += 0.22 * sat(t.inbound, 1);
	x += 0.12 * t.lock;
	x += 0.1 * Math.max(0, 1 - t.hp / 0.5);
	if (t.baseUnderAttack) x += 0.08;
	return Math.min(1, Math.max(0, x));
}

export interface MusicLayers {
	/** Held chords: always there once the music is on. */
	pad: number;
	/** Pulsing bass ostinato. */
	bass: number;
	/** Kick, snare and hats. */
	drums: number;
	/** High arpeggio and war drums at the peak. */
	lead: number;
}

const smooth = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Layer mix for an intensity: each layer fades in over its own band. */
export function layersFor(level: number): MusicLayers {
	return {
		pad: 0.55 + 0.45 * smooth(0, 0.3, level),
		bass: smooth(0.18, 0.38, level),
		drums: smooth(0.4, 0.6, level),
		lead: smooth(0.66, 0.86, level)
	};
}

/** Seconds the score holds a peak before it starts to calm down. */
const HOLD = 5;

/**
 * Smooths the raw threat into a music intensity: it rises within a couple of
 * seconds when danger appears, holds a while, then settles slowly, so layers
 * don't flicker in and out with every missile.
 */
export class MusicDirector {
	level = 0;
	private peak = 0;
	private hold = 0;

	update(dt: number, target: number): number {
		if (target >= this.peak - 0.02) {
			this.peak = Math.max(target, this.peak);
			this.hold = HOLD;
		} else {
			this.hold -= dt;
			if (this.hold <= 0) this.peak = target;
		}
		const goal = Math.max(target, this.hold > 0 ? this.peak : target);
		const tau = goal > this.level ? 1.2 : 7;
		this.level += (goal - this.level) * (1 - Math.exp(-dt / tau));
		return this.level;
	}

	get layers(): MusicLayers {
		return layersFor(this.level);
	}

	reset(level = 0): void {
		this.level = this.peak = level;
		this.hold = 0;
	}
}

/** Tempo of the score, beats per minute (sixteenth-note grid). */
export const BPM = 108;

/** Four bars in D minor, i–VI–III–VII: MIDI notes of each bar's chord, root first. */
export const PROGRESSION: readonly (readonly number[])[] = [
	[50, 53, 57],
	[46, 50, 53],
	[53, 57, 60],
	[48, 52, 55]
];

export const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** One sixteenth step of the score: what each layer plays on it. */
export interface Step {
	bar: number;
	/** 0..15 within the bar. */
	pos: number;
	chord: readonly number[];
	/** Bass note (MIDI) on this step, or null for a rest. */
	bass: number | null;
	kick: boolean;
	snare: boolean;
	hat: boolean;
	/** Arpeggio note (MIDI), or null. */
	arp: number | null;
	/** Low war drum hit (only in the lead layer). */
	tom: boolean;
}

/** The pattern at a given sixteenth step (loops every four bars). */
export function stepAt(index: number): Step {
	const bar = Math.floor(index / 16) % PROGRESSION.length;
	const pos = ((index % 16) + 16) % 16;
	const chord = PROGRESSION[bar];
	const root = chord[0] - 12;
	// Galloping bass: eighths with a pickup on the last sixteenth of each beat pair.
	const bass = pos % 2 === 0 ? (pos === 14 ? root + 7 : root) : pos === 15 ? root + 12 : null;
	const arpShape = [0, 1, 2, 1];
	const arp = chord[arpShape[pos % 4]] + 12 + (pos >= 8 && pos % 4 === 2 ? 12 : 0);
	return {
		bar,
		pos,
		chord,
		bass,
		kick: pos === 0 || pos === 6 || pos === 8 || pos === 11,
		snare: pos === 4 || pos === 12,
		hat: pos % 2 === 0,
		arp,
		tom: pos === 0 || pos === 3 || pos === 6 || (bar === 3 && pos >= 12)
	};
}
