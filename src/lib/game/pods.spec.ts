import { describe, expect, it } from 'vitest';
import { isEmitting, pickEmitter } from './arm';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import { BOMBS, ROCKETS_PER_POD, ROCKET_SPEED } from './defs-bombs';
import { ALLOWED } from './loadout';
import { NO_INPUT, Player, type PilotInput } from './player';
import { simulateWorld } from './simulate';
import { trackUnit } from './targeting';
import { testWorld } from './test-world';
import { predictImpact } from './weapons';
import type { World } from './world';

function flying(w: World, id: Player['def']['id'], x = 1200, alt = 200): Player {
	const p = new Player(id, x, w.ground(x) + alt, 0);
	p.invuln = 1e9;
	w.player = p;
	return p;
}

/** Holds the aircraft level (or on a fixed heading) while the world runs. */
function run(w: World, seconds: number, inp: (i: number) => PilotInput = () => NO_INPUT): void {
	const p = w.player;
	const alt = p ? p.y - w.ground(p.x) : 0;
	const angle = p?.angle ?? 0;
	for (let i = 0; i < seconds * 60; i++) {
		simulateWorld(w, 1 / 60, inp(i));
		if (p && p.alive) {
			p.y = w.ground(p.x) + alt;
			p.vy = 0;
			p.angle = angle;
		}
	}
}

const press = (i: number): PilotInput => (i === 0 ? { ...NO_INPUT, bombPressed: true } : NO_INPUT);
const hold: PilotInput = { ...NO_INPUT, bomb: true };

describe('rack', () => {
	it('fits the new stores to the right airframes, stock loadouts included', () => {
		for (const id of AIRCRAFT_ORDER) {
			for (const b of Object.keys(AIRCRAFT[id].loadout))
				expect(ALLOWED[id]).toContain(b as keyof typeof BOMBS);
		}
		expect(AIRCRAFT.a10.loadout.rockets).toBeGreaterThan(0);
		expect(AIRCRAFT.su25.loadout.rockets).toBeGreaterThan(0);
		expect(AIRCRAFT.f16.loadout.arm).toBeGreaterThan(0);
		expect(ALLOWED.b1).not.toContain('gunpod');
	});
});

describe('rocket pods', () => {
	it('ripples a full pod off the rails for one round of ammo', () => {
		const w = testWorld();
		const p = flying(w, 'su25');
		const before = p.ammo.rockets;
		p.selected = 'rockets';
		run(w, 0.6, press);
		expect(p.ammo.rockets).toBe(before - 1);
		const fired = w.shells.filter((s) => s.kind === 'ffar');
		expect(fired.length).toBe(ROCKETS_PER_POD);
		// Straight along the nose, not dropped.
		for (const s of fired) expect(s.vx).toBeGreaterThan(p.vx + ROCKET_SPEED * 0.9);
	});

	it('lands where the rocket sight predicts and wrecks what is there', () => {
		const w = testWorld();
		const p = flying(w, 'a10', 900, 140);
		p.angle = -0.35;
		const ca = Math.cos(p.angle),
			sa = Math.sin(p.angle);
		const vx = ca * 60,
			vy = sa * 60;
		p.vx = vx;
		p.vy = vy;
		const hit = predictImpact(
			w,
			p.x,
			p.y,
			p.vx + ca * ROCKET_SPEED,
			p.vy + sa * ROCKET_SPEED,
			0,
			null
		);
		const truck = w.spawnUnit('truck', hit.x, 0);
		truck.def = { ...truck.def, speed: 0 };
		p.selected = 'rockets';
		// Fire with the airframe frozen so every rocket leaves from the same spot.
		for (let i = 0; i < 60 * 4; i++) {
			const x = p.x;
			simulateWorld(w, 1 / 60, i === 0 ? { ...NO_INPUT, bombPressed: true } : NO_INPUT);
			p.x = x;
			p.y = w.ground(900) + 140;
			p.angle = -0.35;
			p.vx = vx;
			p.vy = vy;
		}
		expect(truck.alive).toBe(false);
		expect(w.shells.some((s) => s.kind === 'ffar')).toBe(false);
	});
});

describe('anti-radiation missile', () => {
	it('only sees SAMs while they lock, search radars always, and nothing stunned', () => {
		const w = testWorld();
		const sam = w.spawnUnit('sam', 1600, 0);
		const radar = w.spawnUnit('radar', 1800, 0);
		const tank = w.spawnUnit('tank', 1500, 0);
		expect(isEmitting(sam)).toBe(false);
		expect(isEmitting(radar)).toBe(true);
		expect(isEmitting(tank)).toBe(false);
		sam.lock = 0.5;
		expect(isEmitting(sam)).toBe(true);
		radar.stun = 3;
		expect(isEmitting(radar)).toBe(false);
		// A locking SAM outranks a farther radar.
		radar.stun = 0;
		expect(pickEmitter(w, 1200, 300, 0, false)).toBe(sam);
	});

	it('homes on a radar ahead and destroys it', () => {
		const w = testWorld();
		const p = flying(w, 'f16', 900, 220);
		const radar = w.spawnUnit('radar', 1700, 0);
		p.selected = 'arm';
		const before = p.ammo.arm;
		run(w, 0.1, press);
		expect(p.ammo.arm).toBe(before - 1);
		const m = w.missiles.find((x) => x.kind === 'arm');
		expect(m?.emitter).toBe(radar);
		run(w, 12);
		expect(radar.alive).toBe(false);
	});

	it('flies on to where a SAM was last heard when it shuts down', () => {
		const w = testWorld();
		const p = flying(w, 'f16', 900, 220);
		const sam = w.spawnUnit('sam', 1800, 0);
		sam.def = { ...sam.def, speed: 0 };
		sam.lock = 0.5;
		p.selected = 'arm';
		simulateWorld(w, 1 / 60, {
			...NO_INPUT,
			bombPressed: true,
			designate: { track: trackUnit(sam), unit: sam, x: sam.x, y: sam.y }
		});
		const m = w.missiles.find((x) => x.kind === 'arm');
		expect(m?.emitter).toBe(sam);
		// Going dark: the seeker loses the emitter but keeps the spot.
		sam.stun = 30;
		run(w, 0.1);
		expect(m?.emitter).toBeNull();
		expect(m?.target?.x).toBeCloseTo(sam.x, 0);
		run(w, 12);
		expect(sam.alive).toBe(false);
	});

	it('flies out listening when nothing radiates, then snaps onto an emitter that lights up', () => {
		const w = testWorld();
		const p = flying(w, 'f16', 900, 160);
		p.selected = 'arm';
		run(w, 0.1, press);
		const m = w.missiles.find((x) => x.kind === 'arm');
		expect(m?.target).toBeNull();
		const radar = w.spawnUnit('radar', (m?.x ?? 0) + 700, 0);
		run(w, 0.1);
		expect(m?.emitter).toBe(radar);
	});
});

describe('gun pod', () => {
	it('fires while held, overheats, then cools before it fires again', () => {
		const w = testWorld();
		const p = flying(w, 'su25');
		p.selected = 'gunpod';
		const ammo = p.ammo.gunpod;
		run(w, 0.5, () => hold);
		expect(p.podHeat).toBeGreaterThan(10);
		expect(w.bullets.length).toBeGreaterThan(10);
		run(w, 4, () => hold);
		expect(p.podOverheated).toBe(true);
		// Still holding: no rounds while it is hot.
		const n = w.bullets.length;
		run(w, 0.05, () => hold);
		expect(w.bullets.length).toBeLessThanOrEqual(n);
		run(w, 5);
		expect(p.podOverheated).toBe(false);
		expect(p.podHeat).toBeLessThan(10);
		// It never runs dry, and it does not touch the built-in gun's heat.
		expect(p.ammo.gunpod).toBe(ammo);
		expect(p.gunHeat).toBe(0);
	});

	it('shreds armour that the built-in guns barely scratch', () => {
		const shred = (selected: 'gunpod' | null): number => {
			const w = testWorld();
			const p = flying(w, 'f4', 1000, 60);
			p.angle = -0.12;
			const x = p.x + 60 / Math.tan(0.12) - 10;
			const tank = w.spawnUnit('tank', x, 0);
			tank.def = { ...tank.def, speed: 0 };
			if (selected) p.selected = selected;
			const inp = selected ? hold : { ...NO_INPUT, fire: true };
			for (let i = 0; i < 60 * 1.2; i++) {
				simulateWorld(w, 1 / 60, inp);
				p.x = 1000;
				p.y = w.ground(1000) + 60;
				p.angle = -0.12;
			}
			return tank.def.hp - Math.max(0, tank.hp);
		};
		expect(shred('gunpod')).toBeGreaterThan(shred(null) * 2);
	});
});
