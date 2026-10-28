import { describe, expect, it } from 'vitest';
import { environmentAt } from './environment';
import { BOMBS } from './defs-bombs';
import { Player } from './player';
import { IR_RANGE, launchMissile, updateProjectiles } from './projectiles';
import { testWorld } from './test-world';
import { applyWeather, weatherForWave, Weather } from './weather';
import { dropBomb, predictImpact, updateBombs } from './weapons';
import type { World } from './world';

/** Drops a bomb and returns where it hit the ground. */
function bombImpact(w: World, x: number, y: number, vx: number): number {
	const b = dropBomb(w, BOMBS.gp, x, y, 0, vx, 0, 0);
	let lastX = b.x;
	for (let i = 0; i < 900 && b.alive; i++) {
		lastX = b.x;
		updateBombs(w, 1 / 60);
	}
	return lastX;
}

describe('wind', () => {
	it('carries a falling bomb downwind', () => {
		const w = testWorld();
		const x = 1300,
			y = w.ground(1300) + 220;
		const calm = (w.weather.set({ kind: 'clear', wind: 0 }, true), bombImpact(w, x, y, 70));
		const tail = (w.weather.set({ kind: 'clear', wind: 12 }, true), bombImpact(w, x, y, 70));
		const head = (w.weather.set({ kind: 'clear', wind: -12 }, true), bombImpact(w, x, y, 70));
		expect(tail - calm).toBeGreaterThan(5);
		expect(calm - head).toBeGreaterThan(5);
	});

	it('is allowed for by the bomb sight', () => {
		const w = testWorld();
		w.weather.set({ kind: 'clear', wind: -10 }, true);
		const x = 1300,
			y = w.ground(1300) + 150;
		const hit = predictImpact(w, x, y, 70, 0, BOMBS.gp.drag, null);
		expect(Math.abs(bombImpact(w, x, y, 70) - hit.x)).toBeLessThan(4);
	});

	it('drives particle drift and gas clouds', () => {
		const w = testWorld();
		w.weather.set({ kind: 'storm', wind: -11 }, true);
		w.weather.update(w, 1 / 60);
		expect(w.particles.windX).toBeLessThan(-5);
		w.gas.release(1500, w.ground(1500), 0, 20, 30);
		for (let i = 0; i < 120; i++) w.gas.update(w, 1 / 60);
		expect(w.gas.list[0].x).toBeLessThan(1500);
	});

	it('gusts around its mean without changing direction', () => {
		const w = testWorld();
		w.weather.set({ kind: 'rain', wind: 6 }, true);
		const seen: number[] = [];
		for (let i = 0; i < 60 * 30; i++) {
			w.time += 1 / 60;
			w.weather.update(w, 1 / 60);
			seen.push(w.weather.wind);
		}
		expect(Math.min(...seen)).toBeGreaterThan(0);
		expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1);
	});
});

describe('precipitation', () => {
	it('fills the view with rain and snow particles, and none in clear skies', () => {
		const w = testWorld();
		w.camera.x = 1300;
		w.camera.y = w.ground(1300) + 60;
		w.weather.update(w, 0.5);
		expect(w.particles.count).toBe(0);
		w.weather.set({ kind: 'rain', wind: 5 }, true);
		w.weather.update(w, 0.5);
		const rain = w.particles.count;
		expect(rain).toBeGreaterThan(200);
		w.particles.clear();
		w.weather.set({ kind: 'snow', wind: 5 }, true);
		w.weather.update(w, 0.5);
		expect(w.particles.count).toBeGreaterThan(80);
		expect(w.particles.count).toBeLessThan(rain);
	});

	it('rolls a front in gradually unless told to switch at once', () => {
		const weather = new Weather();
		const w = testWorld();
		weather.set({ kind: 'rain', wind: 4 });
		weather.update(w, 1);
		expect(weather.precip).toBeGreaterThan(0);
		expect(weather.precip).toBeLessThan(0.3);
		for (let i = 0; i < 20; i++) weather.update(w, 1);
		expect(weather.precip).toBeCloseTo(0.7);
	});

	it('strikes lightning in a storm, lighting the sky and rolling thunder', () => {
		const w = testWorld();
		const booms: number[] = [];
		const sound = w.sound;
		w.sound = { ...sound, boom: (power) => booms.push(power) };
		w.weather.set({ kind: 'storm', wind: 10 }, true);
		for (let i = 0; i < 60 * 30 && booms.length === 0; i++) {
			w.time += 1 / 60;
			w.weather.update(w, 1 / 60);
		}
		w.sound = sound;
		expect(w.weather.bolts).toBeGreaterThan(0);
		expect(booms.length).toBeGreaterThan(0);
	});

	it('never strikes lightning in plain rain', () => {
		const w = testWorld();
		w.weather.set({ kind: 'rain', wind: 6 }, true);
		const before = w.weather.bolts;
		for (let i = 0; i < 60 * 30; i++) w.weather.update(w, 1 / 60);
		expect(w.weather.bolts).toBe(before);
	});
});

describe('heat seekers in bad weather', () => {
	const chase = (w: World, p: Player, seeker: 'heat' | 'radar') =>
		launchMissile(w, {
			kind: seeker === 'heat' ? 'manpads' : 'sam',
			x: p.x - IR_RANGE * 0.8,
			y: p.y,
			angle: 0,
			speed: 150,
			maxSpeed: 200,
			accel: 50,
			turnRate: 2.5,
			target: p,
			burn: 4,
			life: 8,
			damage: 30,
			owner: 'enemy',
			seeker
		});

	it('lose a distant aircraft in rain but not in clear air', () => {
		const w = testWorld();
		const p = new Player('grizzly', 2200, w.ground(2200) + 200, 0);
		w.player = p;
		const clear = chase(w, p, 'heat');
		updateProjectiles(w, 1 / 60);
		expect(clear.target).toBe(p);
		w.missiles.length = 0;
		w.weather.set({ kind: 'rain', wind: 4 }, true);
		const wet = chase(w, p, 'heat');
		updateProjectiles(w, 1 / 60);
		expect(wet.target).toBeNull();
	});

	it('leave radar seekers unaffected', () => {
		const w = testWorld();
		const p = new Player('grizzly', 2200, w.ground(2200) + 200, 0);
		w.player = p;
		w.weather.set({ kind: 'storm', wind: 4 }, true);
		const m = chase(w, p, 'radar');
		updateProjectiles(w, 1 / 60);
		expect(m.target).toBe(p);
	});

	it('shrinks the infrared range with the strength of the weather', () => {
		const weather = new Weather();
		expect(weather.irScale()).toBe(1);
		weather.set({ kind: 'snow', wind: 0 }, true);
		const snow = weather.irScale();
		weather.set({ kind: 'storm', wind: 0 }, true);
		expect(weather.irScale()).toBeLessThan(snow);
		expect(snow).toBeLessThan(1);
	});
});

describe('weather schedule and look', () => {
	it('opens the war with clear waves, then brings every kind of weather', () => {
		expect(weatherForWave(1).kind).toBe('clear');
		expect(weatherForWave(2).kind).toBe('clear');
		const kinds = new Set(Array.from({ length: 10 }, (_, i) => weatherForWave(i + 1).kind));
		expect(kinds).toEqual(new Set(['clear', 'rain', 'storm', 'snow']));
	});

	it('dims the sun and thickens fog under cloud', () => {
		const weather = new Weather();
		const clear = environmentAt(0);
		const grey = environmentAt(0);
		weather.set({ kind: 'storm', wind: 0 }, true);
		applyWeather(grey, weather);
		expect(grey.sunColor[0]).toBeLessThan(clear.sunColor[0] * 0.5);
		expect(grey.fog[0]).toBeGreaterThan(clear.fog[0]);
		expect(grey.saturation).toBeLessThan(clear.saturation);
	});

	it('is reset to clear for a new battle', () => {
		const w = testWorld();
		w.weather.set({ kind: 'storm', wind: 12 }, true);
		w.reset();
		expect(w.weather.kind).toBe('clear');
		expect(w.weather.precip).toBe(0);
	});
});
