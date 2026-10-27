import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraRig } from './camera';
import { COOP_LIVES, pilotTag, RESPAWN_DELAY, SOLO_LIVES, Squadron } from './coop';
import { Input } from './input';
import { NO_INPUT, Player } from './player';
import { spawnBullet } from './projectiles';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { nearestFriendly } from './wingman';
import type { World } from './world';

const DT = 1 / 60;

/** Runs a seat's crash through to its outcome (a new airframe or sitting out). */
function crash(sq: Squadron, seat: number): string | null {
	let ev = sq.update(seat, true, DT);
	expect(ev).toBe('lost');
	for (let t = 0; t < RESPAWN_DELAY + 1 && ev !== 'respawn' && ev !== 'out'; t += DT)
		ev = sq.update(seat, true, DT);
	return ev;
}

function pair(w: World, x1: number, x2: number, alt = 150): [Player, Player] {
	const p = new Player('kestrel', x1, w.ground(x1) + alt, 0);
	const q = new Player('kestrel', x2, w.ground(x2) + alt, 0);
	p.invuln = q.invuln = 0;
	w.player = p;
	w.player2 = q;
	return [p, q];
}

describe('co-op squadron', () => {
	it('gives a solo pilot three aircraft and ends the sortie with the last', () => {
		const sq = new Squadron(1);
		expect(sq.lives).toBe(SOLO_LIVES);
		expect(crash(sq, 0)).toBe('respawn');
		expect(crash(sq, 0)).toBe('respawn');
		expect(sq.allOut()).toBe(false);
		expect(crash(sq, 0)).toBe('out');
		expect(sq.allOut()).toBe(true);
		expect(sq.lost).toBe(3);
	});

	it('shares one pool between two pilots and keeps flying while either is up', () => {
		const sq = new Squadron(2);
		expect(sq.lives).toBe(COOP_LIVES);
		// Player one burns through the whole pool...
		for (let i = 0; i < COOP_LIVES - 1; i++) expect(crash(sq, 0)).toBe('respawn');
		expect(sq.lives).toBe(1);
		// ...so their last loss leaves them out, but player two is still flying.
		expect(crash(sq, 0)).toBe('out');
		expect(sq.allOut()).toBe(false);
		expect(sq.update(1, false, DT)).toBeNull();
		// Player two's own crash, with nothing left in the pool, ends it.
		expect(crash(sq, 1)).toBe('out');
		expect(sq.allOut()).toBe(true);
	});

	it('does not charge aircraft in training and reports the respawn countdown', () => {
		const sq = new Squadron(1);
		expect(sq.update(0, true, DT, true)).toBe('lost');
		expect(sq.lives).toBe(SOLO_LIVES);
		expect(sq.respawnIn(0)).toBeGreaterThan(0);
		expect(sq.update(0, false, DT)).toBeNull();
	});
});

describe('co-op world', () => {
	it('sends the enemy after the closest aircraft still flying', () => {
		const w = testWorld();
		const [p, q] = pair(w, 1000, 1400);
		expect(w.pilots()).toEqual([p, q]);
		expect(w.nearestPilot(1350, q.y)).toBe(q);
		expect(w.nearestPilot(900, p.y)).toBe(p);
		q.landed = true;
		expect(w.nearestPilot(1350, q.y, false)).toBe(p);
		q.landed = false;
		q.alive = false;
		expect(w.nearestPilot(1350, q.y)).toBe(p);
	});

	it('makes air defences pick player two when it is the closer aircraft', () => {
		const w = testWorld();
		const [p, q] = pair(w, 1000, 1400);
		expect(nearestFriendly(w, 1450, q.y)).toBe(q);
		expect(nearestFriendly(w, 950, p.y)).toBe(p);
	});

	it('locks a SAM onto player two when it is the one in range', () => {
		const w = testWorld();
		const sam = w.spawnUnit('sam', 1700, -11);
		const [p, q] = pair(w, 300, 1550, 180);
		p.invuln = q.invuln = 1e9;
		for (let t = 0; t < 1.5; t += DT) simulateWorld(w, DT, NO_INPUT, NO_INPUT);
		expect(sam.alive).toBe(true);
		expect(q.lockProgress).toBeGreaterThan(0);
		expect(q.lockedBy).toBeGreaterThan(0);
		expect(p.lockProgress).toBe(0);
	});

	it('lets enemy fire hit player two', () => {
		const w = testWorld();
		const [, q] = pair(w, 300, 1500);
		const hp = q.hp;
		spawnBullet(w, {
			x: q.x - 20,
			y: q.y,
			z: 0,
			vx: 600,
			vy: 0,
			life: 1,
			damage: 5,
			owner: 'enemy',
			tracer: false,
			color: [1, 1, 1],
			size: 1,
			pierce: 0,
			explosive: 0
		});
		for (let i = 0; i < 10; i++) simulateWorld(w, DT, NO_INPUT, NO_INPUT);
		expect(q.hp).toBeLessThan(hp);
	});

	it('flies each aircraft from its own controls', () => {
		const w = testWorld();
		const [p, q] = pair(w, 300, 700, 200);
		const y0 = p.y - q.y;
		const climb = { ...NO_INPUT, steerX: 0, steerY: 1 };
		for (let t = 0; t < 2; t += DT) simulateWorld(w, DT, NO_INPUT, climb);
		// Player two pulled up; the player held its heading.
		expect(q.y - (p.y - y0)).toBeGreaterThan(10);
		expect(q.angle).toBeGreaterThan(p.angle + 0.3);
	});

	it('keeps both aircraft in the camera shot', () => {
		const w = testWorld();
		const [p, q] = pair(w, 600, 1000, 120);
		for (let t = 0; t < 4; t += DT) simulateWorld(w, DT, NO_INPUT, NO_INPUT);
		w.camera.update(0, w.ground(p.x));
		for (const a of [p, q]) {
			const s = w.camera.project(a.x, a.y, a.z, 1280, 720);
			expect(s).not.toBeNull();
			expect(s![0]).toBeGreaterThan(0);
			expect(s![0]).toBeLessThan(1280);
			expect(s![1]).toBeGreaterThan(0);
			expect(s![1]).toBeLessThan(720);
		}
	});

	it('pins a name tag to the screen edge when its aircraft is out of shot', () => {
		const cam = new CameraRig();
		cam.x = 0;
		cam.y = 50;
		cam.dist = 150;
		cam.update(0, 0);
		const inside = pilotTag(cam, { x: 0, y: 50, z: 0 }, 1280, 720);
		expect(inside?.off).toBe(false);
		const outside = pilotTag(cam, { x: 2000, y: 50, z: 0 }, 1280, 720);
		expect(outside?.off).toBe(true);
		expect(outside?.x).toBe(1280 - 28);
	});
});

describe('co-op controls', () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubPad(buttons: number[], axes: number[]): void {
		const pad = {
			connected: true,
			buttons: Array.from({ length: 17 }, (_, i) => ({
				pressed: buttons.includes(i),
				value: buttons.includes(i) ? 1 : 0
			})),
			axes
		};
		vi.stubGlobal('navigator', { getGamepads: () => [pad] });
	}

	it('gives the gamepad to player two in co-op and to the player solo', () => {
		// Stick hard right, right trigger (guns) held.
		stubPad([7], [1, 0, 0, 0]);
		const solo = new Input();
		solo.poll();
		expect(solo.pilot().steerX).toBe(1);
		expect(solo.pilot().fire).toBe(true);

		const coop = new Input();
		coop.coop = true;
		coop.poll();
		expect(coop.pilot().steerX).toBe(0);
		expect(coop.pilot().fire).toBe(false);
		expect(coop.p2Pilot().steerX).toBe(1);
		expect(coop.p2Pilot().fire).toBe(true);
		expect(coop.p2Ready()).toBe(true);
	});

	it("reads player two's missile button on the press, not while held", () => {
		stubPad([3], [0, 0, 0, 0]);
		const input = new Input();
		input.coop = true;
		input.poll();
		expect(input.p2MissilePressed()).toBe(true);
		input.poll();
		expect(input.p2MissilePressed()).toBe(false);
	});
});
