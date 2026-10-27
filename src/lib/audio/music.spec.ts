import { describe, expect, it } from 'vitest';
import {
	layersFor,
	MusicDirector,
	PROGRESSION,
	stepAt,
	threatLevel,
	type ThreatInput
} from './music';

const quiet: ThreatInput = {
	hostiles: 0,
	near: 0,
	enemyAir: 0,
	inbound: 0,
	lock: 0,
	hp: 1,
	baseUnderAttack: false,
	waveActive: false,
	alive: true
};

const settle = (d: MusicDirector, target: number, seconds: number) => {
	for (let t = 0; t < seconds; t += 0.05) d.update(0.05, target);
	return d.level;
};

describe('threat level', () => {
	it('climbs from a quiet sky through a wave to a missile fight', () => {
		const idle = threatLevel(quiet);
		const wave = threatLevel({ ...quiet, waveActive: true, hostiles: 10 });
		const close = threatLevel({ ...quiet, waveActive: true, hostiles: 10, near: 4 });
		const worst = threatLevel({
			...quiet,
			waveActive: true,
			hostiles: 14,
			near: 6,
			enemyAir: 2,
			inbound: 2,
			lock: 1,
			hp: 0.2,
			baseUnderAttack: true
		});
		expect(idle).toBeLessThan(0.15);
		expect(wave).toBeGreaterThan(idle);
		expect(close).toBeGreaterThan(wave);
		expect(worst).toBe(1);
	});
});

describe('music layers', () => {
	it('adds bass, then drums, then the lead as intensity rises', () => {
		expect(layersFor(0)).toMatchObject({ bass: 0, drums: 0, lead: 0 });
		expect(layersFor(0.4).bass).toBeGreaterThan(0.9);
		expect(layersFor(0.4).drums).toBe(0);
		expect(layersFor(0.65).drums).toBeGreaterThan(0.9);
		expect(layersFor(0.65).lead).toBe(0);
		expect(layersFor(1)).toEqual({ pad: 1, bass: 1, drums: 1, lead: 1 });
	});
});

describe('music director', () => {
	it('rises quickly when danger appears', () => {
		const d = new MusicDirector();
		expect(settle(d, 0.9, 3)).toBeGreaterThan(0.75);
	});

	it('holds a peak through a brief lull, then settles slowly', () => {
		const d = new MusicDirector();
		settle(d, 0.9, 4);
		expect(settle(d, 0.1, 3)).toBeGreaterThan(0.85);
		const after = settle(d, 0.1, 6);
		expect(after).toBeLessThan(0.85);
		expect(after).toBeGreaterThan(0.3);
		expect(settle(d, 0.1, 40)).toBeLessThan(0.15);
	});
});

describe('score pattern', () => {
	it('loops the four-bar progression with kick and snare on the grid', () => {
		expect(stepAt(0).chord).toBe(PROGRESSION[0]);
		expect(stepAt(16).chord).toBe(PROGRESSION[1]);
		expect(stepAt(64).chord).toBe(PROGRESSION[0]);
		expect(stepAt(0).kick).toBe(true);
		expect(stepAt(4).snare).toBe(true);
		expect(stepAt(12).snare).toBe(true);
		expect(stepAt(1).kick || stepAt(1).snare).toBe(false);
	});

	it('keeps the bass on the chord root, an octave down', () => {
		const s = stepAt(16 * 2);
		expect(s.bass).toBe(PROGRESSION[2][0] - 12);
	});
});
