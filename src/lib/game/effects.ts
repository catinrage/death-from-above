import type { LightSystem } from '../engine/lights';
import { clamp } from '../engine/math';
import { PFlag, particleInit, type ParticleInit, type ParticleSystem } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape, type ShapeId } from '../engine/shaders/particles';
import type { CameraRig } from './camera';
import { ExplosionFx } from './explosions';
import { WaterFx } from './splashes';

interface Shockwave {
	x: number;
	y: number;
	z: number;
	age: number;
	life: number;
	radius: number;
	strength: number;
}

const DEFAULTS = particleInit();
const FIRE_LIGHT: [number, number, number] = [1.0, 0.55, 0.22];

/** Particle, light, shake and screen-space recipes for everything that goes bang. */
export class Effects {
	private readonly p: ParticleInit = particleInit();
	private readonly waves: Shockwave[] = [];
	readonly blasts: ExplosionFx = new ExplosionFx(this);
	readonly water: WaterFx = new WaterFx(this);
	flashLevel = 0;
	flashColor: [number, number, number] = [1, 0.85, 0.6];
	aberrationKick = 0;
	nightFactor = 0;

	constructor(
		readonly ps: ParticleSystem,
		readonly lights: LightSystem,
		private readonly camera: CameraRig,
		private readonly terrain: { heightAtXZ(x: number, z: number): number }
	) {}

	/** Resets the shared particle template; fill it in, then `ps.spawn` it. */
	make(shape: ShapeId, x: number, y: number, z: number, life: number): ParticleInit {
		const p = Object.assign(this.p, DEFAULTS);
		p.shape = shape;
		p.x = x;
		p.y = y;
		p.z = z;
		p.life = life;
		p.rot = rnd.range(0, 6.28);
		return p;
	}

	color(
		p: ParticleInit,
		r0: number,
		g0: number,
		b0: number,
		a0: number,
		r1: number,
		g1: number,
		b1: number,
		a1: number
	): void {
		p.r0 = r0;
		p.g0 = g0;
		p.b0 = b0;
		p.a0 = a0;
		p.r1 = r1;
		p.g1 = g1;
		p.b1 = b1;
		p.a1 = a1;
	}

	/** Shake attenuated by distance from what the camera is looking at. */
	shake(x: number, y: number, amount: number): void {
		const d = Math.hypot(x - this.camera.x, y - this.camera.y);
		this.camera.addTrauma(amount / (1 + d / 120));
	}

	addTrauma(amount: number): void {
		this.camera.addTrauma(amount);
	}

	flash(amount: number): void {
		this.flashLevel = Math.min(this.flashLevel + amount, 6);
	}

	shockwave(x: number, y: number, z: number, radius: number, strength: number, life = 0.6): void {
		if (this.waves.length >= 8) this.waves.shift();
		this.waves.push({ x, y, z, age: 0, life, radius, strength });
	}

	update(dt: number): void {
		this.blasts.update(dt);
		this.water.update(dt);
		this.flashLevel = Math.max(0, this.flashLevel - dt * this.flashLevel * 5 - dt * 0.2);
		this.aberrationKick = Math.max(0, this.aberrationKick - dt * 0.03);
		for (let i = this.waves.length - 1; i >= 0; i--) {
			this.waves[i].age += dt;
			if (this.waves[i].age >= this.waves[i].life) this.waves.splice(i, 1);
		}
	}

	/** Projects live shockwaves to screen space for the composite shader. */
	packWaves(out: Float32Array, cssW: number, cssH: number): number {
		let n = 0;
		for (const w of this.waves) {
			const c = this.camera.project(w.x, w.y, w.z, cssW, cssH);
			if (!c) continue;
			const t = w.age / w.life;
			const r = w.radius * (1 - (1 - t) * (1 - t) * (1 - t));
			const e = this.camera.project(w.x, w.y + r, w.z, cssW, cssH);
			if (!e) continue;
			const ruv = Math.abs(c[1] - e[1]) / cssH;
			out[n * 4] = c[0] / cssW;
			out[n * 4 + 1] = 1 - c[1] / cssH;
			out[n * 4 + 2] = Math.max(ruv, 0.002);
			out[n * 4 + 3] = w.strength * (1 - t) * 0.02;
			n++;
		}
		return n;
	}

	// ------------------------------------------------------------ explosions

	/** The full ground or air explosion. `size` 1 = a 250 kg bomb. */
	explosion(x: number, y: number, z: number, size: number, onGround: boolean): void {
		this.blasts.explosion(x, y, z, size, onGround);
	}

	dirtFountain(x: number, y: number, z: number, s: number): void {
		this.blasts.dirtFountain(x, y, z, s);
	}

	dustRing(x: number, y: number, z: number, s: number): void {
		this.blasts.dustRing(x, y, z, s);
	}

	megaBlast(x: number, y: number, z: number): void {
		this.blasts.megaBlast(x, y, z);
	}

	/** Flak airburst: black puff, orange flash, shrapnel. */
	airburst(x: number, y: number, z: number, size = 1): void {
		this.lights.add(x, y, z, FIRE_LIGHT, 26 * size, 32, { life: 0.28 });
		let p = this.make(Shape.Glow, x, y, z, 0.13);
		p.size0 = 9 * size;
		p.size1 = 4;
		this.color(p, 12, 6, 2.4, 1, 3, 1, 0.2, 0);
		this.ps.spawn(p);
		for (let i = 0; i < 5; i++) {
			p = this.make(Shape.Fire, x + rnd.gauss(0.8), y + rnd.gauss(0.8), z, rnd.range(0.12, 0.25));
			p.size0 = 2.2 * size;
			p.size1 = 3.8 * size;
			this.color(p, 8, 3.5, 1, 1, 1, 0.2, 0.05, 0);
			this.ps.spawn(p);
		}
		for (let i = 0; i < 8; i++) {
			p = this.make(
				Shape.Smoke,
				x + rnd.gauss(1.4),
				y + rnd.gauss(1.4),
				z + rnd.gauss(0.8),
				rnd.range(2.8, 4.8)
			);
			p.vx = rnd.gauss(3.5);
			p.vy = rnd.gauss(3.5);
			p.vz = rnd.gauss(1.5);
			p.size0 = 1.8 * size;
			p.size1 = rnd.range(5.5, 7.5) * size;
			this.color(p, 0.02, 0.019, 0.018, 0.95, 0.05, 0.048, 0.046, 0);
			p.drag = 2.4;
			p.gravity = -0.3;
			p.lit = 0.6;
			p.flags = PFlag.Wind;
			this.ps.spawn(p);
		}
		for (let i = 0; i < 16; i++) {
			const a = rnd.range(0, Math.PI * 2);
			const sp = rnd.range(30, 70);
			p = this.make(Shape.Spark, x, y, z, rnd.range(0.25, 0.6));
			p.vx = Math.cos(a) * sp;
			p.vy = Math.sin(a) * sp;
			p.vz = rnd.gauss(10);
			p.size0 = 0.12;
			p.size1 = 0.04;
			this.color(p, 12, 6, 2, 1, 4, 1, 0.1, 0);
			p.gravity = 12;
			p.stretch = 0.03;
			this.ps.spawn(p);
		}
		this.shake(x, y, 0.08 * size);
	}

	// ------------------------------------------------------------ small stuff

	muzzleFlash(
		x: number,
		y: number,
		z: number,
		dx: number,
		dy: number,
		size: number,
		color: [number, number, number]
	): void {
		let p = this.make(Shape.Glow, x, y, z, 0.05);
		p.size0 = size * 1.6;
		p.size1 = size;
		this.color(
			p,
			color[0],
			color[1],
			color[2],
			1,
			color[0] * 0.3,
			color[1] * 0.3,
			color[2] * 0.3,
			0
		);
		this.ps.spawn(p);
		p = this.make(Shape.Streak, x + dx * size * 0.8, y + dy * size * 0.8, z, 0.045);
		p.vx = dx * 60;
		p.vy = dy * 60;
		p.size0 = size * 0.5;
		p.size1 = size * 0.3;
		p.stretch = 0.03 * size;
		this.color(
			p,
			color[0] * 1.3,
			color[1] * 1.2,
			color[2],
			1,
			color[0],
			color[1] * 0.5,
			color[2] * 0.2,
			0
		);
		this.ps.spawn(p);
		this.lights.add(x, y, z, [1, 0.7, 0.35], 4 * size, 7 + size * 3, { life: 0.06 });
	}

	gunSmoke(x: number, y: number, z: number, size: number): void {
		const p = this.make(Shape.Smoke, x, y, z, rnd.range(0.6, 1.2));
		p.vx = rnd.gauss(1.5);
		p.vy = rnd.range(0.5, 2);
		p.size0 = size * 0.4;
		p.size1 = size * 1.6;
		this.color(p, 0.35, 0.34, 0.32, 0.35, 0.4, 0.4, 0.4, 0);
		p.drag = 2;
		p.lit = 1;
		this.ps.spawn(p);
	}

	impact(x: number, y: number, z: number, kind: 'ground' | 'metal' | 'soft', big = false): void {
		const k = big ? 2 : 1;
		if (kind === 'metal') {
			for (let i = 0; i < 5 * k; i++) {
				const p = this.make(Shape.Spark, x, y, z, rnd.range(0.15, 0.4));
				p.vx = rnd.gauss(16);
				p.vy = rnd.range(4, 22);
				p.vz = rnd.gauss(6);
				p.size0 = 0.1;
				p.size1 = 0.03;
				this.color(p, 14, 9, 4, 1, 4, 1.5, 0.3, 0);
				p.gravity = 25;
				p.stretch = 0.03;
				this.ps.spawn(p);
			}
			const g = this.make(Shape.Glow, x, y, z, 0.06);
			g.size0 = 1.2 * k;
			g.size1 = 0.5;
			this.color(g, 10, 7, 4, 1, 2, 1, 0.5, 0);
			this.ps.spawn(g);
		}
		const n = kind === 'metal' ? 1 : 2 * k;
		for (let i = 0; i < n; i++) {
			const p = this.make(Shape.Smoke, x + rnd.gauss(0.3), y + 0.3, z, rnd.range(0.7, 1.4) * k);
			p.vx = rnd.gauss(1.5);
			p.vy = rnd.range(2, 5);
			p.size0 = 0.4 * k;
			p.size1 = rnd.range(1.6, 2.4) * k;
			if (kind === 'metal') this.color(p, 0.12, 0.12, 0.12, 0.6, 0.2, 0.2, 0.2, 0);
			else this.color(p, 0.3, 0.24, 0.17, 0.7, 0.36, 0.3, 0.22, 0);
			p.drag = 2.2;
			p.lit = 1;
			this.ps.spawn(p);
		}
		if (kind === 'ground') {
			for (let i = 0; i < 4 * k; i++) {
				const p = this.make(Shape.Dirt, x, y + 0.2, z, rnd.range(0.5, 1));
				p.vx = rnd.gauss(4);
				p.vy = rnd.range(5, 12);
				p.vz = rnd.gauss(2);
				p.size0 = rnd.range(0.08, 0.18);
				p.size1 = p.size0;
				this.color(p, 0.1, 0.08, 0.06, 1, 0.1, 0.08, 0.06, 1);
				p.gravity = 25;
				p.flags = PFlag.DieOnGround;
				this.ps.spawn(p);
			}
		}
	}

	/** One puff of trailing smoke (missiles, damaged aircraft, wrecks). */
	trail(
		x: number,
		y: number,
		z: number,
		size: number,
		shade: number,
		alpha: number,
		life: number,
		rise = 1
	): void {
		const p = this.make(
			Shape.Smoke,
			x + rnd.gauss(0.15),
			y + rnd.gauss(0.15),
			z + rnd.gauss(0.15),
			life * rnd.range(0.8, 1.2)
		);
		p.vx = rnd.gauss(0.6);
		p.vy = rnd.range(0.3, 1.2) * rise;
		p.vz = rnd.gauss(0.4);
		p.size0 = size * 0.5;
		p.size1 = size * rnd.range(2.2, 3.2);
		this.color(p, shade, shade, shade * 0.97, alpha, shade * 1.4, shade * 1.4, shade * 1.4, 0);
		p.drag = 1.1;
		p.gravity = -0.8 * rise;
		p.lit = 1;
		p.fadeIn = 0.06;
		p.flags = PFlag.Wind;
		p.spin = rnd.range(-0.6, 0.6);
		this.ps.spawn(p);
	}

	/** A single licking flame for persistent fires. */
	flame(x: number, y: number, z: number, size: number, heat = 1): void {
		const p = this.make(
			Shape.Fire,
			x + rnd.gauss(size * 0.3),
			y,
			z + rnd.gauss(size * 0.25),
			rnd.range(0.45, 0.9)
		);
		p.vx = rnd.gauss(0.8);
		p.vy = rnd.range(3, 6) * (0.6 + size * 0.15);
		p.vz = rnd.gauss(0.3);
		p.size0 = size * rnd.range(0.6, 1);
		p.size1 = size * rnd.range(0.2, 0.5);
		const k = heat * rnd.range(0.8, 1.2);
		this.color(p, 6 * k, 2.4 * k, 0.6 * k, 1, 1.5, 0.25, 0.04, 0);
		p.drag = 1.2;
		p.gravity = -3;
		p.spin = rnd.range(-1.5, 1.5);
		p.flags = PFlag.Wind;
		this.ps.spawn(p);
	}

	/** Afterburner / exhaust flame jetting backwards. */
	exhaust(
		x: number,
		y: number,
		z: number,
		dx: number,
		dy: number,
		power: number,
		vx: number,
		vy: number
	): void {
		const p = this.make(Shape.Fire, x, y, z, rnd.range(0.05, 0.12));
		p.vx = vx - dx * 60 * power;
		p.vy = vy - dy * 60 * power;
		p.size0 = 0.9 + power * 0.5;
		p.size1 = 0.3;
		this.color(p, 4, 3, 5 * power, 1, 3, 0.8, 0.2, 0);
		this.ps.spawn(p);
	}

	/** Particle that lives exactly one frame — glows, tracers, lamps. */
	immediateGlow(
		x: number,
		y: number,
		z: number,
		size: number,
		r: number,
		g: number,
		b: number
	): void {
		const p = this.make(Shape.Glow, x, y, z, 1e-4);
		p.size0 = p.size1 = size;
		this.color(p, r, g, b, 1, r, g, b, 1);
		p.fadeIn = 0;
		this.ps.spawn(p);
	}

	immediateStreak(
		x: number,
		y: number,
		z: number,
		vx: number,
		vy: number,
		size: number,
		stretch: number,
		r: number,
		g: number,
		b: number
	): void {
		const p = this.make(Shape.Streak, x, y, z, 1e-4);
		p.vx = vx;
		p.vy = vy;
		p.size0 = p.size1 = size;
		p.stretch = stretch;
		this.color(p, r, g, b, 1, r, g, b, 1);
		p.fadeIn = 0;
		this.ps.spawn(p);
	}

	/** Burning debris chunk trail. */
	ember(x: number, y: number, z: number): void {
		const p = this.make(Shape.Fire, x, y, z, rnd.range(0.25, 0.5));
		p.size0 = rnd.range(0.6, 1.1);
		p.size1 = 0.2;
		this.color(p, 6, 2.3, 0.5, 1, 1, 0.2, 0.03, 0);
		p.gravity = -2;
		this.ps.spawn(p);
	}

	/** Napalm splash: a sheet of flame thrown along the direction of travel. */
	napalmSplash(x: number, y: number, z: number, dir: number, speed: number): void {
		this.lights.add(x, y + 3, z, FIRE_LIGHT, 70, 60, { life: 1.2 });
		for (let i = 0; i < 60; i++) {
			const p = this.make(
				Shape.Fire,
				x + rnd.gauss(2),
				y + rnd.range(0.5, 3),
				z + rnd.gauss(2),
				rnd.range(0.6, 1.4)
			);
			p.vx = dir * rnd.range(0.2, 1) * speed * 0.6 + rnd.gauss(5);
			p.vy = rnd.range(3, 14);
			p.vz = rnd.gauss(4);
			p.size0 = rnd.range(2, 3.5);
			p.size1 = rnd.range(5, 8);
			this.color(p, 8, 3.2, 0.8, 1, 1.2, 0.2, 0.03, 0);
			p.drag = 1.6;
			p.gravity = -2;
			p.spin = rnd.range(-2, 2);
			this.ps.spawn(p);
		}
		this.shake(x, y, 0.18);
	}

	/** Heavy smoke from the base of a fire. */
	fireSmoke(x: number, y: number, z: number, size: number): void {
		const p = this.make(
			Shape.Smoke,
			x + rnd.gauss(size * 0.3),
			y + size * 0.8,
			z + rnd.gauss(size * 0.2),
			rnd.range(5, 9)
		);
		p.vx = rnd.gauss(0.8);
		p.vy = rnd.range(3, 6);
		p.size0 = size * 0.7;
		p.size1 = size * rnd.range(3.5, 5);
		const g = rnd.range(0.025, 0.05);
		this.color(p, g, g * 0.95, g * 0.9, 0.85, g * 2.8, g * 2.7, g * 2.6, 0);
		p.drag = 0.9;
		p.gravity = -1.6;
		p.lit = 1;
		p.fadeIn = 0.4;
		p.flags = PFlag.Wind;
		p.spin = rnd.range(-0.3, 0.3);
		this.ps.spawn(p);
	}

	/** EMP: a crackling blue shell, lightning arcs to the ground and a cold flash. */
	empBurst(x: number, y: number, radius: number): void {
		this.lights.add(x, y, 0, [0.5, 0.8, 1.6], 260, radius * 1.5, { life: 0.5 });
		this.flash(0.5);
		for (let i = 0; i < 70; i++) {
			const a = rnd.range(0, Math.PI * 2);
			const sp = rnd.range(0.7, 1) * radius * 2.2;
			const p = this.make(Shape.Streak, x, y, 0, rnd.range(0.25, 0.45));
			p.vx = Math.cos(a) * sp;
			p.vy = Math.sin(a) * sp;
			p.size0 = rnd.range(0.4, 0.9);
			p.size1 = 0.2;
			p.stretch = 0.035;
			this.color(p, 3, 7, 14, 1, 1, 2, 6, 0);
			this.ps.spawn(p);
		}
		const ring = this.make(Shape.Ring, x, y, 0, 0.7);
		ring.size0 = 4;
		ring.size1 = radius * 2.2;
		this.color(ring, 2, 5, 12, 1, 0.5, 1.5, 4, 0);
		this.ps.spawn(ring);
		for (let k = 0; k < 6; k++) {
			// Arcs: short-lived bright streaks hopping down to the ground.
			const gx = x + rnd.range(-radius, radius);
			const gy = this.ground(gx);
			for (let s = 0; s < 6; s++) {
				const t = s / 5;
				const p = this.make(Shape.Glow, x + (gx - x) * t + rnd.gauss(3), y + (gy - y) * t, 0, 0.18);
				p.size0 = p.size1 = rnd.range(1.2, 2.2);
				this.color(p, 6, 10, 18, 1, 2, 4, 9, 0);
				this.ps.spawn(p);
			}
		}
	}

	/** The nuke's first instant: a white sun, a sky-wide flash and a fast shock shell. */
	nukeFlash(x: number, y: number, z: number): void {
		this.lights.add(x, y, z, [1.6, 1.4, 1.1], 900, 900, { life: 2.5 });
		this.flash(6);
		this.flashColor = [1, 0.95, 0.85];
		this.aberrationKick = Math.max(this.aberrationKick, 0.04);
		this.addTrauma(1);
		this.shockwave(x, y, z, 420, 4, 1.4);
		this.shockwave(x, y, z, 260, 3, 0.9);
		const core = this.make(Shape.Glow, x, y, z, 1.6);
		core.size0 = 60;
		core.size1 = 140;
		this.color(core, 60, 52, 40, 1, 8, 3, 1, 0);
		core.fadeIn = 0;
		this.ps.spawn(core);
		const ring = this.make(Shape.Ring, x, this.ground(x) + 2, z, 2.2);
		ring.size0 = 20;
		ring.size1 = 520;
		this.color(ring, 3, 2.6, 2.2, 0.9, 0.6, 0.5, 0.4, 0);
		this.ps.spawn(ring);
	}

	/** Distance-scaled ground height helper for effect code. */
	ground(x: number, z = 0): number {
		return this.terrain.heightAtXZ(x, z);
	}

	/** Drops lingering screen effects and shrapnel (new game). */
	clear(): void {
		this.waves.length = 0;
		this.flashLevel = 0;
		this.aberrationKick = 0;
		this.blasts.clear();
		this.water.clear();
	}

	/** Screen flash + aberration current values for the post stack. */
	postFlash(): number {
		return clamp(this.flashLevel, 0, 6);
	}
}
