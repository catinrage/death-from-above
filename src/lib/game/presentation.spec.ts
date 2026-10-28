import { describe, expect, it } from 'vitest';
import { LightSystem } from '../engine/lights';
import { MAX_LIGHTS } from '../engine/shaders/common';
import { CameraRig } from './camera';
import { environmentAt, PRESETS, presetName } from './environment';

describe('environment', () => {
	it('returns each preset exactly at integer phases', () => {
		const e = environmentAt(1);
		expect(e.zenith).toEqual(PRESETS[1].zenith);
		expect(presetName(1)).toBe(PRESETS[1].name);
		expect(Math.hypot(e.sunDir[0], e.sunDir[1], e.sunDir[2])).toBeCloseTo(1, 5);
	});

	it('blends smoothly between presets and wraps around', () => {
		const a = environmentAt(0.5);
		expect(a.exposure).toBeCloseTo((PRESETS[0].exposure + PRESETS[1].exposure) / 2, 5);
		expect(environmentAt(PRESETS.length).zenith).toEqual(PRESETS[0].zenith);
	});

	it('fades the key light out while it swaps from sun to moon', () => {
		const dusk = PRESETS.findIndex((p) => p.name === 'Dusk');
		const swap = environmentAt(dusk + 0.5);
		const level = Math.max(...swap.sunColor);
		expect(level).toBeLessThan(0.05);
		expect(environmentAt(dusk + 1).stars).toBe(1);
	});
});

describe('LightSystem', () => {
	it('keeps the brightest nearby lights within the shader limit', () => {
		const ls = new LightSystem(64);
		for (let i = 0; i < 50; i++) ls.add(i * 2, 0, 0, [1, 1, 1], i + 1, 20, { life: 5 });
		ls.add(5000, 0, 0, [1, 1, 1], 1000, 20, { life: 5 });
		ls.update(0.01);
		const n = ls.pack(0, 0, 300);
		expect(n).toBe(MAX_LIGHTS);
		for (let i = 0; i < n; i++) expect(ls.packedPos[i * 4]).toBeLessThan(5000);
	});

	it('expires transient lights and keeps persistent ones until released', () => {
		const ls = new LightSystem(8);
		ls.add(0, 0, 0, [1, 0.5, 0.2], 10, 10, { life: 0.2 });
		const fire = ls.add(0, 0, 0, [1, 0.5, 0.2], 10, 10, { life: Infinity, flicker: 0.5 });
		ls.update(0.5);
		expect(ls.pack(0, 0, 100)).toBe(1);
		fire.release();
		ls.update(0.01);
		expect(ls.pack(0, 0, 100)).toBe(0);
	});
});

describe('CameraRig', () => {
	it('frames both the aircraft and the ground beneath it', () => {
		const cam = new CameraRig();
		cam.aspect = 16 / 9;
		cam.snap({ x: 500, y: 90, vx: 0, vy: 0 }, 10);
		cam.update(0, 10);
		const plane = cam.project(500, 90, 0, 1600, 900);
		const ground = cam.project(500, 10, 0, 1600, 900);
		expect(plane && plane[1] > 0 && plane[1] < 900 * 0.4).toBe(true);
		expect(ground && ground[1] > 900 * 0.55 && ground[1] < 900).toBe(true);
	});

	it('leads ahead of fast flight and settles shake over time', () => {
		const cam = new CameraRig();
		cam.snap({ x: 0, y: 100, vx: 80, vy: 0 }, 0);
		expect(cam.x).toBeGreaterThan(30);
		cam.addTrauma(1);
		for (let i = 0; i < 120; i++) cam.update(1 / 60, 0);
		expect(cam.trauma).toBeLessThan(0.1);
		expect(cam.project(0, 0, 1e6, 100, 100)).toBeNull();
	});
});

describe('LightSystem under pressure', () => {
	it('never steals a persistent light when the pool is full', () => {
		const ls = new LightSystem(4);
		const fire = ls.add(0, 0, 0, [1, 0.5, 0.2], 0.01, 10, { life: Infinity });
		for (let i = 0; i < 10; i++) ls.add(i, 0, 0, [1, 1, 1], 50, 10, { life: 1 });
		expect(fire.active).toBe(true);
		expect(fire.intensity).toBeCloseTo(0.01);
	});
});

describe('CameraRig bomb framing', () => {
	const onScreen = (s: [number, number] | null, w: number, h: number): boolean =>
		!!s && s[0] >= 0 && s[0] <= w && s[1] >= 0 && s[1] <= h;

	it('keeps both the aircraft and the predicted impact on screen', () => {
		const cam = new CameraRig();
		cam.aspect = 1.94;
		const plane = { x: 1000, y: 45, vx: 68, vy: 0 };
		for (const reach of [170, 260, 320]) {
			cam.interest = [1000 + reach, 1000 + reach];
			cam.snap(plane, 0);
			cam.update(0, 0);
			expect(onScreen(cam.project(1000, 45, 0, 1940, 1000), 1940, 1000)).toBe(true);
			expect(onScreen(cam.project(1000 + reach, 0, 0, 1940, 1000), 1940, 1000)).toBe(true);
		}
	});

	it('keeps the battle line low on screen when zoomed out for the sight', () => {
		const cam = new CameraRig();
		cam.aspect = 1.94;
		cam.interest = [1260, 1260];
		cam.snap({ x: 1000, y: 45, vx: 68, vy: 0 }, 0);
		cam.update(0, 0);
		const ground = cam.project(1100, 0, 0, 1940, 1000);
		expect(ground && ground[1] > 600 && ground[1] < 820).toBe(true);
	});

	it('falls back to a plain velocity lead without a sight', () => {
		const cam = new CameraRig();
		cam.interest = null;
		cam.snap({ x: 0, y: 100, vx: 80, vy: 0 }, 0);
		expect(cam.x).toBeCloseTo(80);
	});
});

describe('CameraRig on the runway', () => {
	it('keeps the ground line low with sky above while taking off or landing', () => {
		const cam = new CameraRig();
		cam.aspect = 1.94;
		for (const interest of [null, [1015, 1015] as [number, number]]) {
			cam.interest = interest;
			cam.snap({ x: 1000, y: 12, vx: 0, vy: 0 }, 10);
			cam.update(0, 10);
			const ground = cam.project(1000, 10, 0, 1940, 1000);
			const plane = cam.project(1000, 12, 0, 1940, 1000);
			expect(ground && ground[1] > 600 && ground[1] < 760).toBe(true);
			expect(plane && plane[1] > 500 && plane[1] < ground![1]).toBe(true);
		}
	});
});

describe('CameraRig high altitude', () => {
	it('zooms out as the aircraft climbs so the ground never leaves the frame', () => {
		const cam = new CameraRig();
		cam.aspect = 16 / 9;
		const ground = 10;
		const t = { x: 500, y: 50, vx: 60, vy: 0 };
		cam.snap(t, ground);
		const startDist = cam.dist;
		for (let i = 0; i < 60 * 12; i++) {
			const dt = 1 / 60;
			t.vy = t.y < ground + 340 ? 45 : 0;
			t.x += t.vx * dt;
			t.y += t.vy * dt;
			cam.follow(dt, t, ground);
			cam.update(dt, ground);
			const plane = cam.project(t.x, t.y, 0, 1600, 900);
			const floor = cam.project(t.x, ground, 0, 1600, 900);
			expect(plane && plane[1] > 0 && plane[1] < 900).toBe(true);
			expect(floor && floor[1] > 0 && floor[1] < 900).toBe(true);
		}
		expect(cam.dist).toBeGreaterThan(startDist * 2);
	});
});
