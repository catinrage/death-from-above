import { describe, expect, it } from 'vitest';
import { WORLD } from './constants';
import { levelOff, pullUpRoom, safeTurn } from './terrain-floor';
import { testWorld } from './test-world';
import { Wingman } from './wingman';
import { wingProfile } from './wing-profile';

const STEP = 1 / 60;

describe('pullUpRoom', () => {
	it('needs no room while climbing or level', () => {
		expect(pullUpRoom(0.4, 100, 1)).toBe(0);
		expect(pullUpRoom(0, 100, 1)).toBe(0);
	});

	it('needs more room the steeper and faster the dive and the slower the turn', () => {
		const shallow = pullUpRoom(-0.3, 90, 1.2);
		const steep = pullUpRoom(-1.4, 90, 1.2);
		expect(steep).toBeGreaterThan(shallow);
		expect(pullUpRoom(-1.4, 90, 0.8)).toBeGreaterThan(steep);
		// Straight down at 90 m/s turning 1.2 rad/s: a 75 m arc plus the reaction.
		expect(pullUpRoom(-Math.PI / 2, 90, 1.2)).toBeCloseTo(75 + 22.5, 0);
	});
});

describe('safeTurn', () => {
	it('turns the short way when high, or for small corrections', () => {
		expect(safeTurn(0, -2.5, false)).toBeCloseTo(-2.5);
		expect(safeTurn(0, -0.4, true)).toBeCloseTo(-0.4);
	});

	it('reverses up and over when low, facing either way', () => {
		expect(safeTurn(0, -2.5, true)).toBeGreaterThan(0);
		expect(safeTurn(Math.PI, 0.1, true)).toBeLessThan(0);
	});
});

describe('levelOff', () => {
	it('levels a nose pointing into the ground and leaves a climb alone', () => {
		expect(levelOff(-0.5)).toBe(0);
		expect(levelOff(-2.6)).toBe(Math.PI);
		expect(levelOff(0.3)).toBe(0.3);
	});
});

describe('commander aircraft with nothing to hit', () => {
	it('a bomber holds a level racetrack and never touches the ground', () => {
		const w = testWorld();
		w.player = null;
		const x = WORLD.runwayMaxX + 600;
		const jet = new Wingman(x, w.ground(x) + 170, {
			aircraft: 'b1',
			callsign: null,
			profile: wingProfile('b1'),
			autoRearm: true
		});
		jet.patrol = x;
		w.escorts.push(jet);
		let lowest = Infinity;
		let steepest = 0;
		for (let t = 0; t < 60; t += STEP) {
			jet.update(w, STEP);
			lowest = Math.min(lowest, jet.y - w.surface.clearance(jet.x));
			steepest = Math.max(steepest, -Math.sin(jet.angle));
		}
		expect(jet.alive).toBe(true);
		expect(lowest).toBeGreaterThan(30);
		// No vertical loops: it never points more than ~40 degrees nose-down.
		expect(steepest).toBeLessThan(0.65);
	});
});
