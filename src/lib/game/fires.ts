import type { LightSystem, PointLight } from '../engine/lights';
import { fx as rnd } from '../engine/rng';
import type { Effects } from './effects';
import type { Terrain } from './terrain';
import type { FireHandle } from './types';

export interface FireSource extends FireHandle {
	/** Half-width of the burning area. */
	radius: number;
	/** Damage per second to anything standing in it. */
	dps: number;
	smoke: boolean;
	light: PointLight | null;
	emit: number;
	scorch: number;
}

export interface FireOptions {
	radius?: number;
	dps?: number;
	smoke?: boolean;
	light?: boolean;
}

/** Long-lived fires: burning wrecks, napalm pools, base damage. */
export class FireSystem {
	readonly list: FireSource[] = [];

	constructor(
		private readonly fx: Effects,
		private readonly lights: LightSystem,
		private readonly terrain: Terrain
	) {}

	add(
		x: number,
		y: number,
		z: number,
		intensity: number,
		life: number,
		o: FireOptions = {}
	): FireSource {
		const f: FireSource = {
			x,
			y,
			z,
			intensity,
			life,
			age: 0,
			dead: false,
			radius: o.radius ?? 1.5,
			dps: o.dps ?? 0,
			smoke: o.smoke ?? true,
			light: null,
			emit: 0,
			scorch: 0
		};
		if (o.light !== false) {
			f.light = this.lights.add(x, y + 2, z, [1, 0.5, 0.18], 9 * intensity, 14 + 10 * intensity, {
				life: Infinity,
				flicker: 0.55
			});
		}
		this.list.push(f);
		return f;
	}

	update(dt: number): void {
		for (let i = this.list.length - 1; i >= 0; i--) {
			const f = this.list[i];
			f.age += dt;
			const t = f.age / f.life;
			if (t >= 1 || f.dead) {
				f.dead = true;
				f.light?.release();
				this.list.splice(i, 1);
				continue;
			}
			const strength = f.intensity * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3) * Math.min(1, f.age * 4);
			if (f.light) {
				f.light.x = f.x;
				f.light.y = f.y + 1.5 + f.radius * 0.3;
				f.light.z = f.z + 1;
				f.light.intensity = 9 * strength * (0.7 + f.radius * 0.15);
			}
			f.emit += dt * (6 + 10 * f.radius) * strength;
			while (f.emit > 1) {
				f.emit -= 1;
				const ox = rnd.range(-f.radius, f.radius);
				const gx = f.x + ox;
				const gy = f.radius > 2 ? this.terrain.heightAtXZ(gx, f.z) : f.y;
				this.fx.flame(
					gx,
					gy + 0.2,
					f.z + rnd.gauss(f.radius * 0.2),
					1 + strength * 0.9,
					0.8 + strength * 0.25
				);
				if (f.smoke && rnd.chance(0.22)) this.fx.fireSmoke(gx, gy + 1, f.z, 1.2 + strength * 0.6);
			}
			if (f.radius > 2) {
				f.scorch += dt;
				if (f.scorch > 0.5) {
					f.scorch = 0;
					this.terrain.burn(f.x + rnd.range(-f.radius, f.radius), f.z, 3.2, 0.5, 0.25);
				}
			}
		}
	}

	clear(): void {
		for (const f of this.list) f.light?.release();
		this.list.length = 0;
	}
}
