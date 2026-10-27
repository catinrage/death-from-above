import { describe, expect, it } from 'vitest';
import { Autopilot } from './autopilot';
import { WORLD } from './constants';
import { AirUnit } from './enemy-air';
import { NO_INPUT, Player } from './player';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { WaveDirector } from './waves';
import type { World } from './world';

const DT = 1 / 60;

function run(w: World, seconds: number, each?: () => void): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, w.player ? NO_INPUT : null);
		each?.();
	}
}

describe('headless battle', () => {
	it('plays a wave with the autopilot without corrupting state', () => {
		const w = testWorld();
		const p = new Player('grizzly', WORLD.runwayMinX + 40, w.ground(70) + 60, 0.05);
		p.invuln = 1e9;
		w.player = p;
		const pilot = new Autopilot();
		const waves = new WaveDirector(42);
		waves.begin(w, 3);
		let kills = 0;
		w.events = { ...w.events, kill: () => kills++ };
		let peakParticles = 0;
		for (let t = 0; t < 150; t += DT) {
			simulateWorld(w, DT, pilot.update(w, p, DT));
			waves.update(w, DT);
			peakParticles = Math.max(peakParticles, w.particles.count);
			expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		}
		expect(waves.spawned).toBeGreaterThan(10);
		expect(kills).toBeGreaterThan(3);
		expect(w.units.some((u) => !u.alive) || kills > 0).toBe(true);
		expect(peakParticles).toBeLessThanOrEqual(w.particles.capacity);
		expect(w.debris.list.length).toBeLessThanOrEqual(w.debris.max);
		expect(w.bullets.length).toBeLessThan(900);
	});

	it('lets armour that reaches the siege line shell the airfield', () => {
		const w = testWorld();
		const tank = w.spawnUnit('tank', WORLD.baseAttackX + 60, 0);
		const gun = w.spawnUnit('artillery', WORLD.baseAttackX + 500, 0);
		run(w, 20);
		expect(tank.state).toBe('siege');
		expect(gun.state).toBe('siege');
		expect(w.base.hp).toBeLessThan(w.base.maxHp);
	});

	it('makes infantry flee from blasts and return to the advance', () => {
		const w = testWorld();
		const s = w.spawnUnit('rifleman', 1500, 0);
		s.panic = 1;
		run(w, 0.5);
		expect(s.state).toBe('flee');
		expect(s.dir).toBe(1);
		run(w, 1.5);
		expect(s.state).toBe('advance');
	});

	it('unloads infantry from a damaged troop carrier', () => {
		const w = testWorld();
		const apc = w.spawnUnit('apc', 1500, 0);
		apc.state = 'deploy';
		apc.stateTime = 0;
		run(w, 4);
		expect(w.units.filter((u) => u.def.kind === 'rifleman').length).toBe(4);
		expect(apc.state).toBe('advance');
	});
});

describe('anti-aircraft', () => {
	it('locks a SAM onto a low aircraft and fires a homing missile', () => {
		const w = testWorld();
		w.spawnUnit('sam', 1500, 0);
		const p = new Player('kestrel', 1300, w.ground(1300) + 220, 0);
		p.invuln = 0;
		w.player = p;
		let launched = 0;
		w.sound = {
			play: (id) => id === 'missileLaunch' && launched++,
			boom: () => {},
			whistle: () => {}
		};
		let locked = false;
		for (let t = 0; t < 8 && launched === 0; t += DT) {
			p.x = 1300;
			p.y = w.ground(1300) + 220;
			simulateWorld(w, DT, null);
			locked ||= p.lockedBy > 0;
		}
		expect(locked).toBe(true);
		expect(launched).toBe(1);
		expect(w.missiles[0].seeker).toBe('radar');
	});

	it('fires flak that bursts near the aircraft', () => {
		const w = testWorld();
		w.spawnUnit('flak', 1500, 0);
		const p = new Player('albatross', 1400, w.ground(1400) + 260, 0);
		w.player = p;
		p.invuln = 0;
		let bursts = 0;
		w.sound = { play: (id) => id === 'flakBurst' && bursts++, boom: () => {}, whistle: () => {} };
		for (let t = 0; t < 12; t += DT) {
			p.x = 1400;
			p.y = w.ground(1400) + 260;
			p.vx = 0.1;
			p.vy = 0;
			simulateWorld(w, DT, null);
		}
		expect(bursts).toBeGreaterThan(0);
	});

	it('sweeps searchlights at night and spots the aircraft', () => {
		const w = testWorld();
		w.night = 1;
		const light = w.spawnUnit('searchlight', 1500, 0);
		const p = new Player('kestrel', 1500, w.ground(1500) + 300, 0);
		w.player = p;
		for (let t = 0; t < 4; t += DT) {
			p.x = 1500;
			p.y = w.ground(1500) + 300;
			simulateWorld(w, DT, null);
		}
		expect(light.lamp).not.toBeNull();
		expect(light.spotting).toBe(true);
	});
});

describe('enemy aircraft', () => {
	it('sends interceptors after the player and lets them crash when shot down', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1200, w.ground(1200) + 160, 0);
		p.invuln = 1e9;
		w.player = p;
		const f = new AirUnit(w.newId(), 'fighter', 1700, w.ground(1700) + 180);
		w.air.push(f);
		const d0 = Math.hypot(f.x - p.x, f.y - p.y);
		run(w, 4);
		expect(Math.hypot(f.x - p.x, f.y - p.y)).toBeLessThan(d0 + 200);
		f.damage(w, 999, 'player');
		expect(f.dying).toBe(true);
		run(w, 20);
		expect(w.air.includes(f)).toBe(false);
	});

	it('lets gunships rocket the airfield', () => {
		const w = testWorld();
		const guns = w.base.guns.splice(0);
		const h = new AirUnit(
			w.newId(),
			'heli',
			WORLD.baseMaxX + 300,
			w.ground(WORLD.baseMaxX + 300) + 50
		);
		w.air.push(h);
		run(w, 10);
		w.base.guns.push(...guns);
		expect(w.base.hp).toBeLessThan(w.base.maxHp);
		expect(h.alive).toBe(true);
	});

	it('has airfield flak that engages raiders', () => {
		const w = testWorld();
		const h = new AirUnit(
			w.newId(),
			'heli',
			WORLD.baseMaxX + 200,
			w.ground(WORLD.baseMaxX + 200) + 50
		);
		w.air.push(h);
		run(w, 8);
		expect(h.hp < h.maxHp || !w.air.includes(h)).toBe(true);
	});
});

describe('review regressions', () => {
	it('lands long artillery arcs on the airfield instead of deleting them mid-air', () => {
		const w = testWorld();
		const theta = 0.9;
		const from = 900,
			to = 150;
		const v = Math.sqrt((13 * (from - to)) / Math.sin(2 * theta));
		w.shells.push({
			kind: 'artillery',
			x: from,
			y: w.ground(from) + 3,
			z: 0,
			vx: -Math.cos(theta) * v,
			vy: Math.sin(theta) * v,
			age: 0,
			fuse: Infinity,
			damage: 20,
			radius: 6,
			owner: 'enemy',
			trail: 0
		});
		run(w, 20);
		expect(w.shells.length).toBe(0);
		expect(w.base.hp).toBeLessThan(w.base.maxHp);
	});

	it('keeps convoys rolling past burning wrecks', () => {
		const w = testWorld();
		const wreck = w.spawnUnit('spaag', 1500, 0);
		wreck.alive = false;
		wreck.turretGone = true;
		const tank = w.spawnUnit('tank', 1510, 0);
		run(w, 4);
		expect(tank.x).toBeLessThan(1490);
	});

	it('clears out static wrecks eventually', () => {
		const w = testWorld();
		const bunker = w.spawnUnit('bunker', 1500, -11);
		bunker.alive = false;
		run(w, 120);
		expect(w.units.includes(bunker)).toBe(false);
	});
});
