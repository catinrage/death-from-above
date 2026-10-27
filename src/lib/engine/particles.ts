import type { Mat4 } from './math';
import type { ShapeId } from './shaders/particles';

export const PARTICLE_INSTANCE_FLOATS = 16;

export const PFlag = {
	None: 0,
	/** Collides with the ground and bounces. */
	Bounce: 1,
	/** Drifts with the global wind. */
	Wind: 2,
	/** Removed on first ground contact. */
	DieOnGround: 4
} as const;

/** Everything needed to start one particle. Reuse a single object when spawning in bulk. */
export interface ParticleInit {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	life: number;
	size0: number;
	size1: number;
	/** Start colour (HDR) and alpha. */
	r0: number;
	g0: number;
	b0: number;
	a0: number;
	/** End colour and alpha. */
	r1: number;
	g1: number;
	b1: number;
	a1: number;
	drag: number;
	/** Downward acceleration (negative rises). */
	gravity: number;
	rot: number;
	spin: number;
	shape: ShapeId;
	/** Seconds over which alpha fades in. */
	fadeIn: number;
	/** >0 stretches the quad along velocity. */
	stretch: number;
	/** 0 = emissive, 1 = lit by sun and point lights. */
	lit: number;
	flags: number;
}

export function particleInit(): ParticleInit {
	return {
		x: 0,
		y: 0,
		z: 0,
		vx: 0,
		vy: 0,
		vz: 0,
		life: 1,
		size0: 1,
		size1: 1,
		r0: 1,
		g0: 1,
		b0: 1,
		a0: 1,
		r1: 1,
		g1: 1,
		b1: 1,
		a1: 0,
		drag: 0,
		gravity: 0,
		rot: 0,
		spin: 0,
		shape: 0,
		fadeIn: 0.02,
		stretch: 0,
		lit: 0,
		flags: 0
	};
}

export type GroundFn = (x: number, z: number) => number;

/** CPU-simulated particle pool stored as structure-of-arrays. */
export class ParticleSystem {
	count = 0;
	windX = 2;
	readonly capacity: number;
	private readonly pos: Float32Array;
	private readonly vel: Float32Array;
	private readonly age: Float32Array;
	private readonly life: Float32Array;
	private readonly size: Float32Array; // size0, size1
	private readonly c0: Float32Array;
	private readonly c1: Float32Array;
	private readonly misc: Float32Array; // drag, gravity, rot, spin, fadeIn, stretch, lit, seed
	private readonly shape: Uint8Array;
	private readonly flags: Uint8Array;
	private readonly depth: Float32Array;
	private readonly order: Uint32Array;
	private readonly sorted: Uint32Array;
	private readonly buckets = new Uint32Array(1025);
	readonly instances: Float32Array;

	constructor(capacity = 16000) {
		this.capacity = capacity;
		this.pos = new Float32Array(capacity * 3);
		this.vel = new Float32Array(capacity * 3);
		this.age = new Float32Array(capacity);
		this.life = new Float32Array(capacity);
		this.size = new Float32Array(capacity * 2);
		this.c0 = new Float32Array(capacity * 4);
		this.c1 = new Float32Array(capacity * 4);
		this.misc = new Float32Array(capacity * 8);
		this.shape = new Uint8Array(capacity);
		this.flags = new Uint8Array(capacity);
		this.depth = new Float32Array(capacity);
		this.order = new Uint32Array(capacity);
		this.sorted = new Uint32Array(capacity);
		this.instances = new Float32Array(capacity * PARTICLE_INSTANCE_FLOATS);
	}

	spawn(p: Readonly<ParticleInit>): void {
		let i = this.count;
		if (i >= this.capacity) {
			// Pool full: overwrite a random old particle rather than dropping new effects.
			i = Math.floor(Math.random() * this.capacity);
		} else {
			this.count++;
		}
		const i3 = i * 3,
			i4 = i * 4,
			i8 = i * 8;
		this.pos[i3] = p.x;
		this.pos[i3 + 1] = p.y;
		this.pos[i3 + 2] = p.z;
		this.vel[i3] = p.vx;
		this.vel[i3 + 1] = p.vy;
		this.vel[i3 + 2] = p.vz;
		this.age[i] = 0;
		this.life[i] = Math.max(p.life, 0.001);
		this.size[i * 2] = p.size0;
		this.size[i * 2 + 1] = p.size1;
		this.c0[i4] = p.r0;
		this.c0[i4 + 1] = p.g0;
		this.c0[i4 + 2] = p.b0;
		this.c0[i4 + 3] = p.a0;
		this.c1[i4] = p.r1;
		this.c1[i4 + 1] = p.g1;
		this.c1[i4 + 2] = p.b1;
		this.c1[i4 + 3] = p.a1;
		this.misc[i8] = p.drag;
		this.misc[i8 + 1] = p.gravity;
		this.misc[i8 + 2] = p.rot;
		this.misc[i8 + 3] = p.spin;
		this.misc[i8 + 4] = Math.max(p.fadeIn, 0);
		this.misc[i8 + 5] = p.stretch;
		this.misc[i8 + 6] = p.lit;
		this.misc[i8 + 7] = Math.random();
		this.shape[i] = p.shape;
		this.flags[i] = p.flags;
	}

	update(dt: number, ground: GroundFn): void {
		let i = 0;
		while (i < this.count) {
			this.age[i] += dt;
			if (this.age[i] >= this.life[i]) {
				this.kill(i);
				continue;
			}
			const i3 = i * 3,
				i8 = i * 8;
			const drag = Math.exp(-this.misc[i8] * dt);
			const fl = this.flags[i];
			let vx = this.vel[i3] * drag;
			let vy = this.vel[i3 + 1] * drag - this.misc[i8 + 1] * dt;
			const vz = this.vel[i3 + 2] * drag;
			let x = this.pos[i3] + vx * dt;
			let y = this.pos[i3 + 1] + vy * dt;
			const z = this.pos[i3 + 2] + vz * dt;
			if (fl & PFlag.Wind) x += this.windX * dt;
			if (fl & (PFlag.Bounce | PFlag.DieOnGround)) {
				const g = ground(x, z);
				if (y < g) {
					if (fl & PFlag.DieOnGround) {
						this.kill(i);
						continue;
					}
					y = g;
					vy = -vy * 0.35;
					vx *= 0.55;
				}
			}
			this.pos[i3] = x;
			this.pos[i3 + 1] = y;
			this.pos[i3 + 2] = z;
			this.vel[i3] = vx;
			this.vel[i3 + 1] = vy;
			this.vel[i3 + 2] = vz;
			this.misc[i8 + 2] += this.misc[i8 + 3] * dt;
			i++;
		}
	}

	private kill(i: number): void {
		const last = --this.count;
		if (i === last) return;
		this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
		this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
		this.age[i] = this.age[last];
		this.life[i] = this.life[last];
		this.size.copyWithin(i * 2, last * 2, last * 2 + 2);
		this.c0.copyWithin(i * 4, last * 4, last * 4 + 4);
		this.c1.copyWithin(i * 4, last * 4, last * 4 + 4);
		this.misc.copyWithin(i * 8, last * 8, last * 8 + 8);
		this.shape[i] = this.shape[last];
		this.flags[i] = this.flags[last];
	}

	clear(): void {
		this.count = 0;
	}

	/** Drops everything spawned after `count` (one-frame particles once they've been drawn). */
	truncate(count: number): void {
		if (count < this.count) this.count = Math.max(0, count);
	}

	/** Fills `instances` back-to-front for the given view matrix. Returns the instance count. */
	build(view: Mat4): number {
		const n = this.count;
		if (n === 0) return 0;
		let dmin = Infinity,
			dmax = -Infinity;
		for (let i = 0; i < n; i++) {
			const i3 = i * 3;
			const d =
				view[2] * this.pos[i3] +
				view[6] * this.pos[i3 + 1] +
				view[10] * this.pos[i3 + 2] +
				view[14];
			this.depth[i] = d;
			if (d < dmin) dmin = d;
			if (d > dmax) dmax = d;
		}
		// Counting sort into 1024 depth buckets: farthest (most negative z) first.
		const buckets = this.buckets;
		buckets.fill(0);
		const scale = dmax > dmin ? 1023 / (dmax - dmin) : 0;
		for (let i = 0; i < n; i++) {
			const b = ((this.depth[i] - dmin) * scale) | 0;
			this.order[i] = b;
			buckets[b + 1]++;
		}
		for (let b = 1; b < 1025; b++) buckets[b] += buckets[b - 1];
		for (let i = 0; i < n; i++) this.sorted[buckets[this.order[i]]++] = i;

		const out = this.instances;
		for (let k = 0; k < n; k++) {
			const i = this.sorted[k];
			const i3 = i * 3,
				i4 = i * 4,
				i8 = i * 8;
			const t = this.age[i] / this.life[i];
			const grow = 1 - (1 - t) * (1 - t);
			// fadeIn 0 means fully visible at birth (one-frame glows, tracers).
			const fadeIn = this.misc[i8 + 4];
			const fade = fadeIn > 0 ? Math.min(1, this.age[i] / fadeIn) : 1;
			const o = k * PARTICLE_INSTANCE_FLOATS;
			out[o] = this.pos[i3];
			out[o + 1] = this.pos[i3 + 1];
			out[o + 2] = this.pos[i3 + 2];
			out[o + 3] = this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * grow;
			out[o + 4] = this.c0[i4] + (this.c1[i4] - this.c0[i4]) * t;
			out[o + 5] = this.c0[i4 + 1] + (this.c1[i4 + 1] - this.c0[i4 + 1]) * t;
			out[o + 6] = this.c0[i4 + 2] + (this.c1[i4 + 2] - this.c0[i4 + 2]) * t;
			out[o + 7] = (this.c0[i4 + 3] + (this.c1[i4 + 3] - this.c0[i4 + 3]) * t) * fade;
			out[o + 8] = this.misc[i8 + 2];
			out[o + 9] = this.shape[i];
			out[o + 10] = this.misc[i8 + 7];
			out[o + 11] = this.misc[i8 + 5];
			out[o + 12] = this.vel[i3];
			out[o + 13] = this.vel[i3 + 1];
			out[o + 14] = this.vel[i3 + 2];
			out[o + 15] = this.misc[i8 + 6];
		}
		return n;
	}
}
