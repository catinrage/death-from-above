import { describe, expect, it } from 'vitest';
import { BOMBS } from './defs-bombs';
import { explode } from './combat';
import { PONTOON_BUILD, PONTOON_HP, SPAN_HP, TRUSS_H } from './bridge';
import { killUnit } from './deaths';
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
		for (const p of r.path) {
			if (p.depth <= 0) continue;
			for (const s of [-1, 1]) {
				const u = s * (p.hw + STRIP);
				expect(w.terrain.heightAtXZ(p.x + p.nx * u, p.z + p.nz * u)).toBeGreaterThan(level + 0.2);
			}
		}
	});

	it('winds away from the straight line and thins out at its source', () => {
		const { w, x0 } = setup();
		const r = w.river!;
		const xs = r.path.map((p) => p.x);
		expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(150);
		const src = r.path[r.path.length - 1];
		expect(src.hw).toBeLessThan(r.halfWidth * 0.5);
		expect(Math.abs(src.x - x0)).toBeGreaterThan(100);
		// Straight and full width where the bridge crosses.
		expect(r.offset(x0, 0)).toBeCloseTo(0, 5);
		expect(r.channel(x0 + 30, 0).hw).toBeCloseTo(r.halfWidth, 5);
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

describe('pontoon bridge engineers', () => {
	const engineers = (w: World) => w.units.filter((u) => u.alive && u.def.kind === 'engineer');

	it('sends a crew to a stranded column, lays a pontoon, and lets traffic cross on it', () => {
		const { w, deckY } = setup();
		const b = w.bridge!;
		const span = b.spans[2];
		b.collapse(w, span, 'player');
		const truck = w.spawnUnit('truck', b.east + 20, 0);
		run(w, 2);
		expect(engineers(w).length).toBe(0);
		run(w, 8);
		const crew = engineers(w);
		expect(crew.length).toBe(1);
		// Skip the long drive in from the spawn point.
		crew[0].x = b.east + 40;
		run(w, 6);
		expect(span.pontoon).not.toBeNull();
		expect(span.pontoon!.up).toBe(false);
		expect(b.stopLine(truck.x, -1, truck.def.half[0])).not.toBeNull();
		run(w, PONTOON_BUILD);
		expect(span.pontoon!.up).toBe(true);
		expect(b.deckAt((span.x0 + span.x1) / 2, 0)).toBe(deckY);
		expect(w.surface.clearance((span.x0 + span.x1) / 2)).toBeLessThan(deckY + TRUSS_H);
		let lowest = Infinity;
		for (let i = 0; i < 60 * 20 && truck.x > span.x0 - 10; i++) {
			simulateWorld(w, 1 / 60, NO_INPUT);
			if (truck.x > span.x0 + 2 && truck.x < span.x1 - 2) lowest = Math.min(lowest, truck.y);
		}
		expect(truck.alive).toBe(true);
		expect(truck.x).toBeLessThan(span.x0 - 10);
		expect(lowest).toBeCloseTo(deckY, 1);
	});

	it('stops laying when the crew is killed', () => {
		const { w } = setup();
		const b = w.bridge!;
		const span = b.spans[1];
		b.collapse(w, span, 'player');
		const crew = w.spawnUnit('engineer', span.x1 + 30, 0);
		run(w, 6);
		const laid = span.pontoon!.progress;
		expect(laid).toBeGreaterThan(0);
		killUnit(w, crew, crew.x, 'blast', 'player');
		run(w, 5);
		expect(span.pontoon!.progress).toBeCloseTo(laid, 5);
		expect(span.pontoon!.up).toBe(false);
	});

	it('sinks under one iron bomb, dropping its traffic and closing the gap again', () => {
		const { w, deckY } = setup();
		const b = w.bridge!;
		const span = b.spans[2];
		b.collapse(w, span, 'player');
		span.pontoon = { progress: 1, hp: PONTOON_HP, flash: 0, up: true, from: 1 };
		const mid = (span.x0 + span.x1) / 2;
		const jeep = w.spawnUnit('jeep', mid + 8, 0);
		expect(jeep.y).toBeCloseTo(deckY, 1);
		explode(w, mid, deckY, 0, BOMBS.gp.blast, 'player');
		expect(span.pontoon).toBeNull();
		expect(jeep.alive).toBe(false);
		expect(b.deckAt(mid, 0)).toBeNull();
		expect(b.stopLine(b.east + 10, -1, 2)).toBeCloseTo(span.x1 + 3.5, 5);
	});

	it('takes cannon fire on the treadway', () => {
		const { w } = setup();
		const b = w.bridge!;
		const span = b.spans[3];
		b.collapse(w, span, 'player');
		span.pontoon = { progress: 1, hp: PONTOON_HP, flash: 0, up: true, from: 1 };
		b.damage(w, span, 30, 'player');
		expect(span.pontoon.hp).toBe(PONTOON_HP - 30);
		b.damage(w, span, PONTOON_HP, 'player');
		expect(span.pontoon).toBeNull();
	});

	it('is cleared away when the steel bridge is rebuilt', () => {
		const { w } = setup();
		const b = w.bridge!;
		const span = b.spans[0];
		b.collapse(w, span, 'player');
		span.pontoon = { progress: 0.5, hp: PONTOON_HP, flash: 0, up: false, from: 1 };
		b.rebuild(w);
		expect(span.pontoon).toBeNull();
		expect(b.downCount).toBe(0);
	});
});
