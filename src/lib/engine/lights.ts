import { MAX_LIGHTS } from './shaders/common';

export class PointLight {
	active = false;
	x = 0;
	y = 0;
	z = 0;
	r = 1;
	g = 1;
	b = 1;
	intensity = 1;
	radius = 10;
	age = 0;
	/** Seconds; Infinity keeps the light until released. */
	life = 1;
	flicker = 0;
	seed = 0;
	current = 0;
	score = 0;

	release(): void {
		this.active = false;
	}
}

export interface LightOptions {
	life?: number;
	flicker?: number;
}

/**
 * Pool of dynamic point lights. Transient lights fade quadratically over
 * their life; the most relevant MAX_LIGHTS are packed for the shaders.
 */
export class LightSystem {
	private readonly pool: PointLight[] = [];
	private time = 0;
	private readonly ranked: PointLight[] = [];
	readonly packedPos = new Float32Array(MAX_LIGHTS * 4);
	readonly packedCol = new Float32Array(MAX_LIGHTS * 4);
	packedCount = 0;

	constructor(capacity = 192) {
		for (let i = 0; i < capacity; i++) this.pool.push(new PointLight());
	}

	add(
		x: number,
		y: number,
		z: number,
		color: readonly [number, number, number],
		intensity: number,
		radius: number,
		opts: LightOptions = {}
	): PointLight {
		let l = this.pool.find((p) => !p.active);
		if (!l) {
			// Steal the weakest transient light; persistent ones are owned by fires and lamps.
			let weakest: PointLight | null = null;
			for (const p of this.pool) {
				if (p.life !== Infinity && (!weakest || p.current < weakest.current)) weakest = p;
			}
			// Pool full of persistent lights: hand back a detached light that is never drawn.
			l = weakest ?? new PointLight();
		}
		l.active = true;
		l.x = x;
		l.y = y;
		l.z = z;
		l.r = color[0];
		l.g = color[1];
		l.b = color[2];
		l.intensity = intensity;
		l.radius = radius;
		l.age = 0;
		l.life = opts.life ?? 0.4;
		l.flicker = opts.flicker ?? 0;
		l.seed = Math.random() * 100;
		l.current = intensity;
		return l;
	}

	update(dt: number): void {
		this.time += dt;
		for (const l of this.pool) {
			if (!l.active) continue;
			l.age += dt;
			let k = 1;
			if (l.life !== Infinity) {
				if (l.age >= l.life) {
					l.active = false;
					continue;
				}
				const t = 1 - l.age / l.life;
				k = t * t;
			}
			if (l.flicker > 0) {
				const f =
					Math.sin(this.time * 17.3 + l.seed) * 0.5 +
					Math.sin(this.time * 31.7 + l.seed * 2.1) * 0.3 +
					Math.sin(this.time * 7.1 + l.seed * 0.7) * 0.2;
				k *= 1 + f * l.flicker;
			}
			l.current = l.intensity * Math.max(k, 0);
		}
	}

	/** Packs the most important lights near (cx, cy) into the uniform arrays. */
	pack(cx: number, cy: number, viewRadius: number): number {
		const ranked = this.ranked;
		ranked.length = 0;
		for (const l of this.pool) {
			if (!l.active || l.current <= 0.001) continue;
			const dx = l.x - cx,
				dy = l.y - cy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist - l.radius > viewRadius) continue;
			l.score = (l.current * l.radius) / (1 + Math.max(0, dist - viewRadius * 0.5) * 0.02);
			ranked.push(l);
		}
		ranked.sort((a, b) => b.score - a.score);
		const n = Math.min(ranked.length, MAX_LIGHTS);
		for (let i = 0; i < n; i++) {
			const l = ranked[i];
			const o = i * 4;
			this.packedPos[o] = l.x;
			this.packedPos[o + 1] = l.y;
			this.packedPos[o + 2] = l.z;
			this.packedPos[o + 3] = l.radius;
			this.packedCol[o] = l.r * l.current;
			this.packedCol[o + 1] = l.g * l.current;
			this.packedCol[o + 2] = l.b * l.current;
			this.packedCol[o + 3] = 0;
		}
		this.packedCount = n;
		return n;
	}

	clear(): void {
		for (const l of this.pool) l.active = false;
	}
}
