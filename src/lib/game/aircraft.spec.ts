import { describe, expect, it } from 'vitest';
import * as extra from '../models/aircraft-extra';
import { WORLD } from './constants';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import { AirUnit } from './enemy-air';
import { HELI_SAFE_SINK, NO_INPUT, ORBIT_MIN, ORBIT_R, Player, type PilotInput } from './player';
import { simulateWorld } from './simulate';
import { pointTrack } from './targeting';
import { testWorld } from './test-world';
import type { AircraftId, Designation } from './types';
import type { World } from './world';

const STEP = 1 / 60;

function flying(w: World, id: AircraftId, x = 1500, alt = 120, angle = 0): Player {
	const p = new Player(id, x, w.ground(x) + alt, angle);
	p.invuln = 0;
	w.player = p;
	return p;
}

function fly(w: World, p: Player, input: Partial<PilotInput>, seconds: number): void {
	const inp = { ...NO_INPUT, ...input };
	for (let t = 0; t < seconds; t += STEP) p.update(STEP, inp, w);
}

function spot(w: World, x: number): Designation {
	const y = w.ground(x);
	return { track: pointTrack(x, y), unit: null, x, y };
}

/** Runs the whole world until every bomb has gone off; returns where each one was last seen. */
function impacts(w: World, seconds = 8): number[] {
	const last = new Map<number, number>();
	for (let t = 0; t < seconds && (t === 0 || w.bombs.length > 0); t += STEP) {
		for (const b of w.bombs) last.set(b.id, b.x);
		simulateWorld(w, STEP, null);
	}
	return [...last.values()];
}

describe('aircraft traits', () => {
	it('lists strengths and weaknesses for every airframe', () => {
		for (const id of AIRCRAFT_ORDER) {
			expect(AIRCRAFT[id].pros.length, id).toBeGreaterThanOrEqual(2);
			expect(AIRCRAFT[id].cons.length, id).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('changing aircraft mid-sortie', () => {
	it('is offered on the runway, not in the air or after a crash', () => {
		const w = testWorld();
		const x = WORLD.runwayMinX + 60;
		const p = new Player('kestrel', x, w.ground(x) + 20);
		p.park(w);
		w.player = p;
		simulateWorld(w, STEP, NO_INPUT);
		expect(p.canChangeAircraft).toBe(true);
		p.alive = false;
		expect(p.canChangeAircraft).toBe(false);
		const air = testWorld();
		const q = flying(air, 'kestrel');
		simulateWorld(air, STEP, NO_INPUT);
		expect(q.canChangeAircraft).toBe(false);
	});
});

describe('new aircraft', () => {
	it('builds a model for each of the six', () => {
		for (const id of ['ac130', 'apache', 'mq9', 'stuka', 'a1', 'tu95'] as const) {
			const mesh = extra[id]();
			expect(mesh.length).toBeGreaterThan(1000);
			expect(mesh.every(Number.isFinite)).toBe(true);
			expect(AIRCRAFT_ORDER).toContain(id);
			expect(AIRCRAFT[id].mesh).toBe(id);
		}
	});

	it('keeps every airframe flying hands-off for a few seconds', () => {
		for (const id of AIRCRAFT_ORDER) {
			const w = testWorld();
			const p = flying(w, id);
			const y0 = p.y;
			fly(w, p, {}, 3);
			expect(p.alive, id).toBe(true);
			// The gunship climbs onto its orbit; everything else roughly holds its height.
			if (p.flight !== 'orbit') expect(Math.abs(p.y - y0), id).toBeLessThan(30);
		}
	});
});

describe('AC-130 orbit', () => {
	it('circles a pivot in a left-hand pylon turn, swinging in front of and behind the battle line', () => {
		const w = testWorld();
		const p = flying(w, 'ac130', 1500, 130);
		let minX = Infinity,
			maxX = -Infinity,
			minZ = Infinity,
			maxZ = -Infinity;
		for (let t = 0; t < 20; t += STEP) {
			p.update(STEP, NO_INPUT, w);
			minX = Math.min(minX, p.x);
			maxX = Math.max(maxX, p.x);
			minZ = Math.min(minZ, p.z);
			maxZ = Math.max(maxZ, p.z);
		}
		expect(p.orbitX).toBeCloseTo(1500, 0);
		expect(maxX - minX).toBeGreaterThan(ORBIT_R * 1.9);
		expect(maxX - minX).toBeLessThan(ORBIT_R * 2.05);
		expect(minZ).toBeLessThan(-20);
		expect(maxZ).toBeGreaterThan(20);
		// Banked into the turn the whole time: the port wing (and the guns) face the pivot.
		expect(p.bank).toBeLessThan(-0.3);
		expect(p.cameraTarget.x).toBeCloseTo(p.orbitX, 5);
	});

	it('slides the orbit with the stick, keeps it in the arena and never flies into the ground', () => {
		const w = testWorld();
		const p = flying(w, 'ac130', 1500, 130);
		fly(w, p, { steerX: 1 }, 4);
		expect(p.orbitX).toBeGreaterThan(1550);
		fly(w, p, { steerX: 1, boost: true }, 200);
		expect(p.orbitX).toBeLessThanOrEqual(WORLD.arenaMaxX - ORBIT_R);
		expect(p.outOfBounds).toBe(0);
		fly(w, p, { steerY: -1 }, 30);
		expect(p.alive).toBe(true);
		expect(p.crashed).toBe(false);
		expect(p.orbitAlt).toBe(ORBIT_MIN);
	});

	it('fires its side guns at the designated spot, wherever it is in the orbit', () => {
		const w = testWorld();
		const p = flying(w, 'ac130', 1500, 130);
		fly(w, p, {}, 3);
		const target = spot(w, 1520);
		p.update(STEP, { ...NO_INPUT, fire: true, designate: target }, w);
		const shots = w.bullets.filter((b) => b.owner === 'player');
		expect(shots.length).toBeGreaterThan(0);
		for (const b of shots) {
			const toTarget = Math.atan2(target.y - b.y, target.x - b.x);
			expect(Math.abs(Math.atan2(b.vy, b.vx) - toTarget)).toBeLessThan(0.05);
		}
	});

	it('lands its howitzer shells on the aim point', () => {
		const w = testWorld();
		w.godMode = true;
		const p = flying(w, 'ac130', 1500, 130);
		fly(w, p, {}, 4);
		const target = spot(w, 1540);
		p.update(STEP, { ...NO_INPUT, fire: true, designate: target }, w);
		expect(w.bombs.length).toBe(1);
		w.player = null;
		const [hit] = impacts(w);
		expect(Math.abs(hit - target.x)).toBeLessThan(6);
	});
});

describe('attack helicopter', () => {
	it('hovers in place hands-off and climbs or descends on the stick', () => {
		const w = testWorld();
		const p = flying(w, 'apache', 1500, 60);
		const y0 = p.y;
		fly(w, p, {}, 3);
		expect(Math.abs(p.y - y0)).toBeLessThan(1);
		expect(p.speed).toBeLessThan(1);
		expect(p.stalled).toBe(false);
		fly(w, p, { steerY: 1 }, 2);
		expect(p.y).toBeGreaterThan(y0 + 25);
	});

	it('flies forward and backward, and turns on the spot to face the other way', () => {
		const w = testWorld();
		const p = flying(w, 'apache', 1500, 60);
		fly(w, p, { steerX: 1 }, 3);
		expect(p.vx).toBeGreaterThan(p.def.cruise * 0.9);
		// Nose down to fly forward.
		expect(Math.sin(p.angle)).toBeLessThan(-0.1);
		fly(w, p, { brake: true }, 3);
		expect(p.speed).toBeLessThan(1);
		fly(w, p, { steerX: -1 }, 0.1);
		expect(p.facing).toBe(-1);
		expect(Math.abs(p.yaw)).toBeGreaterThan(2);
		fly(w, p, { steerX: -1 }, 2);
		expect(p.yaw).toBe(0);
		expect(Math.cos(p.angle)).toBeLessThan(0);
		expect(p.vx).toBeLessThan(-20);
	});

	it('sets down gently on open ground and lifts off again', () => {
		const w = testWorld();
		const x = 1500;
		const p = flying(w, 'apache', x, 30);
		fly(w, p, { steerY: -1 }, 6);
		expect(p.crashed).toBe(false);
		expect(p.landed).toBe(true);
		expect(p.y - w.surface.clearance(p.x)).toBeLessThan(2);
		fly(w, p, { steerY: 1 }, 2);
		expect(p.landed).toBe(false);
		expect(p.alive).toBe(true);
	});

	it('crashes when it hits the ground hard', () => {
		const w = testWorld();
		const p = flying(w, 'apache', 1500, 4);
		p.vy = -HELI_SAFE_SINK * 2;
		fly(w, p, {}, 0.5);
		expect(p.crashed).toBe(true);
	});

	it('rearms after landing on the runway', () => {
		const w = testWorld();
		const x = (WORLD.runwayMinX + WORLD.runwayMaxX) / 2;
		const p = flying(w, 'apache', x, 10);
		p.ammo.rockets = 0;
		fly(w, p, { steerY: -1 }, 6);
		expect(p.landed).toBe(true);
		expect(p.rearming).toBe(true);
		expect(p.ammo.rockets).toBeGreaterThan(0);
	});

	it('swings the chin gun onto a target ahead but not behind', () => {
		const w = testWorld();
		const p = flying(w, 'apache', 1500, 50);
		const ahead = spot(w, 1560);
		p.update(STEP, { ...NO_INPUT, fire: true, designate: ahead }, w);
		const b = w.bullets.find((s) => s.owner === 'player');
		expect(b).toBeDefined();
		if (!b) return;
		expect(b.vy).toBeLessThan(-200);
		expect(b.vx).toBeGreaterThan(0);

		const w2 = testWorld();
		const p2 = flying(w2, 'apache', 1500, 50);
		p2.update(STEP, { ...NO_INPUT, fire: true, designate: spot(w2, 1440) }, w2);
		for (const s of w2.bullets) expect(s.vx).toBeGreaterThan(0);
	});
});

describe('MQ-9 drone', () => {
	it('has no gun and carries only laser-guided bombs', () => {
		const w = testWorld();
		const p = flying(w, 'mq9');
		fly(w, p, { fire: true }, 1);
		expect(w.bullets.length).toBe(0);
		expect(p.carried).toEqual(['guided']);
		expect(p.def.hp).toBeLessThan(AIRCRAFT.kestrel.hp);
	});
});

describe('Stuka dive bomber', () => {
	it('winds up the siren in a steep dive and the dive brakes hold its speed', () => {
		const w = testWorld();
		const p = flying(w, 'stuka', 1500, 300, -1.1);
		p.vx = Math.cos(-1.1) * 60;
		p.vy = Math.sin(-1.1) * 60;
		let fastest = 0;
		for (let t = 0; t < 2.5; t += STEP) {
			p.update(
				STEP,
				{ ...NO_INPUT, steerX: Math.cos(-1.1), steerY: Math.sin(-1.1), boost: true },
				w
			);
			fastest = Math.max(fastest, p.speed);
		}
		expect(p.siren).toBeGreaterThan(0.6);
		expect(fastest).toBeLessThan((p.def.dive?.limit ?? 0) + 4);
		fly(w, p, { steerX: 1, steerY: 0.5 }, 3);
		expect(p.siren).toBeLessThan(0.2);
	});

	it('drops its bombs where the nose points in a dive', () => {
		const w = testWorld();
		w.godMode = true;
		const p = flying(w, 'stuka', 1500, 260, -1.0);
		p.vx = Math.cos(-1.0) * 62;
		p.vy = Math.sin(-1.0) * 62;
		const aim = p.diveTarget(w, null);
		expect(aim).not.toBeNull();
		p.update(STEP, { ...NO_INPUT, bombPressed: true }, w);
		expect(w.bombs.length).toBe(1);
		w.player = null;
		const [hit] = impacts(w);
		expect(Math.abs(hit - (aim ?? 0))).toBeLessThan(5);
	});
});

describe('Tu-95 Bear', () => {
	it('has contra-rotating props and a tail turret that covers its six', () => {
		const w = testWorld();
		const p = flying(w, 'tu95', 1500, 150);
		expect(p.def.contra).toBe(true);
		expect(p.def.props.length).toBe(8);
		expect(p.def.gun).toBeNull();
		w.air.push(new AirUnit(1, 'fighter', p.x - 200, p.y));
		for (let t = 0; t < 1 && w.bullets.length === 0; t += STEP) p.update(STEP, NO_INPUT, w);
		const shot = w.bullets.find((b) => b.owner === 'player');
		expect(shot).toBeDefined();
		if (!shot) return;
		const tail = p.localToWorld(p.def.tailGunAt ?? [0, 0, 0]);
		expect(Math.hypot(shot.x - tail[0], shot.y - tail[1])).toBeLessThan(1);
		expect(shot.vx).toBeLessThan(0);
	});
});
