import { describe, expect, it } from 'vitest';
import { Player } from './player';
import { launchMissile } from './projectiles';
import { testWorld } from './test-world';
import { WORLD } from './constants';
import { cockpitAlerts, incomingThreats, lockThreat, missileThreat, runwayEnd } from './warnings';

describe('cockpit warnings', () => {
	it('reports the closest missile homing on the aircraft and where it is', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1500, w.ground(1500) + 200, 0);
		w.player = p;
		expect(missileThreat(w, p).missileDist).toBe(0);
		const base = {
			kind: 'manpads',
			angle: 0,
			speed: 100,
			maxSpeed: 200,
			accel: 50,
			turnRate: 2,
			target: p,
			burn: 4,
			life: 8,
			damage: 30,
			owner: 'enemy',
			seeker: 'heat'
		} as const;
		launchMissile(w, { ...base, x: 900, y: p.y });
		launchMissile(w, { ...base, x: 1500, y: p.y - 300 });
		const t = missileThreat(w, p);
		expect(t.missileDist).toBeCloseTo(300, 0);
		// Straight below the aircraft: pointing down the screen.
		expect(t.missileDir).toBeCloseTo(Math.PI / 2, 2);
		expect(cockpitAlerts(w, p).missile).toBe(true);
	});

	it('lists every missile and locking launcher, missiles first and closest first', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1500, w.ground(1500) + 200, 0);
		w.player = p;
		expect(incomingThreats(w, p)).toEqual([]);
		const base = {
			kind: 'sam',
			angle: 0,
			speed: 100,
			maxSpeed: 200,
			accel: 50,
			turnRate: 2,
			target: p,
			burn: 4,
			life: 8,
			damage: 30,
			owner: 'enemy',
			seeker: 'radar'
		} as const;
		launchMissile(w, { ...base, x: 900, y: p.y });
		launchMissile(w, { ...base, x: 1700, y: p.y });
		p.lockers.push({ x: 2000, y: p.y - 200, progress: 0.3 });
		p.lockers.push({ x: 1000, y: p.y - 200, progress: 0.9 });
		const t = incomingThreats(w, p);
		expect(t.map((x) => x.kind)).toEqual(['missile', 'missile', 'lock', 'lock']);
		expect(t[0].dist).toBeCloseTo(200, 0);
		expect(t[2].level).toBe(0.9);
		// The launcher furthest along sits down and to the left: bearing between down and left.
		const dir = lockThreat(p).lockDir;
		expect(dir).toBeGreaterThan(Math.PI / 2);
		expect(dir).toBeLessThan(Math.PI);
	});
});

describe('runway end warning', () => {
	const rolling = (x: number, vx: number) => {
		const w = testWorld();
		const p = new Player('kestrel', x, 0, 0);
		w.player = p;
		p.park(w);
		p.gear.parked = false;
		p.vx = vx;
		return { w, p };
	};

	it('is quiet parked, and early in the roll with plenty of runway ahead', () => {
		const { w, p } = rolling(WORLD.runwayMinX + 60, 0);
		p.gear.parked = true;
		expect(runwayEnd(w, p)).toBe(0);
		p.gear.parked = false;
		p.vx = 20;
		expect(runwayEnd(w, p)).toBe(0);
		expect(cockpitAlerts(w, p).runway).toBe(false);
	});

	it('warns with the metres left when the runway ahead runs short for the speed', () => {
		const { w, p } = rolling(WORLD.runwayMaxX - 90, 45);
		expect(runwayEnd(w, p)).toBeCloseTo(90, 0);
		expect(cockpitAlerts(w, p).runway).toBe(true);
		// Slow taxi near the end is fine; the same speed heading back down the runway too.
		p.vx = 3;
		expect(runwayEnd(w, p)).toBe(0);
		p.vx = -45;
		expect(runwayEnd(w, p)).toBe(0);
	});

	it('looks the other way when rolling toward the near end', () => {
		const { w, p } = rolling(WORLD.runwayMinX + 70, -40);
		expect(runwayEnd(w, p)).toBeCloseTo(70, 0);
	});

	it('warns on a landing flare that touches down too late', () => {
		const w = testWorld();
		const x = WORLD.runwayMaxX - 80;
		const p = new Player('kestrel', x, w.surface.clearance(x) + 6, 0);
		w.player = p;
		p.vx = 55;
		p.vy = -2;
		expect(runwayEnd(w, p)).toBe(0);
		p.gear.extend();
		expect(runwayEnd(w, p)).toBeCloseTo(80, 0);
		// Climbing away (a go-around) or gear up: not a landing.
		p.vy = 4;
		expect(runwayEnd(w, p)).toBe(0);
	});
});
