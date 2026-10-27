import { describe, expect, it } from 'vitest';
import gen from '../../../scripts/gen-voice.mjs?raw';
import { RADIO, RADIO_CUES, RECORDED, RadioDesk, RadioWatch, type RadioState } from './radio';

const calm: RadioState = {
	waveState: 'briefing',
	base: 1,
	baseUnderAttack: false,
	alive: true,
	landed: false,
	inbound: 0,
	lock: 0,
	enemyAir: 0,
	lives: 3,
	wingman: true,
	wingRejoins: 0
};

/** Runs the desk for `seconds`, returning every call it put on the air. */
const run = (d: RadioDesk, seconds: number, hold = false) => {
	const out: string[] = [];
	for (let t = 0; t < seconds; t += 0.05) {
		const tx = d.update(0.05, hold);
		if (tx) out.push(tx.cue);
	}
	return out;
};

describe('radio lines', () => {
	it('gives every call at least one take with a unique clip name', () => {
		const files = RADIO_CUES.flatMap((c) => RADIO[c].lines.map((l) => l.file));
		expect(RADIO_CUES.every((c) => RADIO[c].lines.length > 0)).toBe(true);
		expect(new Set(files).size).toBe(files.length);
		expect(files.every((f) => /^[a-z0-9-]+$/.test(f))).toBe(true);
	});

	it('only lists clips that belong to a call as recorded', () => {
		const files = new Set(RADIO_CUES.flatMap((c) => RADIO[c].lines.map((l) => l.file)));
		for (const f of RECORDED) expect(files.has(f)).toBe(true);
	});

	it('is the same script the voice generator reads', () => {
		expect(gen).toContain('src/lib/audio/radio-lines.json');
	});
});

describe('radio watch', () => {
	it('calls the wave going live, being cleared and the mission ending', () => {
		const w = new RadioWatch();
		w.update(calm);
		expect(w.update({ ...calm, waveState: 'active' })).toEqual(['waveInbound']);
		expect(w.update({ ...calm, waveState: 'cleared' })).toEqual(['waveClear']);
		expect(w.update({ ...calm, waveState: 'complete' })).toEqual(['missionComplete']);
	});

	it('warns once when the airfield is nearly lost, and on each new attack', () => {
		const w = new RadioWatch();
		w.update(calm);
		expect(w.update({ ...calm, baseUnderAttack: true })).toEqual(['baseHit']);
		expect(w.update({ ...calm, baseUnderAttack: true })).toEqual([]);
		expect(w.update({ ...calm, base: 0.3 })).toEqual(['baseCritical']);
		expect(w.update({ ...calm, base: 0.2 })).toEqual([]);
	});

	it('reacts to locks, missiles shaken off and bandits appearing', () => {
		const w = new RadioWatch();
		w.update(calm);
		expect(w.update({ ...calm, lock: 0.6, inbound: 1 })).toEqual(['enemyLock']);
		expect(w.update({ ...calm, lock: 0.9, inbound: 1 })).toEqual([]);
		expect(w.update({ ...calm, enemyAir: 2 })).toEqual(['missileDefeated', 'enemyAir']);
	});

	it('calls the aircraft lost, the last airframe and a takeoff after rearming', () => {
		const w = new RadioWatch();
		w.update({ ...calm, landed: true });
		expect(w.update(calm)).toEqual(['rearmed']);
		expect(w.update({ ...calm, alive: false, lives: 1 })).toEqual(['playerDown', 'lastAircraft']);
	});

	it("puts out the wingman's mayday when he goes down, and his call when a replacement joins", () => {
		const w = new RadioWatch();
		w.update(calm);
		expect(w.update({ ...calm, wingman: false })).toEqual(['wingmanDown']);
		expect(w.update({ ...calm, wingman: false })).toEqual([]);
		expect(w.update({ ...calm, wingman: true, wingRejoins: 1 })).toEqual(['wingBack']);
		expect(RADIO.wingmanDown.speaker).toBe('wingman');
		expect(RADIO.wingmanDown.lines.every((l) => /mayday/i.test(l.text))).toBe(true);
	});

	it('does not welcome back the first wingman of a sortie', () => {
		const w = new RadioWatch();
		w.update({ ...calm, wingman: false });
		expect(w.update(calm)).toEqual([]);
	});

	it('acknowledges the rearm order with clips that are not on disk yet, read by the speech voice', () => {
		expect(RADIO.wingRearm.lines.length).toBe(2);
		for (const l of RADIO.wingRearm.lines) expect(RECORDED.has(l.file)).toBe(false);
	});

	it('says nothing on the first frame of a sortie', () => {
		const w = new RadioWatch();
		expect(w.update({ ...calm, waveState: 'active', enemyAir: 3, lock: 1 })).toEqual([]);
	});

	it('does not count a missile as defeated when it took the aircraft down', () => {
		const w = new RadioWatch();
		w.update({ ...calm, inbound: 1 });
		expect(w.update({ ...calm, inbound: 0, alive: false })).toEqual(['playerDown']);
	});
});

describe('radio desk', () => {
	it('puts the most important waiting call on the air first, one at a time', () => {
		const d = new RadioDesk(() => 0);
		d.push('splash');
		d.push('playerDown');
		const said = run(d, 2);
		expect(said).toEqual(['playerDown']);
	});

	it('drops calls that went stale while the channel was busy', () => {
		const d = new RadioDesk(() => 0);
		d.push('splash');
		run(d, 5, true);
		expect(run(d, 5)).toEqual([]);
	});

	it('waits for the cockpit voice to finish', () => {
		const d = new RadioDesk(() => 0);
		d.push('waveInbound');
		expect(run(d, 3, true)).toEqual([]);
		expect(run(d, 3)).toEqual(['waveInbound']);
	});

	it('rests each call on its cooldown', () => {
		const d = new RadioDesk(() => 0);
		d.push('enemyAir');
		expect(run(d, 6)).toEqual(['enemyAir']);
		d.push('enemyAir');
		expect(run(d, 6)).toEqual([]);
	});

	it('never plays the same take twice in a row', () => {
		const d = new RadioDesk(() => 0);
		const takes: string[] = [];
		for (let i = 0; i < 4; i++) {
			d.push('splash');
			for (let t = 0; t < 12; t += 0.05) {
				const tx = d.update(0.05);
				if (tx) takes.push(tx.line.file);
			}
		}
		expect(takes).toHaveLength(4);
		for (let i = 1; i < takes.length; i++) expect(takes[i]).not.toBe(takes[i - 1]);
	});
});
