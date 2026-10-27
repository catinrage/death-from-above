import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import { BOMBS, BOMB_ORDER } from './defs-bombs';
import { AirUnit } from './enemy-air';
import { NO_INPUT, Player, REPAIR_CAP, REPAIR_DELAY } from './player';
import { launchMissile } from './projectiles';
import { simulateWorld } from './simulate';
import { trackUnit } from './targeting';
import { testWorld } from './test-world';
import type { BombId } from './types';
import { predictImpact } from './weapons';
import { WaveDirector } from './waves';
import type { World } from './world';

function flying(w: World, id: Player['def']['id'] = 'b1', x = 1200, alt = 200): Player {
	const p = new Player(id, x, w.ground(x) + alt, 0);
	p.invuln = 1e9;
	w.player = p;
	return p;
}

/** Holds the aircraft level while the world runs. */
function run(w: World, seconds: number, first = NO_INPUT): void {
	const p = w.player;
	const alt = p ? p.y - w.ground(p.x) : 0;
	for (let i = 0; i < seconds * 60; i++) {
		simulateWorld(w, 1 / 60, i === 0 ? first : NO_INPUT);
		if (p && p.alive) {
			p.y = w.ground(p.x) + alt;
			p.vy = 0;
			p.angle = 0;
		}
	}
}

function release(w: World, p: Player, id: BombId, designate = NO_INPUT.designate): void {
	p.selected = id;
	run(w, 0.2, { ...NO_INPUT, bombPressed: true, designate });
}

describe('loadouts', () => {
	it('gives every aircraft its own rack and no aircraft everything', () => {
		const racks = AIRCRAFT_ORDER.map((id) =>
			BOMB_ORDER.filter((b) => (AIRCRAFT[id].loadout[b] ?? 0) > 0).join()
		);
		expect(new Set(racks).size).toBe(AIRCRAFT_ORDER.length);
		for (const id of AIRCRAFT_ORDER) {
			const n = BOMB_ORDER.filter((b) => (AIRCRAFT[id].loadout[b] ?? 0) > 0).length;
			expect(n).toBeLessThan(BOMB_ORDER.length);
		}
		for (const b of BOMB_ORDER)
			expect(AIRCRAFT_ORDER.some((id) => (AIRCRAFT[id].loadout[b] ?? 0) > 0)).toBe(true);
	});

	it('maps number keys onto what the aircraft actually carries', () => {
		const w = testWorld();
		const p = flying(w, 'wraith');
		expect(p.carried[0]).toBe('gp');
		run(w, 0.05, { ...NO_INPUT, select: 'napalm' });
		expect(p.selected).toBe('gp');
		run(w, 0.05, { ...NO_INPUT, select: p.carried[2] });
		expect(p.selected).toBe(p.carried[2]);
	});

	it('drops one bomb per press, even from a bomber, and keeps dropping while held', () => {
		const w = testWorld();
		const p = flying(w, 'b1', 1200, 300);
		simulateWorld(w, 1 / 60, { ...NO_INPUT, bomb: true, bombPressed: true });
		for (let i = 0; i < 6; i++) simulateWorld(w, 1 / 60, NO_INPUT);
		expect(w.bombs.length).toBe(1);
		for (let i = 0; i < 60; i++) simulateWorld(w, 1 / 60, { ...NO_INPUT, bomb: true });
		expect(w.bombs.length).toBeGreaterThan(4);
		expect(p.ammo.gp).toBe(p.capacity('gp') - w.bombs.length);
	});

	it('patches itself up after a quiet spell, but only partway', () => {
		const w = testWorld();
		const p = flying(w, 'kestrel');
		p.invuln = 0;
		p.hit(p.def.hp * 0.8, w, p.x, p.y);
		const hurt = p.hp;
		const hold = (seconds: number): void => {
			for (let i = 0; i < seconds * 60; i++) {
				simulateWorld(w, 1 / 60, NO_INPUT);
				p.x = 1200;
				p.y = w.ground(1200) + 200;
				p.vy = 0;
			}
		};
		hold(REPAIR_DELAY - 1);
		expect(p.hp).toBe(hurt);
		hold(40);
		expect(p.hp).toBeCloseTo(p.def.hp * REPAIR_CAP, 3);
		p.hit(5, w, p.x, p.y);
		hold(1);
		expect(p.hp).toBeLessThan(p.def.hp * REPAIR_CAP);
	});

	it('spools the afterburner up and down instead of switching it', () => {
		const w = testWorld();
		const p = flying(w, 'f16');
		simulateWorld(w, 1 / 60, { ...NO_INPUT, boost: true });
		expect(p.boostLevel).toBeGreaterThan(0);
		expect(p.boostLevel).toBeLessThan(0.3);
		expect(p.ignition).toBeGreaterThan(0.9);
		for (let i = 0; i < 60; i++) simulateWorld(w, 1 / 60, { ...NO_INPUT, boost: true });
		expect(p.boostLevel).toBeGreaterThan(0.95);
		simulateWorld(w, 1 / 60, NO_INPUT);
		expect(p.boostLevel).toBeGreaterThan(0.8);
	});

	it('airbrakes hard down to just above the stall, never into it', () => {
		const w = testWorld();
		const fly = (brake: boolean): Player => {
			const p = flying(w, 'f16', 1200, 200);
			for (let i = 0; i < 60 * 3; i++) {
				simulateWorld(w, 1 / 60, { ...NO_INPUT, brake });
				p.x = 1200;
				p.y = w.ground(1200) + 200;
				p.vy = 0;
				p.angle = 0;
			}
			return p;
		};
		const coasting = fly(false).speed;
		const braked = fly(true);
		expect(braked.speed).toBeLessThan(coasting * 0.75);
		expect(braked.speed).toBeGreaterThan(braked.def.stallSpeed);
		expect(braked.stalled).toBe(false);
	});

	it('rewards well-timed flares and punishes early ones', () => {
		const outcome = (dropAt: number): boolean => {
			const w = testWorld();
			const p = flying(w, 'kestrel', 1200, 180);
			p.invuln = 0;
			const hp = p.hp;
			const m = launchMissile(w, {
				kind: 'manpads',
				x: p.x - 1800,
				y: p.y - 80,
				angle: Math.atan2(80, 1800),
				speed: 200,
				maxSpeed: 260,
				accel: 60,
				turnRate: 3,
				target: p,
				burn: 14,
				life: 16,
				damage: 60,
				owner: 'enemy',
				seeker: 'heat'
			});
			let dropped = false;
			for (let i = 0; i < 60 * 16 && w.missiles.includes(m); i++) {
				const close = Math.hypot(m.x - p.x, m.y - p.y);
				const flare = !dropped && close < dropAt;
				if (flare) dropped = true;
				simulateWorld(w, 1 / 60, { ...NO_INPUT, flare });
				p.y = w.ground(p.x) + 180;
				p.vy = 0;
				p.angle = 0;
			}
			return p.hp === hp;
		};
		// No flares: it hits. Flares as it closes in: saved. Flares the moment it launches: wasted.
		expect(outcome(0)).toBe(false);
		expect(outcome(260)).toBe(true);
		expect(outcome(5000)).toBe(false);
	});

	it('boosts for about seven seconds', () => {
		const w = testWorld();
		const p = flying(w, 'f16');
		let t = 0;
		for (; t < 15 && p.boostMeter > 0.03; t += 1 / 60) {
			simulateWorld(w, 1 / 60, { ...NO_INPUT, boost: true });
			p.y = w.ground(p.x) + 200;
		}
		expect(t).toBeGreaterThan(6);
	});
});

describe('special ordnance', () => {
	it('flies a cruise missile low onto a designated tank', () => {
		const w = testWorld();
		const p = flying(w, 'b1', 900, 150);
		const tank = w.spawnUnit('tank', 1500, 0);
		tank.def = { ...tank.def, speed: 0 };
		release(w, p, 'cruise', { track: trackUnit(tank), unit: tank, x: tank.x, y: tank.y });
		let lowest = Infinity;
		for (let i = 0; i < 60 * 10 && w.strikes.length > 0; i++) {
			run(w, 1 / 60);
			const s = w.strikes[0];
			if (s && Math.abs(s.x - 1200) < 50) lowest = Math.min(lowest, s.y - w.ground(s.x));
		}
		expect(lowest).toBeLessThan(40);
		expect(tank.alive).toBe(false);
	});

	it('finds its own target when nothing is designated, and re-targets if it dies', () => {
		const w = testWorld();
		const p = flying(w, 'b1', 900, 150);
		const jeep = w.spawnUnit('jeep', 1350, 0);
		const tank = w.spawnUnit('tank', 1420, 0);
		for (const u of [jeep, tank]) u.def = { ...u.def, speed: 0 };
		release(w, p, 'cruise');
		const s = w.strikes[0];
		expect(s.target.x).toBeCloseTo(tank.x, 0);
		tank.alive = false;
		for (let i = 0; i < 60 * 12 && w.strikes.length > 0; i++) run(w, 1 / 60);
		expect(jeep.alive).toBe(false);
	});

	it('calls a ballistic missile down onto the target after a warning', () => {
		const w = testWorld();
		const p = flying(w, 'albatross', 1000, 200);
		const truck = w.spawnUnit('truck', 1400, 0);
		truck.def = { ...truck.def, speed: 0 };
		p.selected = 'ballistic';
		simulateWorld(w, 1 / 60, {
			...NO_INPUT,
			bombPressed: true,
			designate: { track: trackUnit(truck), unit: truck, x: truck.x, y: truck.y }
		});
		p.selected = 'gp';
		// It leaves from the aircraft, not from thin air over the target.
		expect(Math.abs(w.strikes[0].x - p.x)).toBeLessThan(10);
		run(w, 1.5);
		expect(truck.alive).toBe(true);
		run(w, 6);
		expect(truck.alive).toBe(false);
	});

	it('lands the ballistic missile where the bomb sight pointed at launch', () => {
		const w = testWorld();
		const p = flying(w, 'albatross', 1000, 200);
		const aim = predictImpact(w, p.x, p.y - 1, p.vx, p.vy, BOMBS.gp.drag, null).x;
		release(w, p, 'ballistic');
		const s = w.strikes[0];
		let x = s.x;
		for (let i = 0; i < 60 * 10 && w.strikes.length > 0; i++) {
			x = w.strikes[0]?.x ?? x;
			run(w, 1 / 60);
		}
		expect(w.strikes.length).toBe(0);
		expect(Math.abs(x - aim)).toBeLessThan(6);
	});

	it('gasses infantry while armour shrugs it off for a while', () => {
		const w = testWorld();
		const p = flying(w, 'su25', 1300, 120);
		const men = [0, 1, 2].map((i) => w.spawnUnit('rifleman', 1300 + i * 3, 0));
		const tank = w.spawnUnit('tank', 1305, 0);
		for (const u of [...men, tank]) u.def = { ...u.def, speed: 0 };
		w.gas.release(1302, w.ground(1302), 0, 24, 15);
		run(w, 6);
		expect(men.every((u) => !u.alive)).toBe(true);
		expect(tank.alive).toBe(true);
		expect(p.alive).toBe(true);
	});

	it('stops vehicles and drops helicopters with an EMP', () => {
		const w = testWorld();
		const p = flying(w, 'kestrel', 1100, 160);
		const truck = w.spawnUnit('truck', 1420, 0);
		const heli = new AirUnit(w.newId(), 'heli', 1450, w.ground(1450) + 50);
		w.air.push(heli);
		release(w, p, 'emp');
		for (let i = 0; i < 60 * 8 && w.bombs.length > 0; i++) run(w, 1 / 60);
		expect(truck.stun).toBeGreaterThan(0);
		const stalled = truck.x;
		run(w, 2);
		expect(truck.x).toBeCloseTo(stalled, 3);
		expect(heli.alive && !heli.dying).toBe(false);
	});

	it('gives the nuke back only once per wave, never at the airfield', () => {
		const w = testWorld();
		const p = flying(w, 'b1', 150, 20);
		p.ammo.nuke = 0;
		for (let i = 0; i < 60 * 20; i++) {
			simulateWorld(w, 1 / 60, NO_INPUT);
			p.x = 150;
			p.y = w.ground(150) + 20;
			p.vy = 0;
		}
		expect(p.rearming).toBe(true);
		expect(p.ammo.cruise).toBe(p.capacity('cruise'));
		expect(p.ammo.nuke).toBe(0);
		expect(p.resupply()).not.toBe('nuke');
		const waves = new WaveDirector(1);
		waves.begin(w, 2);
		expect(p.ammo.nuke).toBe(1);
	});

	it('flattens a whole column with the nuke', () => {
		const w = testWorld();
		const p = flying(w, 'b1', 1000, 260);
		const column = [1280, 1340, 1400, 1440].map((x) => w.spawnUnit('tank', x, 0));
		release(w, p, 'nuke');
		run(w, 10);
		expect(column.every((u) => !u.alive)).toBe(true);
	});

	it('drops paratroopers who land and shoot enemy infantry', () => {
		const w = testWorld();
		const p = flying(w, 'grizzly', 1300, 160);
		release(w, p, 'para');
		expect(w.troops.list.length).toBe(6);
		run(w, 30);
		const down = w.troops.list.filter((t) => t.landed);
		expect(down.length).toBeGreaterThan(3);
		const foe = w.spawnUnit('rifleman', down[0].x + 50, 0);
		foe.def = { ...foe.def, speed: 0, weapon: null };
		run(w, 15);
		expect(foe.alive).toBe(false);
	});
});
