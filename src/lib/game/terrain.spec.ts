import { describe, expect, it } from 'vitest';
import { WORLD } from './constants';
import { Terrain } from './terrain';

// A narrow strip keeps generation fast for unit tests.
const strip = (): Terrain => new Terrain(7, -200, 600);

describe('Terrain', () => {
	it('flattens the airbase to the base height', () => {
		const t = strip();
		for (let x = WORLD.runwayMinX; x <= WORLD.runwayMaxX; x += 20) {
			expect(t.heightAt(x)).toBeCloseTo(WORLD.baseHeight, 1);
		}
	});

	it('samples the battle line continuously', () => {
		const t = strip();
		const a = t.heightAt(450.0),
			b = t.heightAt(450.01);
		expect(Math.abs(a - b)).toBeLessThan(0.05);
		expect(t.heightAtXZ(450, 0)).toBeCloseTo(t.heightAt(450), 5);
	});

	it('blasts a crater with a raised lip, scorches it and marks chunks dirty', () => {
		const t = strip();
		const x = 480;
		const before = t.heightAt(x);
		const rimBefore = t.heightAt(x + 6);
		t.dirtyChunks.clear();
		t.crater(x, 0, 5, 2, 1, 0);
		expect(t.heightAt(x)).toBeCloseTo(before - 2, 1);
		expect(t.heightAt(x + 6)).toBeGreaterThan(rimBefore);
		expect(t.scorchAt(x)).toBeGreaterThan(0.9);
		expect(t.dirtyChunks.size).toBeGreaterThan(0);
	});

	it('limits how deep repeated blasts can dig', () => {
		const t = strip();
		const before = t.heightAt(500);
		for (let i = 0; i < 20; i++) t.crater(500, 0, 5, 3);
		expect(before - t.heightAt(500)).toBeLessThanOrEqual(9.01);
	});

	it('cools glowing scorch marks back to charcoal', () => {
		const t = strip();
		t.crater(420, 0, 4, 1, 1, 1);
		const i = t.zeroRow * t.cols + Math.round(t.colOf(420));
		expect(t.scorch[i]).toBeGreaterThan(1);
		for (let k = 0; k < 100; k++) t.update(0.25);
		expect(t.scorch[i]).toBeCloseTo(1, 5);
	});

	it('restores the original landscape on reset', () => {
		const t = strip();
		const before = t.heightAt(450);
		t.crater(450, 0, 6, 3);
		t.reset();
		expect(t.heightAt(450)).toBeCloseTo(before, 5);
		expect(t.scorchAt(450)).toBe(0);
	});

	it('emits interleaved vertices and matching indices for every chunk', () => {
		const t = strip();
		const [c0, c1] = t.chunkRange(0);
		const verts = t.chunkVertices(0);
		expect(verts.length).toBe((c1 - c0 + 1) * t.rows * 7);
		const idx = t.chunkIndices(0);
		expect(Math.max(...idx)).toBe(verts.length / 7 - 1);
	});
});

describe('Terrain cooling', () => {
	it('does not bank idle time against the next hot crater', () => {
		const t = new Terrain(7, -200, 600);
		for (let i = 0; i < 300; i++) t.update(0.1);
		t.crater(420, 0, 4, 1, 1, 1);
		t.update(0.25);
		const i = t.zeroRow * t.cols + Math.round(t.colOf(420));
		expect(t.scorch[i]).toBeGreaterThan(1.5);
	});
});
