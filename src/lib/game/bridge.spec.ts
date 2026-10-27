import { describe, expect, it } from 'vitest';
import { TERRAIN_ROWS } from './constants';
import { BOMBS } from './defs-bombs';
import { explode } from './combat';
import { SPAN_HP, TRUSS_H } from './bridge';
import { NO_INPUT } from './player';
import { STRIP } from './river';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import type { World } from './world';

function setup(): { w: World; x0: number; deckY: number; level: number } {
	const w = testWorld();
	const r = w.river;
	if (!r || !w.bridge) throw new Error('test world has no river');
	return { w, x0: r.x0, deckY: r.deckY, level: r.level };
}

const run = (w: World, seconds: number): void => {
	for (let i = 0; i < seconds * 60; i++) simulateWorld(w, 1 / 60, NO_INPUT);
};

describe('river valley', () => {
	it('cuts a channel under the water and meets the deck at both abutments', () => {
		const { w, x0, deckY, level } = setup();
		const r = w.river!;
		expect(w.terrain.heightAt(x0)).toBeLessThan(level - 3);
		expect(w.terrain.heightAt(x0 - r.bridgeHalf)).toBeCloseTo(deckY, 1);
		expect(w.terrain.heightAt(x0 + r.bridgeHalf)).toBeCloseTo(deckY, 1);
		expect(w.surface.water(x0, 0)).toBe(level);
		expect(w.surface.water(x0 + 300, 0)).toBe(-Infinity);
	});

	it('keeps the banks above the water wherever the water mesh reaches', () => {
		const { w, level } = setup();
		const r = w.river!;
		for (const z of TERRAIN_ROWS) {
			for (const s of [-1, 1]) {
				const x = r.centerX(z) + s * (r.halfWidthAt(z) + STRIP);
				expect(w.terrain.heightAtXZ(x, z)).toBeGreaterThan(level + 0.2);
			}
		}
	});
});

describe('bridge', () => {
	it('carries a convoy across on the deck', () => {
		const { w, x0, deckY } = setup();
		const r = w.river!;
		const truck = w.spawnUnit('truck', x0 + r.bridgeHalf + 30, 0);
		let lowest = Infinity;
		for (let i = 0; i < 60 * 20 && truck.x > x0 - r.bridgeHalf - 20; i++) {
			simulateWorld(w, 1 / 60, NO_INPUT);
			if (Math.abs(truck.x - x0) < r.bridgeHalf - 2) lowest = Math.min(lowest, truck.y);
		}
		expect(truck.alive).toBe(true);
		expect(truck.x).toBeLessThan(x0 - r.bridgeHalf);
		expect(lowest).toBeCloseTo(deckY, 1);
	});

	it('takes three iron bombs on the deck, or one bunker buster, to drop a span', () => {
		const { w, deckY } = setup();
		const span = w.bridge!.spans[1];
		const mid = (span.x0 + span.x1) / 2;
		explode(w, mid, deckY, 0, BOMBS.gp.blast, 'player');
		expect(span.down).toBe(false);
		expect(span.hp).toBeLessThan(SPAN_HP);
		explode(w, mid, deckY, 0, BOMBS.gp.blast, 'player');
		explode(w, mid, deckY, 0, BOMBS.gp.blast, 'player');
		expect(span.down).toBe(true);
		expect(w.surface.clearance(mid)).toBeLessThan(deckY);
		const other = w.bridge!.spans[0];
		explode(w, (other.x0 + other.x1) / 2, deckY, 0, BOMBS.penetrator.blast, 'player');
		expect(other.down).toBe(true);
	});

	it('drops traffic into the river and stops the rest of the convoy at the gap', () => {
		const { w, deckY, level } = setup();
		const b = w.bridge!;
		const span = b.spans[2];
		const onSpan = w.spawnUnit('truck', (span.x0 + span.x1) / 2, 0);
		const behind = w.spawnUnit('jeep', b.east + 50, 0);
		run(w, 0.1);
		b.collapse(w, span, 'player');
		expect(onSpan.alive).toBe(false);
		const wreck = w.debris.list.filter((d) => d.parts.some((p) => p.mesh === 'bridgeDeckHalf'));
		expect(wreck.length).toBe(2);
		run(w, 12);
		expect(Math.max(...wreck.map((d) => d.y))).toBeLessThan(level + 1);
		expect(behind.alive).toBe(true);
		expect(behind.x).toBeGreaterThan(span.x1);
		expect(behind.x).toBeLessThan(span.x1 + 12);
		expect(behind.y).toBeCloseTo(deckY, 1);
	});

	it('swallows a bomb that misses into a water column instead of a crater', () => {
		const { w, x0, level } = setup();
		const bed = w.terrain.heightAt(x0 - 10);
		explode(w, x0 - 10, level, 0, BOMBS.gp.blast, 'player');
		expect(w.terrain.heightAt(x0 - 10)).toBeCloseTo(bed, 5);
		expect(w.surface.kind).toBe('water');
	});

	it('makes aircraft clear the steelwork and lets wreckage sink slowly', () => {
		const { w, x0, deckY, level } = setup();
		expect(w.surface.clearance(x0 + 15)).toBeCloseTo(deckY + TRUSS_H, 3);
		const rock = w.debris.spawn({
			x: x0 + 5,
			y: level + 6,
			z: 8,
			vx: 0,
			vy: 0,
			vz: 0,
			half: [0.5, 0.5, 0.5],
			parts: [{ mesh: 'chunk0', local: new Float32Array(16) }]
		});
		run(w, 2.5);
		expect(rock.wet).toBe(true);
		expect(Math.abs(rock.vy)).toBeLessThan(4);
	});

	it('is rebuilt and cleared for the next wave', () => {
		const { w } = setup();
		const b = w.bridge!;
		b.collapse(w, b.spans[0], 'player');
		b.rebuild(w);
		expect(b.downCount).toBe(0);
		expect(w.debris.list.some((d) => d.persistent)).toBe(false);
	});
});
