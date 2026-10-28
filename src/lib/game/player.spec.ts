import { describe, expect, it } from 'vitest';
import { WORLD } from './constants';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import { NO_INPUT, Player, type PilotInput } from './player';
import { testWorld } from './test-world';

const fly = (p: Player, input: Partial<PilotInput>, seconds: number, w = testWorld()): void => {
	const inp = { ...NO_INPUT, ...input };
	for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, inp, w);
};

describe('Player flight model', () => {
	it('holds altitude in hands-off level flight at cruise speed', () => {
		const w = testWorld();
		const p = new Player('kestrel', 800, w.ground(800) + 120, 0);
		w.player = p;
		const y0 = p.y;
		fly(p, {}, 3, w);
		expect(p.alive).toBe(true);
		expect(Math.abs(p.y - y0)).toBeLessThan(25);
		expect(p.speed).toBeGreaterThan(p.def.stallSpeed);
	});

	it('flies about twice as fast on boost', () => {
		const w = testWorld();
		w.godMode = true;
		const cruising = new Player('kestrel', 800, w.ground(800) + 200, 0);
		const boosting = new Player('kestrel', 800, w.ground(800) + 200, 0);
		fly(cruising, { steerX: 1 }, 10, w);
		fly(boosting, { steerX: 1, boost: true }, 10, w);
		expect(boosting.speed).toBeGreaterThan(cruising.speed * 1.8);
	});

	it('climbs when steered upward and descends when steered down', () => {
		const w = testWorld();
		const up = new Player('kestrel', 800, w.ground(800) + 150, 0);
		const down = new Player('kestrel', 800, w.ground(800) + 150, 0);
		fly(up, { steerX: 1, steerY: 0.6 }, 2, w);
		fly(down, { steerX: 1, steerY: -0.6 }, 2, w);
		expect(up.y).toBeGreaterThan(down.y + 20);
	});

	it('reverses direction by looping over the top', () => {
		const w = testWorld();
		const p = new Player('kestrel', 900, w.ground(900) + 120, 0);
		const y0 = p.y;
		let peak = p.y;
		for (let t = 0; t < 4; t += 1 / 60) {
			p.update(1 / 60, { ...NO_INPUT, steerX: -1 }, w);
			peak = Math.max(peak, p.y);
		}
		expect(Math.cos(p.angle)).toBeLessThan(0);
		expect(peak).toBeGreaterThan(y0 + 15);
		expect(p.rollTarget).toBeCloseTo(Math.PI);
	});

	it('stalls and drops its nose when pointed straight up', () => {
		const w = testWorld();
		const p = new Player('kestrel', 900, w.ground(900) + 200, Math.PI / 2);
		p.vx = 0;
		p.vy = 20;
		fly(p, {}, 2.5, w);
		expect(Math.sin(p.angle)).toBeLessThan(0.6);
	});

	it('crashes into open ground but can land level on the runway', () => {
		const w = testWorld();
		const crash = new Player('kestrel', 1200, w.ground(1200) + 8, -0.5);
		w.player = crash;
		fly(crash, {}, 1.5, w);
		expect(crash.crashed).toBe(true);

		const land = new Player('kestrel', WORLD.runwayMinX + 20, w.ground(80) + 2.2, 0);
		land.vx = 45;
		land.vy = -1;
		land.gear.extend();
		w.player = land;
		fly(land, { brake: true }, 1, w);
		expect(land.crashed).toBe(false);
		expect(land.landed).toBe(true);
	});

	it('drops the selected bomb with the aircraft velocity', () => {
		const w = testWorld();
		const p = new Player('kestrel', 900, w.ground(900) + 100, 0);
		w.player = p;
		const before = p.ammo.gp;
		p.update(1 / 60, { ...NO_INPUT, bombPressed: true }, w);
		expect(p.ammo.gp).toBe(before - 1);
		expect(w.bombs.length).toBe(1);
		expect(w.bombs[0].vx).toBeCloseTo(p.vx, -1);
	});

	it('overheats the guns under sustained fire', () => {
		const w = testWorld();
		const p = new Player('kestrel', 900, w.ground(900) + 150, 0);
		w.player = p;
		fly(p, { fire: true }, 6, w);
		expect(p.overheated).toBe(true);
		expect(w.bullets.length).toBeGreaterThan(20);
	});

	it('repairs and rearms specials while low over the runway', () => {
		const w = testWorld();
		const p = new Player('kestrel', 150, w.ground(150) + 30, 0);
		p.vx = 50;
		p.hp = 40;
		p.ammo.napalm = 0;
		w.player = p;
		fly(p, { brake: true }, 2, w);
		expect(p.rearming || p.x > WORLD.runwayMaxX).toBe(true);
		expect(p.hp).toBeGreaterThan(40);
	});
	it('turns itself back before reaching the edge of the landscape', () => {
		// The gunship's orbit is clamped inside the arena instead (see aircraft.spec).
		for (const id of AIRCRAFT_ORDER.filter((a) => AIRCRAFT[a].flight !== 'orbit')) {
			for (const side of [1, -1]) {
				const w = testWorld();
				w.godMode = true;
				const x0 = side > 0 ? WORLD.arenaMaxX : WORLD.arenaMinX;
				const p = new Player(id, x0, w.ground(x0) + 150, side > 0 ? 0 : Math.PI);
				w.player = p;
				let reach = 0;
				for (let t = 0; t < 30; t += 1 / 60) {
					p.update(1 / 60, { ...NO_INPUT, steerX: side, boost: true }, w);
					reach = Math.max(reach, (p.x - x0) * side);
				}
				expect(reach).toBeGreaterThan(WORLD.arenaTurnback);
				expect(reach).toBeLessThan(WORLD.arenaTurnback + 300);
			}
		}
	});
});
