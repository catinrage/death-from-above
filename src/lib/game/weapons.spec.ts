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

describe('more bomb types', () => {
	const step = (w: ReturnType<typeof testWorld>, seconds: number): void => {
		for (let i = 0; i < seconds * 60; i++) updateBombs(w, 1 / 60);
	};

	it('every bomb has a plain one-line tip for new pilots', () => {
		for (const def of Object.values(BOMBS)) {
			expect(def.tip.length, def.id).toBeGreaterThan(10);
			expect(def.tip.length, def.id).toBeLessThan(70);
		}
	});

	it('airburst kills soldiers over a wide circle without a crater, but not tanks', () => {
		const w = testWorld();
		const before = w.ground(1500);
		const near = w.spawnUnit('rifleman', 1490, 0);
		const wide = w.spawnUnit('rifleman', 1515, 0);
		const tank = w.spawnUnit('tank', 1500, 0);
		dropBomb(w, BOMBS.frag, 1495, before + 60, 0, 0, -10, 0);
		step(w, 5);
		expect(near.alive).toBe(false);
		expect(wide.alive).toBe(false);
		expect(tank.alive).toBe(true);
		expect(w.ground(1500)).toBeCloseTo(before, 1);
	});

	it('a skip bomb bounces along the ground before the big blast', () => {
		const w = testWorld();
		const b = dropBomb(w, BOMBS.skip, 1300, w.ground(1300) + 12, 0, 80, 0, 0);
		let firstTouch = Number.NaN;
		for (let i = 0; i < 60 * 10 && b.alive; i++) {
			updateBombs(w, 1 / 60);
			if (b.hops === 1 && Number.isNaN(firstTouch)) firstTouch = b.x;
		}
		expect(b.alive).toBe(false);
		expect(b.hops).toBe(3);
		expect(b.x - firstTouch).toBeGreaterThan(20);
	});

	it('a glide bomb lands far beyond a plain bomb, where the sight says', () => {
		const w = testWorld();
		const x = 1000,
			y = w.ground(1000) + 150;
		const plain = predictImpact(w, x, y, 70, 0, BOMBS.gp.drag, null);
		const glide = predictImpact(w, x, y, 70, 0, BOMBS.glide.drag, null, BOMBS.glide.lift);
		expect(glide.x - x).toBeGreaterThan((plain.x - x) * 2);
		const b = dropBomb(w, BOMBS.glide, x, y, 0, 70, 0, 0);
		let lastX = b.x;
		for (let i = 0; i < 60 * 30 && b.alive; i++) {
			lastX = b.x;
			updateBombs(w, 1 / 60);
		}
		expect(Math.abs(lastX - glide.x)).toBeLessThan(8);
	});

	it('a hunter sends a seeker onto each vehicle below', () => {
		const w = testWorld();
		const tanks = [1460, 1500, 1540].map((x) => w.spawnUnit('tank', x, 0));
		dropBomb(w, BOMBS.hunter, 1470, w.ground(1470) + 140, 0, 30, 0, 0);
		step(w, 8);
		for (const t of tanks) expect(t.alive).toBe(false);
	});

	it('mines lie in wait and blow under the next vehicle to reach them', () => {
		const w = testWorld();
		dropBomb(w, BOMBS.mines, 1300, w.ground(1300) + 90, 0, 40, 0, 0);
		step(w, 6);
		const laid = w.bombs.filter((b) => b.rest >= 0);
		expect(laid.length).toBeGreaterThan(3);
		const truck = w.spawnUnit('truck', laid[0].x + 0.5, 0);
		step(w, 0.1);
		expect(truck.alive).toBe(false);
		expect(w.bombs.filter((b) => b.rest >= 0).length).toBe(laid.length - 1);
	});

	it('cryo freezes enemies in place and frozen ones take double damage', () => {
		const w = testWorld();
		const a = w.spawnUnit('tank', 1500, 0);
		const b = w.spawnUnit('tank', 1800, 0);
		dropBomb(w, BOMBS.cryo, 1500, w.ground(1500) + 30, 0, 0, -10, 0);
		step(w, 3);
		expect(a.stun).toBeGreaterThan(0);
		expect(a.frost).toBeGreaterThan(0);
		const hpA = a.hp,
			hpB = b.hp;
		explode(w, 1500, w.ground(1500) + 1, 0, BOMBS.gp.blast, 'player');
		explode(w, 1800, w.ground(1800) + 1, 0, BOMBS.gp.blast, 'player');
		expect(hpA - a.hp).toBeCloseTo((hpB - b.hp) * 2, 0);
	});

	it('tesla lightning jumps from enemy to enemy but not across a wide gap', () => {
		const w = testWorld();
		const chain = [1500, 1520, 1540, 1560].map((x) => w.spawnUnit('rifleman', x, 0));
		const far = w.spawnUnit('rifleman', 1660, 0);
		dropBomb(w, BOMBS.tesla, 1500, w.ground(1500) + 30, 0, 0, -10, 0);
		step(w, 3);
		for (const u of chain) expect(u.alive).toBe(false);
		expect(far.alive).toBe(true);
	});
});
