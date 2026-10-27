import { describe, expect, it } from 'vitest';
import { BOMBS } from './defs-bombs';
import { bigKillAt, KILLCAM_TIME_SCALE, KillCam } from './killcam';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { dropBomb } from './weapons';
import type { World } from './world';

const FRAME = 1 / 60;

function bridgeWorld(): { w: World; mid: number; deckY: number } {
	const w = testWorld();
	if (!w.river || !w.bridge) throw new Error('test world has no river');
	const span = w.bridge.spans[1];
	return { w, mid: (span.x0 + span.x1) / 2, deckY: w.river.deckY };
}

/** A flat-ish spot well clear of the river for depots. */
function depotSite(w: World): number {
	return w.river!.x0 + 260;
}

/** Runs the world and the kill cam together at the cam's own slowed pace. */
function roll(w: World, cam: KillCam, seconds: number, allowed = true): number {
	let slowest = 1;
	for (let t = 0; t < seconds; t += FRAME) {
		cam.update(FRAME, w, allowed);
		slowest = Math.min(slowest, cam.timeScale());
		simulateWorld(w, FRAME * cam.timeScale(), null);
	}
	return slowest;
}

describe('bigKillAt', () => {
	it('spots the bomb that will drop a bridge span, not one that only dents it', () => {
		const { w, mid, deckY } = bridgeWorld();
		expect(bigKillAt(w, mid, deckY, 0, BOMBS.gp.blast)).toBeNull();
		expect(bigKillAt(w, mid, deckY, 0, BOMBS.penetrator.blast)).toBe('bridge');
		w.bridge!.spans[1].hp = 40;
		expect(bigKillAt(w, mid, deckY, 0, BOMBS.gp.blast)).toBe('bridge');
		// Already down: nothing left to drop.
		w.bridge!.spans[1].down = true;
		expect(bigKillAt(w, mid, deckY, 0, BOMBS.penetrator.blast)).toBeNull();
	});

	it('calls a depot going up with a crowd around it a chain, but not a lone depot', () => {
		const w = testWorld();
		const x = depotSite(w);
		w.spawnUnit('depot', x, 0);
		expect(bigKillAt(w, x, w.ground(x), 0, BOMBS.guided.blast)).toBeNull();
		for (const dx of [14, 20, 26]) w.spawnUnit('rifleman', x + dx, 0);
		expect(bigKillAt(w, x, w.ground(x), 0, BOMBS.guided.blast)).toBe('chain');
	});

	it('follows one depot setting off the next', () => {
		const w = testWorld();
		const x = depotSite(w);
		w.spawnUnit('depot', x, 0);
		const far = w.spawnUnit('depot', x + 30, 0);
		expect(bigKillAt(w, x, w.ground(x), 0, BOMBS.guided.blast)).toBeNull();
		far.hp = 60;
		expect(bigKillAt(w, x, w.ground(x), 0, BOMBS.guided.blast)).toBe('chain');
	});

	it('ignores a blast that would not set the depot off', () => {
		const w = testWorld();
		const x = depotSite(w);
		w.spawnUnit('depot', x, 0);
		for (const dx of [14, 20, 26]) w.spawnUnit('rifleman', x + dx, 0);
		expect(bigKillAt(w, x, w.ground(x), 0, BOMBS.gp.blast)).toBeNull();
	});
});

describe('KillCam', () => {
	it('slows time, rides the bomb down onto the span, lingers and hands back', () => {
		const { w, mid, deckY } = bridgeWorld();
		const cam = new KillCam();
		const b = dropBomb(w, BOMBS.penetrator, mid, deckY + 12, 0, 0, -18, -Math.PI / 2);
		expect(cam.update(FRAME, w, true)).toBe(true);
		expect(cam.active).toBe(true);
		expect(cam.reason).toBe('bridge');
		expect(cam.impactX).toBeCloseTo(mid, 0);
		expect(cam.x).toBe(b.x);

		const slowest = roll(w, cam, 4);
		expect(slowest).toBeLessThan(KILLCAM_TIME_SCALE + 0.1);
		expect(w.bridge!.spans[1].down).toBe(true);
		expect(cam.active).toBe(false);
		roll(w, cam, 1);
		expect(cam.timeScale()).toBeGreaterThan(0.95);
	});

	it('frames the bomb and the impact point together', () => {
		const { w, mid, deckY } = bridgeWorld();
		const cam = new KillCam();
		dropBomb(w, BOMBS.penetrator, mid, deckY + 12, 0, 0, -18, -Math.PI / 2);
		cam.update(FRAME, w, true);
		const rig = w.camera;
		rig.x = mid - 300;
		rig.dist = 600;
		for (let i = 0; i < 60; i++) cam.drive(rig, FRAME);
		expect(Math.abs(rig.x - mid)).toBeLessThan(5);
		expect(rig.dist).toBeLessThan(160);
	});

	it('waits out a cooldown before rolling again', () => {
		const { w, mid, deckY } = bridgeWorld();
		const cam = new KillCam();
		dropBomb(w, BOMBS.penetrator, mid, deckY + 12, 0, 0, -18, -Math.PI / 2);
		cam.update(FRAME, w, true);
		roll(w, cam, 4);
		const next = w.bridge!.spans[2];
		dropBomb(w, BOMBS.penetrator, (next.x0 + next.x1) / 2, deckY + 12, 0, 0, -18, -Math.PI / 2);
		expect(cam.update(FRAME, w, true)).toBe(false);
	});

	it('stays out of the way when the pilot needs the view, and cuts a shot short', () => {
		const { w, mid, deckY } = bridgeWorld();
		const cam = new KillCam();
		dropBomb(w, BOMBS.penetrator, mid, deckY + 12, 0, 0, -18, -Math.PI / 2);
		expect(cam.update(FRAME, w, false)).toBe(false);
		expect(cam.update(FRAME, w, true)).toBe(true);
		cam.update(FRAME, w, false);
		expect(cam.active).toBe(false);
	});

	it('ignores bombs that are far from landing, enemy bombs and small hits', () => {
		const { w, mid, deckY } = bridgeWorld();
		const cam = new KillCam();
		dropBomb(w, BOMBS.penetrator, mid, deckY + 200, 0, 0, 0, 0);
		const enemy = dropBomb(w, BOMBS.penetrator, mid, deckY + 12, 0, 0, -18, 0);
		enemy.owner = 'enemy';
		dropBomb(w, BOMBS.gp, mid, deckY + 12, 0, 0, -18, 0);
		expect(cam.update(FRAME, w, true)).toBe(false);
	});
});
