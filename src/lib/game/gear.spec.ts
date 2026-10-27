import { describe, expect, it } from 'vitest';
import { WORLD } from './constants';
import { GEAR_CYCLE, GEAR_HEIGHT, Gear, gearLayout, groundPitch, MAX_ROTATION } from './gear';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import { BOUNDS_GRACE, NO_INPUT, Player, type PilotInput } from './player';
import { testWorld } from './test-world';
import { gearWarning } from './warnings';
import type { World } from './world';

const DT = 1 / 60;

const fly = (w: World, p: Player, input: Partial<PilotInput>, seconds: number): void => {
	const inp = { ...NO_INPUT, ...input };
	for (let t = 0; t < seconds && !p.crashed; t += DT) p.update(DT, inp, w);
};

/** A kestrel parked on the runway the way every sortie starts. */
function parked(w: World, x = WORLD.runwayMinX + 60): Player {
	const p = new Player('kestrel', x, w.ground(x) + 45, 0.08);
	p.invuln = 1e9;
	p.park(w);
	w.player = p;
	return p;
}

describe('gear', () => {
	it('travels between up and down over the cycle, locking at each end', () => {
		const g = new Gear();
		expect(g.toggle(false)).toBe('motor');
		const events: string[] = [];
		for (let t = 0; t < GEAR_CYCLE * 0.5; t += DT) {
			const e = g.update(DT);
			if (e) events.push(e);
		}
		expect(g.moving).toBe(true);
		expect(g.locked).toBe(false);
		expect(g.level).toBeCloseTo(0.5, 1);
		for (let t = 0; t < GEAR_CYCLE; t += DT) {
			const e = g.update(DT);
			if (e) events.push(e);
		}
		expect(events).toEqual(['down']);
		expect(g.locked).toBe(true);
		g.toggle(false);
		g.update(GEAR_CYCLE + 0.1);
		expect(g.level).toBe(0);
		expect(g.extension).toBe(0);
	});

	it('will not come up while the aircraft sits on its wheels', () => {
		const g = new Gear(true);
		expect(g.toggle(true)).toBe('refused');
		expect(g.down).toBe(true);
	});

	it('drags enough that the clean aircraft is clearly faster', () => {
		const w = testWorld();
		const clean = new Player('kestrel', 800, w.ground(800) + 150, 0);
		const dirty = new Player('kestrel', 800, w.ground(800) + 150, 0);
		dirty.gear.extend();
		fly(w, clean, { steerX: 1 }, 10);
		fly(w, dirty, { steerX: 1 }, 10);
		expect(dirty.gear.drag).toBeGreaterThan(1.4);
		expect(dirty.speed).toBeLessThan(clean.speed * 0.9);
	});

	it('holds the nose on the runway below rotation speed', () => {
		expect(groundPitch(0.5, 10, 40)).toBeCloseTo(0.03);
		expect(groundPitch(0.5, 45, 40)).toBe(MAX_ROTATION);
	});

	it('gives every fixed-wing aircraft legs that reach the runway', () => {
		for (const id of AIRCRAFT_ORDER) {
			const def = AIRCRAFT[id];
			if (def.flight && def.flight !== 'fixed') continue;
			const g = gearLayout(def);
			expect(g.nose[0]).toBeGreaterThan(g.main[0]);
			expect(g.main[2]).toBeGreaterThan(0);
			// The attach points are above the wheel axle, so the struts hang down.
			const axle = -GEAR_HEIGHT / def.scale + g.wheel;
			expect(g.nose[1]).toBeGreaterThan(axle);
		}
	});
});

describe('takeoff and landing', () => {
	it('starts parked with the brakes on and waits for the pilot', () => {
		const w = testWorld();
		const p = parked(w);
		const x0 = p.x;
		fly(w, p, {}, 3);
		expect(p.x).toBe(x0);
		expect(p.landed).toBe(true);
		expect(p.gear.locked).toBe(true);
		expect(p.y - w.surface.clearance(p.x)).toBeCloseTo(GEAR_HEIGHT);
	});

	it('rolls down the runway and lifts off once pulled up past rotation speed', () => {
		const w = testWorld();
		const p = parked(w);
		fly(w, p, { steerX: 1 }, 1.5);
		expect(p.gear.parked).toBe(false);
		expect(p.landed).toBe(true);
		expect(p.vx).toBeGreaterThan(10);
		// Pulling hard from the start: no tail strike, it simply waits for flying speed.
		fly(w, p, { steerX: 1, steerY: 1 }, 5);
		expect(p.crashed).toBe(false);
		expect(p.hasFlown).toBe(true);
		expect(p.landed).toBe(false);
		expect(p.y - w.ground(p.x)).toBeGreaterThan(15);
		// Gear up once flying.
		fly(w, p, { steerX: 1, steerY: 0.3, gear: true }, DT);
		expect(p.gear.down).toBe(false);
		fly(w, p, { steerX: 1, steerY: 0.3 }, 3);
		expect(p.gear.level).toBe(0);
	});

	it('cannot raise the gear on the ground, and V works the wheel brakes', () => {
		const w = testWorld();
		const p = parked(w);
		fly(w, p, { steerX: 1 }, 1.5);
		fly(w, p, { steerX: 1, gear: true }, DT);
		expect(p.gear.down).toBe(true);
		const v = p.vx;
		fly(w, p, { brake: true }, 1);
		expect(p.vx).toBeLessThan(v - 10);
		expect(p.landed).toBe(true);
	});

	it('crashes a wheels-up touchdown as a belly landing', () => {
		const w = testWorld();
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		const p = new Player('kestrel', WORLD.runwayMinX + 20, w.ground(80) + 2.2, 0);
		p.vx = 45;
		p.vy = -1;
		w.player = p;
		fly(w, p, {}, 1);
		expect(p.crashed).toBe(true);
		expect(said).toContain('BELLY LANDING');
	});

	it('lands with the gear down and stops with the brakes', () => {
		const w = testWorld();
		const p = new Player('kestrel', WORLD.runwayMinX + 20, w.ground(80) + 2.2, 0);
		p.vx = 45;
		p.vy = -1;
		p.gear.extend();
		w.player = p;
		fly(w, p, { brake: true }, 4);
		expect(p.crashed).toBe(false);
		expect(p.landed).toBe(true);
		expect(p.speed).toBeLessThan(1);
	});
});

describe('gear warning', () => {
	it('calls "too low, gear" sinking slowly at the runway with the wheels up', () => {
		const w = testWorld();
		const x = WORLD.runwayMinX + 100;
		const p = new Player('kestrel', x, w.ground(x) + 20, -0.1);
		p.vx = 50;
		p.vy = -4;
		expect(gearWarning(w, p)).toBe(true);
		p.gear.extend();
		expect(gearWarning(w, p)).toBe(false);
		const high = new Player('kestrel', x, w.ground(x) + 120, -0.1);
		high.vy = -4;
		expect(gearWarning(w, high)).toBe(false);
		const away = new Player('kestrel', 2500, w.ground(2500) + 20, -0.1);
		away.vy = -4;
		expect(gearWarning(w, away)).toBe(false);
	});
});

describe('leaving the combat area', () => {
	it('turns back for free at first and then only nibbles at the armour', () => {
		const w = testWorld();
		const x = WORLD.arenaMaxX + 50;
		const p = new Player('kestrel', x, w.ground(x) + 150, 0);
		p.invuln = 0;
		w.player = p;
		fly(w, p, {}, BOUNDS_GRACE - 0.5);
		expect(p.hp).toBe(p.def.hp);
		const hp = p.hp;
		p.x = x;
		p.outOfBounds = BOUNDS_GRACE;
		fly(w, p, {}, 0.5);
		p.x = x;
		fly(w, p, {}, 0.5);
		expect(p.hp).toBeLessThan(hp);
		expect(hp - p.hp).toBeLessThan(3);
	});
});
