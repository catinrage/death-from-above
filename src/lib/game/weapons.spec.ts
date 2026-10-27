import { describe, expect, it } from 'vitest';
import { explode } from './combat';
import { BOMBS } from './defs-bombs';
import { testWorld } from './test-world';
import { applyFireDamage, dropBomb, predictImpact, updateBombs } from './weapons';

describe('bombs', () => {
	it('lands where the bomb sight predicts', () => {
		const w = testWorld();
		const x = 1300,
			y = w.ground(1300) + 90;
		const hit = predictImpact(w, x, y, 70, 0, BOMBS.gp.drag, null);
		const b = dropBomb(w, BOMBS.gp, x, y, 0, 70, 0, 0);
		let lastX = b.x;
		for (let i = 0; i < 600 && b.alive; i++) {
			lastX = b.x;
			updateBombs(w, 1 / 60);
		}
		expect(b.alive).toBe(false);
		expect(Math.abs(lastX - hit.x)).toBeLessThan(4);
	});

	it('splits a cluster bomb into bomblets above the ground', () => {
		const w = testWorld();
		dropBomb(w, BOMBS.cluster, 1300, w.ground(1300) + 120, 0, 60, 0, 0);
		for (let i = 0; i < 240 && w.bombs.length < 5; i++) updateBombs(w, 1 / 60);
		expect(w.bombs.filter((b) => b.bomblet).length).toBe(16);
	});

	it('lets a guided bomb pick a target below and ahead', () => {
		const w = testWorld();
		const u = w.spawnUnit('tank', 1400, 0);
		const b = dropBomb(w, BOMBS.guided, 1340, w.ground(1340) + 80, 0, 60, 0, 0);
		expect(b.target).toBe(u);
	});

	it('napalm leaves a burning strip downrange that kills infantry standing in it', () => {
		const w = testWorld();
		const soldier = w.spawnUnit('rifleman', 1345, 0);
		const bystander = w.spawnUnit('rifleman', 1250, 0);
		dropBomb(w, BOMBS.napalm, 1290, w.ground(1290) + 15, 0, 40, -10, 0);
		for (let i = 0; i < 60 * 4; i++) {
			updateBombs(w, 1 / 60);
			applyFireDamage(w, 1 / 60);
		}
		expect(w.fires.list.length).toBeGreaterThan(3);
		expect(soldier.alive).toBe(false);
		expect(bystander.alive).toBe(true);
	});
});

describe('explosions', () => {
	it('kills soft targets in the blast radius and spares those outside it', () => {
		const w = testWorld();
		const near = w.spawnUnit('rifleman', 1500, 0);
		const far = w.spawnUnit('rifleman', 1540, 0);
		explode(w, 1502, w.ground(1502), 0, BOMBS.gp.blast, 'player');
		expect(near.alive).toBe(false);
		expect(far.alive).toBe(true);
	});

	it('needs penetration to crack armour', () => {
		const w = testWorld();
		const a = w.spawnUnit('bunker', 1500, 0);
		const b = w.spawnUnit('bunker', 1800, 0);
		explode(w, 1500, w.ground(1500) + 1, 0, BOMBS.gp.blast, 'player');
		explode(w, 1800, w.ground(1800) + 1, 0, BOMBS.penetrator.blast, 'player');
		expect(a.alive).toBe(true);
		expect(b.alive).toBe(false);
	});

	it('digs a crater on ground bursts', () => {
		const w = testWorld();
		const before = w.ground(1650);
		explode(w, 1650, before, 0, BOMBS.gp.blast, 'player');
		expect(w.ground(1650)).toBeLessThan(before - 1);
	});

	it('rewards kills through the event sink', () => {
		const w = testWorld();
		const kills: string[] = [];
		w.events = { ...w.events, kill: (name) => kills.push(name) };
		w.spawnUnit('truck', 1500, 0);
		explode(w, 1500, w.ground(1500), 0, BOMBS.gp.blast, 'player');
		expect(kills).toContain('Supply Truck');
	});
});
