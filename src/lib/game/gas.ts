import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import { killUnit } from './deaths';
import type { World } from './world';

export interface GasCloud {
	x: number;
	y: number;
	z: number;
	radius: number;
	age: number;
	life: number;
	puff: number;
}

/** Infantry choke fast; crews inside vehicles last longer. */
const DPS_INFANTRY = 26;
const DPS_VEHICLE = 4;

/** Drifting toxic clouds from chemical canisters. */
export class GasClouds {
	readonly list: GasCloud[] = [];

	release(x: number, y: number, z: number, radius: number, life: number): void {
		this.list.push({ x, y, z, radius, age: 0, life, puff: 0 });
	}

	/** Strength 0..1: swells in, then thins out as it disperses. */
	density(c: GasCloud): number {
		return Math.min(1, c.age / 1.2) * Math.min(1, (c.life - c.age) / 4);
	}

	update(w: World, dt: number): void {
		for (let i = this.list.length - 1; i >= 0; i--) {
			const c = this.list[i];
			c.age += dt;
			if (c.age >= c.life) {
				this.list.splice(i, 1);
				continue;
			}
			c.x += w.particles.windX * 0.35 * dt;
			c.radius += dt * 0.5;
			c.y = w.surface.heightAtXZ(c.x, c.z);
			const k = this.density(c);
			for (const u of w.units) {
				if (!u.alive || Math.abs(u.x - c.x) > c.radius) continue;
				const dps =
					u.def.category === 'infantry'
						? DPS_INFANTRY
						: u.def.isStatic
							? DPS_VEHICLE * 0.5
							: DPS_VEHICLE;
				u.hp -= dps * k * dt;
				if (u.def.category === 'infantry') u.panic = Math.max(u.panic, 1.5);
				if (u.hp <= 0) killUnit(w, u, c.x, 'fire', 'player');
			}
			for (const t of w.troops.list) {
				if (t.alive && Math.abs(t.x - c.x) < c.radius) t.hp -= DPS_INFANTRY * 0.5 * k * dt;
			}
			c.puff -= dt;
			if (c.puff <= 0) {
				c.puff = 0.05;
				this.emit(w, c, k);
			}
		}
	}

	private emit(w: World, c: GasCloud, k: number): void {
		const fx = w.fx;
		const p = fx.make(
			Shape.Smoke,
			c.x + rnd.gauss(c.radius * 0.45),
			c.y + rnd.range(0.5, 3),
			c.z + rnd.gauss(c.radius * 0.35),
			rnd.range(3, 5)
		);
		p.vx = rnd.gauss(0.8);
		p.vy = rnd.range(0.1, 0.9);
		p.vz = rnd.gauss(0.5);
		p.size0 = rnd.range(3, 5);
		p.size1 = rnd.range(8, 13);
		const a = 0.35 * k;
		fx.color(p, 0.32, 0.42, 0.1, a, 0.42, 0.5, 0.16, 0);
		p.drag = 0.8;
		p.gravity = -0.15;
		p.lit = 1;
		p.fadeIn = 0.5;
		p.flags = PFlag.Wind;
		p.spin = rnd.range(-0.3, 0.3);
		fx.ps.spawn(p);
	}

	clear(): void {
		this.list.length = 0;
	}
}
