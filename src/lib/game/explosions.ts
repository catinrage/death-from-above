import { TAU } from '../engine/math';
import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import type { Effects } from './effects';

/** A burning piece of shrapnel that arcs away from a blast trailing smoke. */
interface Fragment {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	age: number;
	life: number;
	trail: number;
	size: number;
}

const FLASH_LIGHT: [number, number, number] = [1.0, 0.58, 0.26];
const FIRE_LIGHT: [number, number, number] = [1.0, 0.42, 0.12];
const MAX_FRAGMENTS = 48;
const TRAIL_INTERVAL = 0.04;

/**
 * Bomb-scale explosions. `size` 1 is a 250 kg bomb: a ~30 m flash, a fireball
 * that rolls up into a lit smoke plume, a dirt fountain, a ground-hugging dust
 * surge and burning shrapnel that streaks smoke across the sky.
 */
export class ExplosionFx {
	private readonly fragments: Fragment[] = [];
	/** Recent blast energy; blasts landing together share brightness so carpets keep detail. */
	private energy = 0;
	/** Brightness multiplier for the blast being built. */
	private k = 1;

	constructor(private readonly fx: Effects) {}

	explosion(x: number, y: number, z: number, size: number, onGround: boolean): void {
		const s = size;
		const q = Math.sqrt(size);
		this.k = (1 - 0.3 * this.fx.nightFactor) / Math.sqrt(1 + this.energy);
		this.energy += s;
		this.flash(x, y, z, s, q);
		this.fireball(x, y, z, s, q, onGround);
		this.smokePlume(x, y, z, s, q);
		this.sparks(x, y, z, s, q, onGround);
		this.shrapnel(x, y, z, s, q, onGround);
		if (onGround) {
			this.dirtFountain(x, y, z, s);
			this.geysers(x, y, z, s, q);
			this.dustRing(x, y, z, s);
			this.groundEmbers(x, y, z, s, q);
		}
		const fx = this.fx;
		fx.shockwave(x, y, z, 48 * q, 1.8 * q, 0.55 + 0.2 * q);
		fx.shake(x, y, 0.6 * s);
		if (s >= 0.9) fx.flash(0.07 * s);
		fx.aberrationKick = Math.min(0.01, fx.aberrationKick + 0.002 * s);
	}

	private flash(x: number, y: number, z: number, s: number, q: number): void {
		const fx = this.fx;
		const k = this.k;
		fx.lights.add(x, y + 4 * q, z, FLASH_LIGHT, 130 * s * k, 70 * q + 25, { life: 0.55 + 0.3 * q });
		fx.lights.add(x, y + 3, z, FIRE_LIGHT, 20 * s * k, 45 * q + 10, {
			life: 3.4 * q,
			flicker: 0.45
		});
		let p = fx.make(Shape.Glow, x, y + 2 * q, z, 0.24);
		p.size0 = 34 * q;
		p.size1 = 12 * q;
		fx.color(p, 8 * k, 5.2 * k, 3 * k, 1, 2, 0.7, 0.15, 0);
		fx.ps.spawn(p);
		p = fx.make(Shape.Glow, x, y + 1.5 * q, z, 0.1);
		p.size0 = 12 * q;
		p.size1 = 5 * q;
		fx.color(p, 12 * k, 10 * k, 7 * k, 1, 4, 2.5, 1, 0);
		fx.ps.spawn(p);
	}

	private fireball(x: number, y: number, z: number, s: number, q: number, onGround: boolean): void {
		const fx = this.fx;
		const n = Math.round((16 + 22 * s) * Math.max(0.5, this.k));
		for (let i = 0; i < n; i++) {
			const a = rnd.range(0, TAU);
			const up = onGround ? rnd.range(0.1, 1) : rnd.range(-1, 1);
			const sp = rnd.range(8, 22) * q;
			const p = fx.make(
				Shape.Fire,
				x + rnd.gauss(2 * q),
				y + rnd.range(1, 3) * q,
				z + rnd.gauss(1.5 * q),
				rnd.range(0.8, 1.5) * q
			);
			p.vx = Math.cos(a) * sp * (1 - Math.abs(up) * 0.5);
			p.vy = up * sp * 1.2 + 4 * q;
			p.vz = Math.sin(a) * sp * 0.45;
			p.size0 = rnd.range(3.5, 6) * q;
			p.size1 = rnd.range(9, 15) * q;
			const k = rnd.range(0.65, 1.3) * this.k;
			fx.color(p, 4.2 * k, 1.75 * k, 0.48 * k, 1, 0.45, 0.08, 0.02, 0);
			p.drag = 2.6;
			p.gravity = -9;
			p.spin = rnd.range(-1.5, 1.5);
			fx.ps.spawn(p);
		}
		// A rolling cap that lifts off the blast and darkens into smoke.
		for (let i = 0; i < Math.round(4 + 5 * s); i++) {
			const p = fx.make(
				Shape.Fire,
				x + rnd.gauss(1.5 * q),
				y + 3 * q,
				z + rnd.gauss(q),
				rnd.range(1.2, 1.9) * q
			);
			p.vx = rnd.gauss(3) * q;
			p.vy = rnd.range(13, 24) * q;
			p.vz = rnd.gauss(1);
			p.size0 = 6 * q;
			p.size1 = rnd.range(12, 17) * q;
			fx.color(p, 4.2 * this.k, 1.8 * this.k, 0.5 * this.k, 1, 0.35, 0.07, 0.02, 0);
			p.drag = 1.7;
			p.gravity = -5;
			p.spin = rnd.range(-1, 1);
			fx.ps.spawn(p);
		}
		for (let i = 0; i < 4; i++) {
			const p = fx.make(Shape.Fire, x + rnd.gauss(q), y + 1.5 * q, z, 0.22);
			p.size0 = 9 * q;
			p.size1 = 15 * q;
			fx.color(p, 9 * this.k, 6.5 * this.k, 3.5 * this.k, 1, 2.5, 1, 0.25, 0);
			fx.ps.spawn(p);
		}
	}

	private smokePlume(x: number, y: number, z: number, s: number, q: number): void {
		const fx = this.fx;
		const n = Math.round(10 + 14 * s);
		for (let i = 0; i < n; i++) {
			const h = rnd.next();
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(3 * q),
				y + (2 + h * 7) * q,
				z + rnd.gauss(2 * q),
				rnd.range(6, 11) * q
			);
			p.vx = rnd.gauss(3) * q;
			p.vy = rnd.range(3, 20) * q * (0.6 + h * 0.6);
			p.vz = rnd.gauss(1.5);
			p.size0 = rnd.range(4, 7) * q;
			p.size1 = rnd.range(13, 21) * q;
			const g = rnd.range(0.07, 0.13);
			fx.color(p, g * 1.15, g, g * 0.88, 0.62, g * 2.1, g * 2.05, g * 2, 0);
			p.drag = 0.9;
			p.gravity = -1.5;
			p.lit = 1;
			p.fadeIn = rnd.range(0.25, 0.7);
			p.flags = PFlag.Wind;
			p.spin = rnd.range(-0.4, 0.4);
			fx.ps.spawn(p);
		}
		// A slow, dark column that hangs over the impact long after the flash.
		for (let i = 0; i < Math.round(3 + 5 * s); i++) {
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(1.5 * q),
				y + rnd.range(4, 16) * q,
				z + rnd.gauss(q),
				rnd.range(9, 15) * q
			);
			p.vx = rnd.gauss(1);
			p.vy = rnd.range(2.5, 5.5) * q;
			p.size0 = 7 * q;
			p.size1 = rnd.range(15, 22) * q;
			const g = rnd.range(0.05, 0.08);
			fx.color(p, g, g * 0.95, g * 0.9, 0.55, g * 2.4, g * 2.3, g * 2.2, 0);
			p.drag = 0.8;
			p.gravity = -1.2;
			p.lit = 1;
			p.fadeIn = rnd.range(0.8, 1.6);
			p.flags = PFlag.Wind;
			p.spin = rnd.range(-0.25, 0.25);
			fx.ps.spawn(p);
		}
	}

	private sparks(x: number, y: number, z: number, s: number, q: number, onGround: boolean): void {
		const fx = this.fx;
		const n = Math.round((24 + 30 * s) * Math.max(0.45, this.k));
		for (let i = 0; i < n; i++) {
			const a = onGround ? rnd.range(0.12, Math.PI - 0.12) : rnd.range(-Math.PI, Math.PI);
			const sp = rnd.range(25, 70) * q;
			const p = fx.make(Shape.Spark, x, y + 1, z, rnd.range(0.5, 1.4));
			p.vx = Math.cos(a) * sp;
			p.vy = Math.sin(a) * sp;
			p.vz = rnd.gauss(10);
			p.size0 = rnd.range(0.14, 0.26);
			p.size1 = 0.05;
			fx.color(p, 9 * this.k, 4.2 * this.k, 1.2 * this.k, 1, 3, 0.6, 0.06, 0);
			p.drag = 0.7;
			p.gravity = 22;
			p.stretch = 0.045;
			p.flags = PFlag.Bounce;
			fx.ps.spawn(p);
		}
	}

	private shrapnel(x: number, y: number, z: number, s: number, q: number, onGround: boolean): void {
		const n = s >= 0.8 ? Math.round(2 + 4 * s) : rnd.chance(s) ? 1 : 0;
		for (let i = 0; i < n && this.fragments.length < MAX_FRAGMENTS; i++) {
			const a = onGround ? rnd.range(0.35, Math.PI - 0.35) : rnd.range(0, TAU);
			const sp = rnd.range(20, 38) * q;
			this.fragments.push({
				x,
				y: y + 2,
				z,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp,
				vz: rnd.gauss(6),
				age: 0,
				life: rnd.range(1.3, 2.6),
				trail: 0,
				size: rnd.range(0.7, 1.2) * Math.min(q, 1.4)
			});
		}
	}

	/** Brown earth thrown up by a ground burst. */
	dirtFountain(x: number, y: number, z: number, s: number): void {
		const fx = this.fx;
		const q = Math.sqrt(s);
		const n = Math.round(26 + 40 * s);
		for (let i = 0; i < n; i++) {
			const p = fx.make(
				Shape.Dirt,
				x + rnd.gauss(2 * q),
				y + 0.5,
				z + rnd.gauss(1.4 * q),
				rnd.range(1.6, 3.2)
			);
			const spread = rnd.gauss(0.5);
			const sp = rnd.range(16, 42) * q;
			p.vx = Math.sin(spread) * sp;
			p.vy = Math.cos(spread) * sp;
			p.vz = rnd.gauss(5);
			p.size0 = rnd.range(0.35, 0.9) * (0.8 + 0.25 * q);
			p.size1 = p.size0 * 0.85;
			const g = rnd.range(0.05, 0.1);
			fx.color(p, g * 1.2, g, g * 0.75, 1, g * 1.2, g, g * 0.75, 1);
			p.gravity = 22;
			p.drag = 0.35;
			p.flags = PFlag.DieOnGround;
			fx.ps.spawn(p);
		}
	}

	/** Columns of dust that shoot straight up and hang before collapsing. */
	private geysers(x: number, y: number, z: number, s: number, q: number): void {
		const fx = this.fx;
		for (let i = 0; i < Math.round(4 + 5 * s); i++) {
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(1.5 * q),
				y + 1,
				z + rnd.gauss(q),
				rnd.range(2.6, 4.2) * q
			);
			p.vx = rnd.gauss(4) * q;
			p.vy = rnd.range(22, 42) * q;
			p.vz = rnd.gauss(2);
			p.size0 = 1.8 * q;
			p.size1 = rnd.range(6, 9) * q;
			fx.color(p, 0.22, 0.16, 0.1, 0.88, 0.3, 0.25, 0.19, 0);
			p.drag = 2.3;
			p.gravity = 5;
			p.lit = 1;
			fx.ps.spawn(p);
		}
	}

	/** Base surge: a ring of dust racing out along the ground. */
	dustRing(x: number, y: number, z: number, s: number): void {
		const fx = this.fx;
		const q = Math.sqrt(s);
		const n = Math.round(14 + 14 * s);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * TAU + rnd.range(0, 0.3);
			const sp = rnd.range(20, 36) * q;
			const p = fx.make(Shape.Smoke, x, y + 1, z, rnd.range(3, 5.5) * q);
			p.vx = Math.cos(a) * sp;
			p.vz = Math.sin(a) * sp * 0.35;
			p.vy = rnd.range(0.5, 3);
			p.size0 = 3 * q;
			p.size1 = rnd.range(10, 17) * q;
			fx.color(p, 0.3, 0.24, 0.17, 0.66, 0.37, 0.31, 0.24, 0);
			p.drag = 2.4;
			p.gravity = -0.35;
			p.lit = 1;
			p.flags = PFlag.Wind;
			fx.ps.spawn(p);
		}
	}

	private groundEmbers(x: number, y: number, z: number, s: number, q: number): void {
		const fx = this.fx;
		for (let i = 0; i < Math.round(6 + 8 * s); i++) {
			const p = fx.make(
				Shape.Fire,
				x + rnd.gauss(4 * q),
				y + 0.3,
				z + rnd.gauss(2.5 * q),
				rnd.range(1.5, 4.5)
			);
			p.size0 = rnd.range(0.5, 1.1);
			p.size1 = 0.1;
			fx.color(p, 5, 1.6, 0.35, 1, 1.5, 0.2, 0.02, 0);
			p.gravity = -1.5;
			fx.ps.spawn(p);
		}
	}

	/** Thermobaric super-bomb: oversized blast, mushroom cloud, dust wall, white flash. */
	megaBlast(x: number, y: number, z: number): void {
		const fx = this.fx;
		this.explosion(x, y, z, 3.4, true);
		fx.lights.add(x, y + 30, z, [1, 0.7, 0.4], 300, 340, { life: 2.8 });
		fx.flash(1.4);
		fx.aberrationKick = 0.012;
		fx.shockwave(x, y, z, 300, 4.5, 1.5);
		fx.shockwave(x, y + 20, z, 140, 2.2, 0.9);
		this.mushroom(x, y, z);
		for (let i = 0; i < 56; i++) {
			const a = (i / 56) * TAU;
			const p = fx.make(Shape.Smoke, x, y + 2, z, rnd.range(5.5, 9));
			p.vx = Math.cos(a) * rnd.range(60, 90);
			p.vz = Math.sin(a) * 20;
			p.vy = rnd.range(1, 6);
			p.size0 = 7;
			p.size1 = rnd.range(22, 32);
			fx.color(p, 0.32, 0.26, 0.19, 0.72, 0.4, 0.34, 0.27, 0);
			p.drag = 1.4;
			p.lit = 1;
			p.flags = PFlag.Wind;
			fx.ps.spawn(p);
		}
		fx.addTrauma(1);
	}

	private mushroom(x: number, y: number, z: number): void {
		const fx = this.fx;
		for (let i = 0; i < 80; i++) {
			const a = rnd.range(0, TAU);
			const r = rnd.range(0, 12);
			const p = fx.make(
				Shape.Fire,
				x + Math.cos(a) * r,
				y + rnd.range(2, 16),
				z + Math.sin(a) * r * 0.5,
				rnd.range(1.8, 3.4)
			);
			p.vx = rnd.gauss(7);
			p.vy = rnd.range(20, 52);
			p.vz = rnd.gauss(3);
			p.size0 = rnd.range(9, 14);
			p.size1 = rnd.range(18, 28);
			fx.color(p, 5, 2.2, 0.7, 1, 0.8, 0.15, 0.03, 0);
			p.drag = 1.1;
			p.gravity = -2;
			fx.ps.spawn(p);
		}
		for (let i = 0; i < 110; i++) {
			const t = rnd.next();
			const cap = t > 0.7;
			const p = fx.make(
				Shape.Smoke,
				x + rnd.gauss(7),
				y + t * 85,
				z + rnd.gauss(3.5),
				rnd.range(10, 18)
			);
			p.vx = rnd.gauss(cap ? 12 : 3);
			p.vy = rnd.range(16, 30) * (0.5 + t);
			p.vz = rnd.gauss(cap ? 5 : 1);
			p.size0 = rnd.range(10, 16);
			p.size1 = rnd.range(cap ? 38 : 20, cap ? 56 : 30);
			const g = rnd.range(0.06, 0.1);
			fx.color(p, g * 1.3, g, g * 0.8, 0.95, g * 3, g * 2.8, g * 2.6, 0);
			p.drag = 0.7;
			p.gravity = -0.6;
			p.lit = 1;
			p.fadeIn = rnd.range(0.4, 1.2);
			p.flags = PFlag.Wind;
			p.spin = rnd.range(-0.3, 0.3);
			fx.ps.spawn(p);
		}
	}

	/** Flies the burning shrapnel; each piece leaves a smoke trail and a glowing head. */
	update(dt: number): void {
		const fx = this.fx;
		this.energy *= Math.exp(-2.5 * dt);
		for (let i = this.fragments.length - 1; i >= 0; i--) {
			const f = this.fragments[i];
			f.age += dt;
			const drag = Math.exp(-0.35 * dt);
			f.vx *= drag;
			f.vz *= drag;
			f.vy = f.vy * drag - 20 * dt;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			f.z += f.vz * dt;
			const k = Math.max(0, 1 - f.age / f.life);
			f.trail += dt;
			while (f.trail > TRAIL_INTERVAL) {
				f.trail -= TRAIL_INTERVAL;
				fx.trail(
					f.x,
					f.y,
					f.z,
					0.9 * f.size,
					0.06 + 0.12 * (1 - k),
					0.1 + 0.7 * k,
					rnd.range(1.4, 2.4),
					0.4
				);
				if (rnd.chance(0.5)) fx.ember(f.x, f.y, f.z);
			}
			fx.immediateGlow(f.x, f.y, f.z, 0.4 + 1.4 * f.size * k, 1 + 9 * k, 0.4 + 4 * k, 1.2 * k);
			const g = fx.ground(f.x, f.z);
			if (f.y < g || f.age >= f.life) {
				if (f.y < g + 1) fx.impact(f.x, g, f.z, 'ground');
				this.fragments.splice(i, 1);
			}
		}
	}

	get activeFragments(): number {
		return this.fragments.length;
	}

	clear(): void {
		this.fragments.length = 0;
		this.energy = 0;
	}
}
