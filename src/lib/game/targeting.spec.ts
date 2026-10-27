import { describe, expect, it } from 'vitest';
import { BOMBS } from './defs-bombs';
import { AirUnit } from './enemy-air';
import { NO_INPUT, Player } from './player';
import { simulateWorld } from './simulate';
import { MAX_LOCKS, Targeting, trackUnit } from './targeting';
import { testWorld } from './test-world';
import type { Designation, Unit } from './types';
import { dropBomb, updateBombs } from './weapons';
import type { World } from './world';

const W = 1600,
	H = 900;

/** World with the camera parked over x≈1500 and the aircraft above it. */
function scene(): { w: World; p: Player } {
	const w = testWorld();
	const p = new Player('kestrel', 1420, w.ground(1420) + 50, 0);
	p.invuln = 1e9;
	w.player = p;
	w.camera.aspect = W / H;
	w.camera.interest = null;
	w.camera.snap({ x: 1480, y: w.ground(1480) + 40, vx: 0, vy: 0 }, w.ground(1480));
	w.camera.update(0, w.ground(1480));
	return { w, p };
}

const designate = (u: Unit): Designation => ({ track: trackUnit(u), unit: u, x: u.x, y: u.y });

function screenOf(w: World, x: number, y: number): { x: number; y: number; active: boolean } {
	const s = w.camera.project(x, y, 0, W, H);
	if (!s) throw new Error('point off screen');
	return { x: s[0], y: s[1], active: true };
}

describe('reticle', () => {
	it('maps the cursor back onto the battle plane', () => {
		const { w } = scene();
		const target = [1510, w.ground(1510) + 12];
		const s = screenOf(w, target[0], target[1]);
		const hit = w.camera.unproject(s.x, s.y, W, H);
		expect(hit?.[0]).toBeCloseTo(target[0], 1);
		expect(hit?.[1]).toBeCloseTo(target[1], 1);
	});

	it('picks the enemy under the reticle and publishes the laser spot', () => {
		const { w } = scene();
		const tank = w.spawnUnit('tank', 1500, 0);
		w.spawnUnit('truck', 1540, 0);
		const t = new Targeting();
		t.update(0.016, w, w.camera, W, H, screenOf(w, 1500, tank.y + 1.3), false, 6);
		expect(t.hover?.unit).toBe(tank);
		expect(w.designator?.x).toBeCloseTo(1500, 0);
	});
});

describe('painting locks in focus', () => {
	it('locks targets the reticle rests on, but only in focus', () => {
		const { w } = scene();
		const a = w.spawnUnit('jeep', 1490, 0);
		const t = new Targeting();
		const at = screenOf(w, 1490, a.y + 0.9);
		for (let i = 0; i < 10; i++) t.update(0.016, w, w.camera, W, H, at, false, 6);
		expect(t.locks.length).toBe(0);
		for (let i = 0; i < 10; i++) t.update(0.016, w, w.camera, W, H, at, true, 6);
		expect(t.locks.map((l) => l.unit)).toEqual([a]);
	});

	it('sweeps across several targets, capped by missiles left', () => {
		const { w } = scene();
		const units = [1470, 1500, 1530].map((x) => w.spawnUnit('truck', x, 0));
		const t = new Targeting();
		for (const u of units) {
			const at = screenOf(w, u.x, u.y + 1.4);
			for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, 2);
		}
		expect(t.locks.length).toBe(2);
	});

	it('needs an unbroken dwell to paint a lock', () => {
		const { w } = scene();
		const a = w.spawnUnit('jeep', 1490, 0);
		const t = new Targeting();
		const on = screenOf(w, 1490, a.y + 0.9);
		const off = { x: 40, y: 40, active: true };
		for (let i = 0; i < 4; i++) t.update(0.016, w, w.camera, W, H, on, true, 6);
		t.update(0.016, w, w.camera, W, H, off, true, 6);
		for (let i = 0; i < 3; i++) t.update(0.016, w, w.camera, W, H, on, true, 6);
		expect(t.locks.length).toBe(0);
	});

	it('hides the reticle when cleared', () => {
		const { w } = scene();
		const t = new Targeting();
		t.update(0.016, w, w.camera, W, H, screenOf(w, 1500, w.ground(1500)), false, 6);
		expect(t.pointer).toBe(true);
		t.clear();
		expect(t.pointer).toBe(false);
		expect(t.aim).toBeNull();
	});

	it('lets go of locks once the missiles for them are committed elsewhere', () => {
		const { w } = scene();
		const units = [1470, 1500, 1530].map((x) => w.spawnUnit('truck', x, 0));
		const t = new Targeting();
		for (const u of units) {
			const at = screenOf(w, u.x, u.y + 1.4);
			for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, 6);
		}
		expect(t.locks.length).toBe(3);
		t.update(0.016, w, w.camera, W, H, { x: 0, y: 0, active: false }, true, 1);
		expect(t.locks.map((l) => l.unit)).toEqual([units[0]]);
	});

	it('paints the nearest targets automatically without a pointer', () => {
		const { w } = scene();
		for (let i = 0; i < 9; i++) w.spawnUnit('rifleman', 1450 + i * 6, 0);
		const t = new Targeting();
		for (let i = 0; i < 120; i++)
			t.update(0.016, w, w.camera, W, H, { x: 0, y: 0, active: false }, true, 9);
		expect(t.locks.length).toBe(MAX_LOCKS);
	});

	it('drops locks whose target dies', () => {
		const { w } = scene();
		const a = w.spawnUnit('jeep', 1490, 0);
		const t = new Targeting();
		const at = screenOf(w, 1490, a.y + 0.9);
		for (let i = 0; i < 10; i++) t.update(0.016, w, w.camera, W, H, at, true, 6);
		a.alive = false;
		t.update(0.016, w, w.camera, W, H, at, true, 6);
		expect(t.locks.length).toBe(0);
	});
});

describe('guided weapons', () => {
	it('sends one missile per painted lock and kills them', () => {
		const { w, p } = scene();
		const units = [1500, 1520, 1545].map((x) => w.spawnUnit('jeep', x, 0));
		for (const u of units) u.def = { ...u.def, speed: 0 };
		const t = new Targeting();
		for (const u of units) {
			const at = screenOf(w, u.x, u.y + 0.9);
			for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, p.missiles);
		}
		const salvo = t.salvo(w, p, p.missiles);
		expect(salvo.length).toBe(3);
		expect(t.locks.length).toBe(0);
		p.vx = 0.01;
		p.vy = 0;
		simulateWorld(w, 1 / 60, { ...NO_INPUT, missiles: salvo });
		for (let i = 0; i < 60 * 6; i++) {
			p.y = w.ground(p.x) + 50;
			p.vy = 0;
			simulateWorld(w, 1 / 60, NO_INPUT);
		}
		expect(p.missiles).toBe(p.def.missiles - 3);
		expect(units.every((u) => !u.alive)).toBe(true);
	});

	it('does not repaint a target that already has a missile on the way', () => {
		const { w, p } = scene();
		const a = w.spawnUnit('jeep', 1500, 0);
		a.def = { ...a.def, speed: 0 };
		const t = new Targeting();
		const at = screenOf(w, 1500, a.y + 0.9);
		for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, p.missiles);
		simulateWorld(w, 1 / 60, { ...NO_INPUT, missiles: t.salvo(w, p, p.missiles) });
		for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, p.missiles);
		expect(t.locks.length).toBe(0);
	});

	it('queues a second salvo fired while the first is still leaving the rails', () => {
		const { w, p } = scene();
		const a = w.spawnUnit('jeep', 1500, 0);
		const b = w.spawnUnit('jeep', 1530, 0);
		simulateWorld(w, 1 / 60, { ...NO_INPUT, missiles: [designate(a), designate(a)] });
		simulateWorld(w, 1 / 60, { ...NO_INPUT, missiles: [designate(b)] });
		for (let i = 0; i < 30; i++) simulateWorld(w, 1 / 60, NO_INPUT);
		expect(p.missiles).toBe(p.def.missiles - 3);
		expect(w.missiles.filter((m) => m.kind === 'agm').length).toBe(3);
	});

	it('never sends a guided bomb after an aircraft', () => {
		const { w } = scene();
		const heli = new AirUnit(w.newId(), 'heli', 1500, w.ground(1500) + 40);
		w.air.push(heli);
		const t = new Targeting();
		t.update(0.016, w, w.camera, W, H, { x: 0, y: 0, active: false }, false, 6);
		// No pointer: the bomb picks a ground target it can reach on its own.
		expect(t.bombTarget(w)).toBeNull();
		t.update(0.016, w, w.camera, W, H, screenOf(w, heli.x, heli.y), false, 6);
		expect(t.hover?.air).toBe(heli);
		const d = t.bombTarget(w);
		expect(d?.unit).toBeNull();
		expect(d?.y).toBeCloseTo(w.ground(d?.x ?? 0), 3);
	});

	it('locks air targets too', () => {
		const { w, p } = scene();
		const heli = new AirUnit(w.newId(), 'heli', 1520, w.ground(1520) + 45);
		w.air.push(heli);
		const t = new Targeting();
		const at = screenOf(w, heli.x, heli.y);
		for (let i = 0; i < 8; i++) t.update(0.016, w, w.camera, W, H, at, true, p.missiles);
		expect(t.locks[0]?.air).toBe(heli);
	});

	it('steers a guided bomb onto the designated unit', () => {
		const { w } = scene();
		// The decoy sits where an undesignated guided bomb would pick on its own.
		const decoy = w.spawnUnit('truck', 1512, 0);
		const target = w.spawnUnit('truck', 1536, 0);
		const y = w.ground(1470) + 70;
		expect(dropBomb(w, BOMBS.guided, 1470, y, 0, 55, 0, 0).target).toBe(decoy);
		const t = new Targeting();
		t.update(0.016, w, w.camera, W, H, screenOf(w, 1536, target.y + 1.4), false, 6);
		const b = dropBomb(w, BOMBS.guided, 1470, y, 0, 55, 0, 0, t.bombTarget(w));
		expect(b.target).toBe(target);
		for (let i = 0; i < 600 && b.alive; i++) updateBombs(w, 1 / 60);
		expect(target.alive).toBe(false);
	});

	it('lets a bomb released onto open ground follow the moving reticle', () => {
		const { w } = scene();
		const t = new Targeting();
		t.update(0.016, w, w.camera, W, H, screenOf(w, 1500, w.ground(1500) + 1), false, 6);
		const b = dropBomb(w, BOMBS.guided, 1440, w.ground(1440) + 90, 0, 50, 0, 0, t.bombTarget(w));
		expect(b.target).toBeNull();
		w.designator = { x: 1560, y: w.ground(1560) };
		let lastX = b.x;
		for (let i = 0; i < 600 && b.alive; i++) {
			lastX = b.x;
			updateBombs(w, 1 / 60);
		}
		expect(Math.abs(lastX - 1560)).toBeLessThan(8);
	});
});
