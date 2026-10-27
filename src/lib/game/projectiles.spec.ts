import { describe, expect, it } from 'vitest';
import { NO_INPUT, Player } from './player';
import {
	launchMissile,
	missileTurnLimit,
	spawnBullet,
	updateProjectiles,
	type Flare,
	type Missile
} from './projectiles';
import { testWorld } from './test-world';
import type { AircraftId, Trackable } from './types';

const target = (x: number, y: number): Trackable => ({
	x,
	y,
	z: 0,
	vx: 0,
	vy: 0,
	alive: true,
	heat: 1
});

describe('missiles', () => {
	it('home onto a target and detonate on proximity', () => {
		const w = testWorld();
		const p = new Player('grizzly', 1600, w.ground(1600) + 200, 0);
		p.vx = 0;
		p.vy = 0;
		p.invuln = 0;
		w.player = p;
		launchMissile(w, {
			kind: 'sam',
			x: 1400,
			y: w.ground(1400) + 5,
			angle: 1.2,
			speed: 30,
			maxSpeed: 260,
			accel: 230,
			turnRate: 2.4,
			target: p,
			burn: 3.4,
			life: 9,
			damage: 50,
			owner: 'enemy',
			seeker: 'radar'
		});
		const hp = p.hp;
		for (let i = 0; i < 60 * 6 && w.missiles.length > 0; i++) {
			p.x = 1600;
			p.y = w.ground(1600) + 200;
			updateProjectiles(w, 1 / 60);
		}
		expect(w.missiles.length).toBe(0);
		expect(p.hp).toBeLessThan(hp - 40);
	});

	describe('flares', () => {
		/** A missile at (x, y) flying straight at `t`. */
		const chase = (
			w: ReturnType<typeof testWorld>,
			t: Trackable,
			x: number,
			y: number,
			seeker: 'heat' | 'radar' = 'heat'
		) =>
			launchMissile(w, {
				kind: seeker === 'heat' ? 'manpads' : 'sam',
				x,
				y,
				angle: Math.atan2(t.y - y, t.x - x),
				speed: 150,
				maxSpeed: 200,
				accel: 50,
				turnRate: 2.5,
				target: t,
				burn: 4,
				life: 8,
				damage: 30,
				owner: 'enemy',
				seeker
			});
		const flareAt = (w: ReturnType<typeof testWorld>, x: number, y: number): Flare => {
			const f: Flare = { ...target(x, y), vz: 0, heat: 4, age: 0, life: 3 };
			w.flares.push(f);
			return f;
		};

		it('decoy a seeker when the flare is between it and the aircraft', () => {
			const w = testWorld();
			const t = target(1500, 200);
			const m = chase(w, t, 1200, 200);
			const f = flareAt(w, 1440, 196);
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBe(f);
		});

		it('do nothing when the missile cannot see them', () => {
			const w = testWorld();
			const t = target(1500, 200);
			// Head-on shot from ahead: flares trailing behind the aircraft are out of its view.
			const m = chase(w, t, 1800, 200);
			flareAt(w, 1440, 190);
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBe(t);
		});

		it('are wasted if dropped too early, too far from the missile’s line', () => {
			const w = testWorld();
			const t = target(1500, 200);
			const m = chase(w, t, 1000, 200);
			flareAt(w, 1500, 60);
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBe(t);
		});

		it('barely bother a radar-guided missile', () => {
			const w = testWorld();
			const t = target(1500, 200);
			const radar = chase(w, t, 1200, 200, 'radar');
			const heat = chase(w, t, 1200, 200, 'heat');
			// A flare a little off the line: the heat seeker sees it, the radar does not.
			flareAt(w, 1430, 235);
			updateProjectiles(w, 1 / 60);
			expect(heat.target).not.toBe(t);
			expect(radar.target).toBe(t);
		});

		it('let a seeker pick the aircraft back up once the flare burns out', () => {
			const w = testWorld();
			const t = target(1500, 200);
			const m = chase(w, t, 1200, 200);
			const f = flareAt(w, 1440, 196);
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBe(f);
			f.alive = false;
			w.flares.length = 0;
			const p = new Player('kestrel', 1500, 200, 0);
			w.player = p;
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBe(p);
		});
	});

	describe('can be outmaneuvered', () => {
		/**
		 * An air-to-air missile fired from 400 behind an aircraft in level flight.
		 * The pilot breaks hard across the missile's path once it is `breakAt` away
		 * (or never, for -1). Returns whether it hit and what became of it.
		 */
		const engage = (id: AircraftId, breakAt: number) => {
			const w = testWorld();
			const x0 = 2000;
			const p = new Player(id, x0, w.ground(x0) + 260, 0);
			p.invuln = 0;
			w.player = p;
			const m = launchMissile(w, {
				kind: 'air',
				x: x0 - 400,
				y: p.y + 20,
				angle: Math.atan2(-20, 400),
				speed: 90,
				maxSpeed: 230,
				accel: 200,
				turnRate: 2.4,
				target: p,
				burn: 2.6,
				life: 6,
				damage: 30,
				owner: 'enemy',
				seeker: 'heat'
			});
			const hp = p.hp;
			let broke = false;
			for (let i = 0; i < 60 * 8 && w.missiles.includes(m); i++) {
				if (Math.hypot(m.x - p.x, m.y - p.y) < breakAt) broke = true;
				const sp = Math.hypot(m.vx, m.vy) || 1;
				const steer = broke ? { steerX: -m.vy / sp, steerY: m.vx / sp } : { steerX: 1, steerY: 0 };
				p.update(1 / 60, { ...NO_INPUT, ...steer }, w);
				updateProjectiles(w, 1 / 60);
			}
			return { hit: p.hp < hp, lostLock: m.target === null };
		};

		it('never by an aircraft flying straight', () => {
			expect(engage('f16', -1).hit).toBe(true);
		});

		it('by an agile jet breaking hard as the missile closes: it overshoots and loses the lock', () => {
			const r = engage('f16', 140);
			expect(r.hit).toBe(false);
			expect(r.lostLock).toBe(true);
			expect(engage('wraith', 140).hit).toBe(false);
		});

		it('only with the right timing: break too early and the missile just follows', () => {
			expect(engage('f16', 450).hit).toBe(true);
		});

		it('not by a heavy aircraft making the same break', () => {
			expect(engage('grizzly', 140).hit).toBe(true);
			expect(engage('b1', 140).hit).toBe(true);
		});
	});

	describe('flight model', () => {
		const missile = (speed: number, owner: 'enemy' | 'player' = 'enemy'): Missile =>
			launchMissile(testWorld(), {
				kind: owner === 'enemy' ? 'sam' : 'agm',
				x: 1500,
				y: 400,
				angle: 0,
				speed,
				maxSpeed: 265,
				accel: 0,
				turnRate: 2.25,
				target: null,
				burn: 3,
				life: 9,
				damage: 50,
				owner,
				seeker: 'radar'
			});

		it('turns tighter slow than fast (a G limit, not a fixed turn rate)', () => {
			const slow = missileTurnLimit(missile(60), true);
			const fast = missileTurnLimit(missile(265), true);
			expect(fast).toBeLessThan(slow * 0.6);
			// Fast, it can pull less lateral acceleration than a hard-turning fighter at cruise.
			expect(fast * 265).toBeLessThan(2.7 * 90);
			// Coasting after burnout it has even less authority.
			expect(missileTurnLimit(missile(265), false)).toBeLessThan(fast);
		});

		it('keeps simple guidance for the player’s own missiles', () => {
			expect(missileTurnLimit(missile(265, 'player'), true)).toBe(2.25);
		});

		it('bleeds speed in turns', () => {
			const run = (tx: number, ty: number) => {
				const w = testWorld();
				const t: Trackable = { ...target(tx, ty), alive: true };
				const m = launchMissile(w, {
					kind: 'sam',
					x: 1500,
					y: w.ground(1500) + 300,
					angle: 0,
					speed: 200,
					maxSpeed: 265,
					accel: 0,
					turnRate: 2.25,
					target: t,
					burn: 0,
					life: 9,
					damage: 50,
					owner: 'enemy',
					seeker: 'radar'
				});
				for (let i = 0; i < 30; i++) updateProjectiles(w, 1 / 60);
				return m.speed;
			};
			const straight = run(2500, testWorld().ground(1500) + 300);
			const turning = run(1700, testWorld().ground(1500) + 700);
			expect(turning).toBeLessThan(straight - 10);
		});

		it('loses its lock once a coasting missile runs out of speed', () => {
			const w = testWorld();
			const t = target(1900, w.ground(1500) + 300);
			const m = launchMissile(w, {
				kind: 'air',
				x: 1500,
				y: w.ground(1500) + 300,
				angle: 0,
				speed: 50,
				maxSpeed: 230,
				accel: 0,
				turnRate: 2.4,
				target: t,
				burn: 0,
				life: 6,
				damage: 30,
				owner: 'enemy',
				seeker: 'heat'
			});
			updateProjectiles(w, 1 / 60);
			expect(m.target).toBeNull();
		});
	});

	it('self-destruct once their motor and fuel run out', () => {
		const w = testWorld();
		launchMissile(w, {
			kind: 'air',
			x: 1500,
			y: w.ground(1500) + 400,
			angle: Math.PI / 2,
			speed: 90,
			maxSpeed: 230,
			accel: 200,
			turnRate: 2.4,
			target: null,
			burn: 1,
			life: 2,
			damage: 30,
			owner: 'enemy',
			seeker: 'heat'
		});
		for (let i = 0; i < 60 * 3; i++) updateProjectiles(w, 1 / 60);
		expect(w.missiles.length).toBe(0);
	});
});

describe('bullets', () => {
	it('damage ground units on the side-on hit box', () => {
		const w = testWorld();
		const truck = w.spawnUnit('truck', 1500, 0);
		spawnBullet(w, {
			x: 1450,
			y: truck.y + 1.2,
			z: 0,
			vx: 700,
			vy: 0,
			life: 1,
			damage: 20,
			pierce: 0.2,
			owner: 'player',
			tracer: true,
			color: [1, 1, 1],
			size: 0.2,
			explosive: 0
		});
		for (let i = 0; i < 10; i++) updateProjectiles(w, 1 / 60);
		expect(truck.hp).toBeLessThan(truck.def.hp);
		expect(w.bullets.length).toBe(0);
	});

	it('can shoot down incoming missiles', () => {
		const w = testWorld();
		const m = launchMissile(w, {
			kind: 'sam',
			x: 1500,
			y: 300,
			angle: Math.PI,
			speed: 0.01,
			maxSpeed: 0.01,
			accel: 0,
			turnRate: 0,
			target: null,
			burn: 10,
			life: 10,
			damage: 50,
			owner: 'enemy',
			seeker: 'radar'
		});
		spawnBullet(w, {
			x: 1450,
			y: 300,
			z: 0,
			vx: 700,
			vy: 2,
			life: 1,
			damage: 9,
			pierce: 0.1,
			owner: 'player',
			tracer: false,
			color: [1, 1, 1],
			size: 0.2,
			explosive: 0
		});
		for (let i = 0; i < 12; i++) updateProjectiles(w, 1 / 60);
		expect(w.missiles.includes(m)).toBe(false);
	});

	it('hit the player when fired by the enemy', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1500, 300, 0);
		p.invuln = 0;
		w.player = p;
		spawnBullet(w, {
			x: 1400,
			y: 300,
			z: 0,
			vx: 600,
			vy: 0,
			life: 1,
			damage: 5,
			pierce: 0,
			owner: 'enemy',
			tracer: true,
			color: [1, 0, 0],
			size: 0.2,
			explosive: 0
		});
		for (let i = 0; i < 20; i++) updateProjectiles(w, 1 / 60);
		expect(p.hp).toBe(p.def.hp - 5);
		expect(w.damageTaken['bullet:0.2']).toBe(5);
	});
});
