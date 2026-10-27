import { describe, expect, it } from 'vitest';
import { Rng } from '../engine/rng';
import { WORLD } from './constants';
import { bayJams, engineFactor, noDamage, repairSystems, rollComponentHit } from './damage';
import { NO_INPUT, Player, type PilotInput } from './player';
import { testWorld } from './test-world';
import type { World } from './world';

const fly = (p: Player, input: Partial<PilotInput>, seconds: number, w: World): void => {
	const inp = { ...NO_INPUT, ...input };
	for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, inp, w);
};

const airborne = (w: World): Player => {
	const p = new Player('kestrel', 900, w.ground(900) + 140, 0);
	p.invuln = 0;
	w.player = p;
	return p;
};

describe('component damage rolls', () => {
	it('never damages a system for boundary or crash damage', () => {
		const r = new Rng(3);
		for (let i = 0; i < 200; i++) {
			expect(rollComponentHit(500, 140, 'bounds', r)).toBeNull();
			expect(rollComponentHit(500, 140, 'crash', r)).toBeNull();
		}
	});

	it('breaks systems more often, and worse, for heavier hits', () => {
		const count = (amount: number) => {
			const r = new Rng(7);
			let hits = 0;
			for (let i = 0; i < 2000; i++) if (rollComponentHit(amount, 140, 'flak', r)) hits++;
			return hits;
		};
		expect(count(3)).toBeLessThan(count(30));
		expect(count(3)).toBeLessThan(200);
		const r = new Rng(1);
		let big = null;
		while (!big) big = rollComponentHit(70, 140, 'missile:sam', r);
		expect(big.severity).toBe(1);
	});

	it('hits every component', () => {
		const r = new Rng(5);
		const seen = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const h = rollComponentHit(40, 140, 'flak', r);
			if (h) seen.add(h.component);
		}
		expect([...seen].sort()).toEqual(['engine', 'hydraulics', 'wing']);
	});

	it('scales engine thrust and bay jams with severity', () => {
		expect(engineFactor(0)).toBe(1);
		expect(engineFactor(1)).toBeLessThan(0.6);
		const r = new Rng(2);
		for (let i = 0; i < 100; i++) expect(bayJams(0, r)).toBe(false);
	});

	it('repairs every system back to zero over time', () => {
		const s = { engine: 1, wing: 0.5, hydraulics: 0.2 };
		let broken = true;
		for (let t = 0; t < 10 && broken; t += 0.1) broken = repairSystems(s, 0.1);
		expect(broken).toBe(false);
		expect(s).toEqual(noDamage());
	});
});

describe('damaged aircraft', () => {
	it('flies slower with a damaged engine', () => {
		const w = testWorld();
		const ok = airborne(w);
		const hurt = airborne(w);
		hurt.damageSystem('engine', 1, w);
		fly(ok, { boost: true }, 2, w);
		fly(hurt, { boost: true }, 2, w);
		expect(hurt.speed).toBeLessThan(ok.speed - 5);
		expect(hurt.alive).toBe(true);
	});

	it('pulls off heading with a damaged wing', () => {
		const w = testWorld();
		const ok = airborne(w);
		const hurt = airborne(w);
		hurt.damageSystem('wing', 1, w);
		fly(ok, { steerX: 1 }, 1.5, w);
		fly(hurt, { steerX: 1 }, 1.5, w);
		expect(Math.abs(ok.angle)).toBeLessThan(0.05);
		expect(Math.abs(hurt.angle)).toBeGreaterThan(0.05);
		expect(Math.sign(hurt.angle)).toBe(hurt.wingPull);
	});

	it('sometimes keeps bombs stuck in the bay with damaged hydraulics', () => {
		const w = testWorld();
		const p = airborne(w);
		p.damageSystem('hydraulics', 1, w);
		let jams = 0;
		for (let i = 0; i < 20; i++) {
			const before = p.ammo.gp;
			p.update(1 / 60, { ...NO_INPUT, bombPressed: true }, w);
			if (p.ammo.gp === before) jams++;
			fly(p, {}, 1, w);
			p.ammo.gp = p.capacity('gp');
		}
		expect(jams).toBeGreaterThan(5);
		expect(jams).toBeLessThan(20);
	});

	it('announces a system the first time it breaks', () => {
		const w = testWorld();
		const said: string[] = [];
		w.events.message = (t) => said.push(t);
		const p = airborne(w);
		p.damageSystem('engine', 0.4, w);
		p.damageSystem('engine', 0.8, w);
		expect(said).toEqual(['ENGINE HIT']);
		expect(p.systems.engine).toBe(0.8);
	});

	it('is only repaired by landing on the runway', () => {
		const w = testWorld();
		const said: string[] = [];
		w.events.message = (t) => said.push(t);
		// Flying low over the runway rearms but does not fix systems.
		const low = new Player('kestrel', WORLD.runwayMinX + 20, w.ground(80) + 20, 0);
		low.damageSystem('wing', 1, w);
		low.damageSystem('engine', 1, w);
		w.player = low;
		fly(low, {}, 0.5, w);
		expect(low.rearming).toBe(true);
		expect(low.systems.engine).toBe(1);

		const land = new Player('kestrel', WORLD.runwayMinX + 20, w.ground(80) + 2.2, 0);
		land.vx = 45;
		land.vy = -1;
		land.gear.extend();
		land.damageSystem('engine', 1, w);
		land.damageSystem('hydraulics', 1, w);
		w.player = land;
		fly(land, { brake: true }, 4, w);
		expect(land.landed).toBe(true);
		expect(land.systemsDamaged).toBe(false);
		expect(said).toContain('SYSTEMS REPAIRED');
	});
});
