import { describe, expect, it } from 'vitest';
import { mat4 } from '../engine/math';
import { DebrisSystem } from './debris';
import { testWorld } from './test-world';

describe('DebrisSystem', () => {
	it('drops a tumbling box that comes to rest on the ground', () => {
		const w = testWorld();
		const sys = new DebrisSystem();
		const x = 1400;
		const d = sys.spawn({
			x,
			y: w.ground(x) + 12,
			z: 0,
			vx: 3,
			vy: 2,
			vz: 0,
			half: [1, 0.5, 0.8],
			parts: [{ mesh: 'chunk0', local: mat4.create() }],
			life: 100,
			spin: 4
		});
		for (let i = 0; i < 60 * 12 && !d.sleeping; i++) sys.update(1 / 60, w.surface, w.fx);
		expect(d.sleeping).toBe(true);
		const clearance = d.y - w.terrain.heightAtXZ(d.x, d.z);
		expect(clearance).toBeGreaterThan(0.3);
		expect(clearance).toBeLessThan(1.6);
	});

	it('wakes and throws resting pieces when a blast goes off nearby', () => {
		const w = testWorld();
		const sys = new DebrisSystem();
		const d = sys.spawn({
			x: 1400,
			y: w.ground(1400) + 0.6,
			z: 0,
			vx: 0,
			vy: 0,
			vz: 0,
			half: [0.5, 0.5, 0.5],
			parts: [],
			spin: 0
		});
		d.sleeping = true;
		sys.impulse(1398, w.ground(1398), 0, 10, 20);
		expect(d.sleeping).toBe(false);
		expect(d.vy).toBeGreaterThan(0);
		expect(d.vx).toBeGreaterThan(0);
	});

	it('retires old pieces once over capacity', () => {
		const sys = new DebrisSystem();
		sys.max = 5;
		for (let i = 0; i < 9; i++)
			sys.spawn({ x: 0, y: 50, z: 0, vx: 0, vy: 0, vz: 0, half: [0.5, 0.5, 0.5], parts: [] });
		expect(sys.list.length).toBe(5);
	});
});
