import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import type { Effects } from './effects';
import type { Flare } from './projectiles';

/** Seconds a flare spends dying down at the end of its burn. */
const BURNOUT = 0.5;

/** 0..1 burn intensity: full while burning, guttering out at the end. */
export function flareHeat(f: Flare): number {
	return Math.max(0, Math.min(1, (f.life - f.age) / BURNOUT));
}

/**
 * Simulation-side flare effects, on the fixed step: a dense white smoke streak
 * laid along the flight path (several puffs per step so it reads as one
 * continuous ribbon) and a spray of magnesium sparks.
 */
export function flareEmit(
	fx: Effects,
	f: Flare,
	px: number,
	py: number,
	pz: number,
	dt: number
): void {
	const heat = flareHeat(f);
	if (heat <= 0) return;
	const steps = 2;
	for (let i = 0; i < steps; i++) {
		const t = (i + 1) / steps;
		const x = px + (f.x - px) * t,
			y = py + (f.y - py) * t,
			z = pz + (f.z - pz) * t;
		const p = fx.make(
			Shape.Smoke,
			x + rnd.gauss(0.08),
			y + rnd.gauss(0.08),
			z,
			rnd.range(3.5, 5.5)
		);
		p.vx = rnd.gauss(0.25);
		p.vy = rnd.range(0.1, 0.5);
		p.vz = rnd.gauss(0.2);
		p.size0 = 0.45 + f.age * 0.06;
		p.size1 = rnd.range(2.6, 3.8);
		const sh = rnd.range(0.5, 0.62);
		fx.color(p, sh, sh, sh * 0.98, 0.55 * heat, sh * 1.1, sh * 1.1, sh * 1.08, 0);
		p.drag = 1.8;
		p.gravity = -0.25;
		p.lit = 1;
		p.fadeIn = 0.02;
		p.flags = PFlag.Wind;
		p.spin = rnd.range(-0.4, 0.4);
		fx.ps.spawn(p);
	}
	// Burning pellets shed fizzing sparks that arc away and wink out.
	const sparks = rnd.chance(dt * 40 * heat) ? 2 : 0;
	for (let i = 0; i < sparks; i++) {
		const s = fx.make(Shape.Spark, f.x, f.y, f.z, rnd.range(0.12, 0.35));
		const a = rnd.range(0, Math.PI * 2);
		const sp = rnd.range(4, 12);
		s.vx = f.vx * 0.6 + Math.cos(a) * sp;
		s.vy = f.vy * 0.6 + Math.sin(a) * sp;
		s.vz = rnd.gauss(3);
		s.size0 = rnd.range(0.08, 0.16);
		s.size1 = 0.03;
		fx.color(s, 30, 24, 14, 1, 12, 5, 1.5, 0);
		s.gravity = 9;
		s.stretch = 0.03;
		fx.ps.spawn(s);
	}
}

/** Render-side glow: a sputtering white-hot core inside a warm halo. */
export function flareGlow(fx: Effects, f: Flare): void {
	const heat = flareHeat(f);
	if (heat <= 0) return;
	// Magnesium burns unevenly: the core flickers frame to frame.
	const sputter = rnd.range(0.75, 1.25) * heat;
	fx.immediateGlow(f.x, f.y, f.z, 0.55 * sputter + 0.25, 40 * sputter, 36 * sputter, 30 * sputter);
	fx.immediateGlow(f.x, f.y, f.z, 1.9 * heat, 2.6 * heat, 1.8 * heat, 1 * heat);
}
