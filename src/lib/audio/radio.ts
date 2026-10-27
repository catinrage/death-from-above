import script from './radio-lines.json';

/** Who is on the radio: the airfield's tower, or the wingman flying top cover. */
export type Speaker = 'tower' | 'wingman';

export type RadioCue =
	| 'sortie'
	| 'rearmed'
	| 'waveInbound'
	| 'waveClear'
	| 'missionComplete'
	| 'baseHit'
	| 'baseCritical'
	| 'playerDown'
	| 'lastAircraft'
	| 'enemyAir'
	| 'enemyLock'
	| 'missileDefeated'
	| 'splash'
	| 'streak'
	| 'wingAttack'
	| 'wingCover'
	| 'wingSams'
	| 'wingRearm'
	| 'wingBack'
	| 'wingmanDown';

export interface RadioLine {
	/** Clip file (static/audio/radio/<file>.mp3). */
	file: string;
	/** The words, for subtitles and the speech fallback. */
	text: string;
}

interface CueTiming {
	/** Higher goes first when several calls are waiting. */
	priority: number;
	/** Seconds before the same call can be made again. */
	cooldown: number;
	/** Seconds a call stays worth making; after that it is old news and dropped. */
	ttl: number;
}

const TIMING: Record<RadioCue, CueTiming> = {
	playerDown: { priority: 6, cooldown: 4, ttl: 4 },
	// Two's mayday goes out the moment he is hit, ahead of routine chatter.
	wingmanDown: { priority: 5, cooldown: 3, ttl: 6 },
	missionComplete: { priority: 6, cooldown: 30, ttl: 8 },
	lastAircraft: { priority: 5, cooldown: 30, ttl: 8 },
	baseCritical: { priority: 5, cooldown: 60, ttl: 8 },
	enemyLock: { priority: 4, cooldown: 14, ttl: 1.5 },
	// Acknowledging an order the pilot just gave: quick, or not at all.
	wingAttack: { priority: 4, cooldown: 1, ttl: 1.2 },
	wingCover: { priority: 4, cooldown: 1, ttl: 1.2 },
	wingSams: { priority: 4, cooldown: 1, ttl: 1.2 },
	wingRearm: { priority: 4, cooldown: 1, ttl: 1.2 },
	wingBack: { priority: 3, cooldown: 5, ttl: 8 },
	baseHit: { priority: 3, cooldown: 30, ttl: 4 },
	enemyAir: { priority: 3, cooldown: 30, ttl: 5 },
	waveInbound: { priority: 3, cooldown: 10, ttl: 6 },
	waveClear: { priority: 3, cooldown: 10, ttl: 6 },
	sortie: { priority: 2, cooldown: 6, ttl: 6 },
	rearmed: { priority: 2, cooldown: 20, ttl: 4 },
	missileDefeated: { priority: 2, cooldown: 12, ttl: 2 },
	streak: { priority: 1, cooldown: 18, ttl: 2.5 },
	splash: { priority: 1, cooldown: 7, ttl: 2.5 }
};

export interface CueSpec extends CueTiming {
	speaker: Speaker;
	lines: RadioLine[];
}

const raw = script.cues as Record<RadioCue, { speaker: Speaker; lines: string[][] }>;

/** Every radio call, its speaker, takes and timing. Lines live in radio-lines.json, shared with scripts/gen-voice.mjs. */
export const RADIO: Record<RadioCue, CueSpec> = Object.fromEntries(
	(Object.keys(TIMING) as RadioCue[]).map((c) => [
		c,
		{
			...TIMING[c],
			speaker: raw[c].speaker,
			lines: raw[c].lines.map(([file, text]) => ({ file, text }))
		}
	])
) as Record<RadioCue, CueSpec>;

export const RADIO_CUES = Object.keys(TIMING) as RadioCue[];

/** Clips that `pnpm voice radio` has generated; the rest are read by the speech voice. */
export const RECORDED: ReadonlySet<string> = new Set(script.recorded);

/** What the radio watches each frame to decide when something is worth a call. */
export interface RadioState {
	waveState: 'idle' | 'briefing' | 'active' | 'cleared' | 'complete';
	/** Airfield health, 0..1. */
	base: number;
	baseUnderAttack: boolean;
	alive: boolean;
	landed: boolean;
	/** Missiles homing on the aircraft. */
	inbound: number;
	/** 0..1 progress of the closest enemy lock. */
	lock: number;
	/** Enemy aircraft alive. */
	enemyAir: number;
	/** Aircraft left, this one included. */
	lives: number;
	/** The AI wingman is flying (false when there is none or it is down). */
	wingman: boolean;
	/** Replacement wingmen that have joined so far. */
	wingRejoins: number;
}

/** Turns changes in the battle into radio calls. Pure: no audio, no timing beyond edges. */
export class RadioWatch {
	private prev: RadioState | null = null;
	private baseWarned = false;

	update(s: RadioState): RadioCue[] {
		const p = this.prev;
		this.prev = { ...s };
		if (!p) return [];
		const out: RadioCue[] = [];
		if (s.waveState !== p.waveState) {
			if (s.waveState === 'active') out.push('waveInbound');
			else if (s.waveState === 'cleared') out.push('waveClear');
			else if (s.waveState === 'complete') out.push('missionComplete');
		}
		if (s.base < 0.35 && !this.baseWarned && s.base > 0) {
			this.baseWarned = true;
			out.push('baseCritical');
		} else if (s.baseUnderAttack && !p.baseUnderAttack) out.push('baseHit');
		if (p.alive && !s.alive) out.push('playerDown');
		if (s.lives === 1 && p.lives > 1) out.push('lastAircraft');
		if (p.wingman && !s.wingman) out.push('wingmanDown');
		if (s.wingRejoins > p.wingRejoins) out.push('wingBack');
		if (s.alive && p.landed && !s.landed) out.push('rearmed');
		if (s.alive && s.lock >= 0.5 && p.lock < 0.5) out.push('enemyLock');
		if (s.alive && p.inbound > 0 && s.inbound === 0) out.push('missileDefeated');
		if (s.enemyAir > 0 && p.enemyAir === 0) out.push('enemyAir');
		return out;
	}

	reset(): void {
		this.prev = null;
		this.baseWarned = false;
	}
}

export interface Transmission {
	cue: RadioCue;
	speaker: Speaker;
	line: RadioLine;
}

/** Quiet seconds between two transmissions, so calls don't step on each other. */
const GAP = 1.2;

/**
 * Who talks next: one transmission at a time, most important call first,
 * stale calls dropped, each call resting on its own cooldown and never the
 * same take twice in a row. The audio engine reports how long each one lasts.
 */
export class RadioDesk {
	private readonly pending = new Map<RadioCue, number>();
	private readonly cool = new Map<RadioCue, number>();
	private readonly lastTake = new Map<RadioCue, number>();
	private busy = -GAP;

	constructor(private readonly rand: () => number = Math.random) {}

	/** Queues a call (a repeat of one already waiting just refreshes it). */
	push(cue: RadioCue): void {
		if ((this.cool.get(cue) ?? 0) > 0) return;
		this.pending.set(cue, RADIO[cue].ttl);
	}

	/** True while a transmission is on the air. */
	get talking(): boolean {
		return this.busy > 0;
	}

	/** Advances time; returns what to put on the air now. `hold` blocks new calls (the cockpit voice is talking). */
	update(dt: number, hold = false): Transmission | null {
		this.busy -= dt;
		for (const [c, t] of this.cool) this.cool.set(c, t - dt);
		for (const [c, t] of this.pending) {
			if (t - dt <= 0) this.pending.delete(c);
			else this.pending.set(c, t - dt);
		}
		if (hold || this.busy > -GAP || this.pending.size === 0) return null;
		let cue: RadioCue | null = null;
		for (const c of this.pending.keys())
			if (!cue || RADIO[c].priority > RADIO[cue].priority) cue = c;
		if (!cue) return null;
		this.pending.delete(cue);
		this.cool.set(cue, RADIO[cue].cooldown);
		const spec = RADIO[cue];
		const last = this.lastTake.get(cue) ?? -1;
		let take = Math.floor(this.rand() * spec.lines.length) % spec.lines.length;
		if (take === last && spec.lines.length > 1) take = (take + 1) % spec.lines.length;
		this.lastTake.set(cue, take);
		this.busy = estimateLength(spec.lines[take].text);
		return { cue, speaker: spec.speaker, line: spec.lines[take] };
	}

	/** The engine knows the real clip length once it starts playing. */
	onAir(seconds: number): void {
		this.busy = seconds;
	}

	reset(): void {
		this.pending.clear();
		this.cool.clear();
		this.busy = -GAP;
	}
}

/** Rough spoken length of a line, for the speech fallback (about 2.8 words a second). */
export function estimateLength(text: string): number {
	return 0.5 + text.split(/\s+/).length / 2.8;
}
