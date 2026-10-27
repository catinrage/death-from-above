import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import type { Effects } from './effects';

export const MAX_RIPPLES = 16;

interface Ripple {
	x: number;
	z: number;
	age: number;
	strength: number;
}

/** Spray, water columns and the expanding rings the water shader draws. */
export class WaterFx {
	private readonly ripples: Ripple[] = [];

	constructor(private readonly fx: Effects) {}

	ripple(x: number, z: number, strength: number): void {
		if (this.ripples.length >= MAX_RIPPLES) {
			// Replace the faintest ring.
			let k = 0;
			for (let i = 1; i < this.ripples.length; i++)
				if (
					this.ripples[i].strength / (1 + this.ripples[i].age) <
					this.ripples[k].strength / (1 + this.ripples[k].age)
				)
					k = i;
			this.ripples.splice(k, 1);
		}
		this.ripples.push({ x, z, age: 0, strength });
	}

	/** Something falls into the water: a crown of spray and a ring. */
	splash(x: number, level: number, z: number, size: number): void {
		const fx = this.fx;
		const s = Math.max(0.2, size);
		const n = Math.round(10 + 26 * s);
		for (let i = 0; i < n; i++) {
			const a = rnd.range(0, Math.PI * 2);
			const out = rnd.range(1.5, 5) * Math.sqrt(s);
			const p = fx.make(
				Shape.Spark,
				x + Math.cos(a) * 0.6 * s,
				level + 0.2,
				z + Math.sin(a) * 0.6 * s,
				rnd.range(0.6, 1.3)
			);
			p.vx = Math.cos(a) * out;
			p.vz = Math.sin(a) * out * 0.6;
			p.vy = rnd.range(4, 11) * Math.sqrt(s);
			p.size0 = rnd.range(0.12, 0.3) * (0.7 + s * 0.4);
			p.size1 = p.size0 * 0.6;
			fx.color(p, 1.4, 1.5, 1.55, 0.9, 1.1, 1.2, 1.25, 0);
			p.gravity = 16;
			p.stretch = 0.05;
			p.lit = 1;
			p.flags = PFlag.DieOnGround;
			fx.ps.spawn(p);
		}
		this.mist(x, level, z, s * 1.5, Math.round(3 + 5 * s));
		this.ripple(x, z, Math.min(2.5, 0.5 + s));
	}

	/** Bullet or fragment strike: a thin spout. */
	spout(x: number, level: number, z: number): void {
		const fx = this.fx;
		for (let i = 0; i < 5; i++) {
			const p = fx.make(
				Shape.Spark,
				x + rnd.gauss(0.2),
				level,
				z + rnd.gauss(0.2),
				rnd.range(0.4, 0.7)
			);
			p.vx = rnd.gauss(0.8);
			p.vy = rnd.range(5, 10);
			p.vz = rnd.gauss(0.5);
			p.size0 = rnd.range(0.08, 0.16);
			p.size1 = 0.05;
			fx.color(p, 1.3, 1.4, 1.45, 0.85, 1, 1.1, 1.15, 0);
			p.gravity = 18;
			p.stretch = 0.06;
			p.lit = 1;
			p.flags = PFlag.DieOnGround;
			fx.ps.spawn(p);
		}
		this.ripple(x, z, 0.25);
	}

	/** An explosion at the surface: a towering white column that rains back down. */
	column(x: number, level: number, z: number, size: number): void {
		const fx = this.fx;
		const q = Math.sqrt(Math.max(size, 0.2));
		const n = Math.round(60 + 90 * q);
		for (let i = 0; i < n; i++) {
			const core = rnd.chance(0.6);
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(1.2 * q),
				level + rnd.range(0, 1),
				z + rnd.gauss(1 * q),
				rnd.range(1.6, 3.2) * q
			);
			p.vx = rnd.gauss(core ? 2 : 6) * q;
			p.vz = rnd.gauss(core ? 1.5 : 4) * q;
			p.vy = (core ? rnd.range(18, 34) : rnd.range(6, 16)) * q;
			p.size0 = rnd.range(1.2, 2.4) * q;
			p.size1 = p.size0 * rnd.range(2, 3.5);
			const b = rnd.range(1.3, 1.7);
			fx.color(p, b, b * 1.04, b * 1.08, 0.85, b * 0.9, b * 0.95, b, 0);
			p.gravity = 14;
			p.drag = 0.45;
			p.lit = 1;
			p.fadeIn = 0.03;
			p.spin = rnd.range(-1, 1);
			p.flags = PFlag.DieOnGround;
			fx.ps.spawn(p);
		}
		// Falling curtain of droplets.
		for (let i = 0; i < 50 * q; i++) {
			const a = rnd.range(0, Math.PI * 2);
			const p = fx.make(Shape.Spark, x, level + rnd.range(2, 6) * q, z, rnd.range(1.4, 2.6) * q);
			const out = rnd.range(4, 13) * q;
			p.vx = Math.cos(a) * out;
			p.vz = Math.sin(a) * out * 0.5;
			p.vy = rnd.range(10, 26) * q;
			p.size0 = rnd.range(0.15, 0.35);
			p.size1 = 0.1;
			fx.color(p, 1.4, 1.5, 1.55, 0.95, 1.1, 1.2, 1.25, 0.2);
			p.gravity = 16;
			p.stretch = 0.05;
			p.lit = 1;
			p.flags = PFlag.DieOnGround;
			fx.ps.spawn(p);
		}
		this.mist(x, level, z, 5 * q, Math.round(10 + 10 * q));
		this.ripple(x, z, Math.min(4, 1.5 + 1.5 * q));
		this.ripple(x, z, Math.min(3, 1 + q));
		fx.shake(x, level, 0.25 * q);
	}

	private mist(x: number, level: number, z: number, size: number, n: number): void {
		const fx = this.fx;
		for (let i = 0; i < n; i++) {
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(size * 0.4),
				level + rnd.range(0, size * 0.4),
				z + rnd.gauss(size * 0.3),
				rnd.range(2, 4)
			);
			p.vx = rnd.gauss(1.5);
			p.vy = rnd.range(0.5, 2.5);
			p.vz = rnd.gauss(1);
			p.size0 = size * 0.4;
			p.size1 = size * rnd.range(1.5, 2.4);
			fx.color(p, 1.1, 1.15, 1.2, 0.35, 1.2, 1.25, 1.3, 0);
			p.drag = 1.2;
			p.lit = 1;
			p.fadeIn = 0.1;
			p.flags = PFlag.Wind;
			fx.ps.spawn(p);
		}
	}

	update(dt: number): void {
		for (let i = this.ripples.length - 1; i >= 0; i--) {
			const r = this.ripples[i];
			r.age += dt;
			if (r.age > 6) this.ripples.splice(i, 1);
		}
	}

	/** Packs rings as (x, z, age, strength) for the water shader. Returns the count. */
	pack(out: Float32Array): number {
		const n = Math.min(this.ripples.length, MAX_RIPPLES);
		for (let i = 0; i < n; i++) {
			const r = this.ripples[i];
			out.set([r.x, r.z, r.age, r.strength], i * 4);
		}
		return n;
	}

	clear(): void {
		this.ripples.length = 0;
	}
}
