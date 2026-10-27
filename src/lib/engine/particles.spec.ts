import { describe, expect, it } from 'vitest';
import { mat4 } from './math';
import { PARTICLE_INSTANCE_FLOATS, PFlag, ParticleSystem, particleInit } from './particles';

const flat = (): number => 0;

describe('ParticleSystem', () => {
	it('expires particles after their lifetime', () => {
		const ps = new ParticleSystem(16);
		ps.spawn({ ...particleInit(), life: 0.5 });
		ps.spawn({ ...particleInit(), life: 2 });
		ps.update(1, flat);
		expect(ps.count).toBe(1);
	});

	it('never grows beyond capacity', () => {
		const ps = new ParticleSystem(8);
		for (let i = 0; i < 50; i++) ps.spawn({ ...particleInit(), life: 10 });
		expect(ps.count).toBe(8);
	});

	it('applies gravity and bounces off the ground', () => {
		const ps = new ParticleSystem(4);
		ps.spawn({ ...particleInit(), y: 1, vy: -20, life: 5, gravity: 10, flags: PFlag.Bounce });
		for (let i = 0; i < 30; i++) ps.update(1 / 60, flat);
		const view = mat4.create();
		ps.build(view);
		expect(ps.instances[1]).toBeGreaterThanOrEqual(0);
	});

	it('removes particles flagged to die on ground contact', () => {
		const ps = new ParticleSystem(4);
		ps.spawn({ ...particleInit(), y: 0.5, vy: -10, life: 5, flags: PFlag.DieOnGround });
		ps.update(0.2, flat);
		expect(ps.count).toBe(0);
	});

	it('sorts instances back to front for blending', () => {
		const ps = new ParticleSystem(8);
		for (const z of [-5, -50, -20]) ps.spawn({ ...particleInit(), z, life: 1 });
		const view = mat4.create();
		const n = ps.build(view);
		const zs = Array.from({ length: n }, (_, i) => ps.instances[i * PARTICLE_INSTANCE_FLOATS + 2]);
		expect(zs).toEqual([-50, -20, -5]);
	});
});

describe('one-frame particles', () => {
	it('are fully visible on the frame they are spawned', () => {
		const ps = new ParticleSystem(4);
		ps.spawn({ ...particleInit(), life: 1e-4, fadeIn: 0, a0: 1, a1: 1 });
		ps.build(mat4.create());
		expect(ps.instances[7]).toBeCloseTo(1);
	});

	it('can be trimmed after drawing without touching older particles', () => {
		const ps = new ParticleSystem(8);
		ps.spawn({ ...particleInit(), life: 5 });
		const mark = ps.count;
		ps.spawn({ ...particleInit(), life: 1e-4, fadeIn: 0 });
		ps.truncate(mark);
		expect(ps.count).toBe(1);
	});
});
