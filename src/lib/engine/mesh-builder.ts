import { mat4, type Mat4 } from './math';

export interface Material {
	r: number;
	g: number;
	b: number;
	rough: number;
	metal: number;
	emit: number;
}

const toLinear = (c: number): number => Math.pow(c / 255, 2.2);

/** Material from an sRGB hex colour. Colours are linearised for the HDR pipeline. */
export function mat(hex: number, rough = 0.75, metal = 0, emit = 0): Material {
	return {
		r: toLinear((hex >> 16) & 255),
		g: toLinear((hex >> 8) & 255),
		b: toLinear(hex & 255),
		rough,
		metal,
		emit
	};
}

export type P2 = readonly [number, number];
type P3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';

export interface LatheOptions {
	axis?: Axis;
	smooth?: boolean;
	/** Rotates the seam, useful for faceted shapes. */
	phase?: number;
	caps?: boolean;
}

/**
 * Accumulates non-indexed triangles with a transform stack. Flat faces get
 * their normal from the winding (the shader flips back faces, so winding does
 * not matter for them); smooth primitives emit analytic normals and are wound
 * counter-clockwise from outside.
 */
export class MeshBuilder {
	private readonly data: number[] = [];
	private readonly m: Mat4 = mat4.create();
	private readonly stack: Mat4[] = [];
	private readonly k = new Float64Array(9);
	private det = 1;
	private dirty = true;

	push(): this {
		this.stack.push(new Float32Array(this.m));
		return this;
	}

	pop(): this {
		const m = this.stack.pop();
		if (m) {
			this.m.set(m);
			this.dirty = true;
		}
		return this;
	}

	translate(x: number, y: number, z: number): this {
		mat4.translate(this.m, this.m, x, y, z);
		return this;
	}

	rotateX(r: number): this {
		mat4.rotateX(this.m, this.m, r);
		this.dirty = true;
		return this;
	}

	rotateY(r: number): this {
		mat4.rotateY(this.m, this.m, r);
		this.dirty = true;
		return this;
	}

	rotateZ(r: number): this {
		mat4.rotateZ(this.m, this.m, r);
		this.dirty = true;
		return this;
	}

	scale(x: number, y: number, z: number): this {
		mat4.scale(this.m, this.m, x, y, z);
		this.dirty = true;
		return this;
	}

	get vertexCount(): number {
		return this.data.length / 12;
	}

	build(): Float32Array {
		return new Float32Array(this.data);
	}

	/** Appends another builder's output (already in its own space) under the current transform. */
	append(other: MeshBuilder): this {
		const src = other.data;
		for (let i = 0; i < src.length; i += 36) {
			const tri: P3[] = [];
			const nrm: P3[] = [];
			for (let v = 0; v < 3; v++) {
				const o = i + v * 12;
				tri.push([src[o], src[o + 1], src[o + 2]]);
				nrm.push([src[o + 3], src[o + 4], src[o + 5]]);
			}
			const m: Material = {
				r: src[i + 6],
				g: src[i + 7],
				b: src[i + 8],
				rough: src[i + 9],
				metal: src[i + 10],
				emit: src[i + 11]
			};
			this.smoothTri(tri[0], tri[1], tri[2], nrm[0], nrm[1], nrm[2], m);
		}
		return this;
	}

	// ------------------------------------------------------------ low level

	private updateCofactors(): void {
		if (!this.dirty) return;
		const m = this.m;
		const c0x = m[0],
			c0y = m[1],
			c0z = m[2];
		const c1x = m[4],
			c1y = m[5],
			c1z = m[6];
		const c2x = m[8],
			c2y = m[9],
			c2z = m[10];
		const k = this.k;
		k[0] = c1y * c2z - c1z * c2y;
		k[1] = c1z * c2x - c1x * c2z;
		k[2] = c1x * c2y - c1y * c2x;
		k[3] = c2y * c0z - c2z * c0y;
		k[4] = c2z * c0x - c2x * c0z;
		k[5] = c2x * c0y - c2y * c0x;
		k[6] = c0y * c1z - c0z * c1y;
		k[7] = c0z * c1x - c0x * c1z;
		k[8] = c0x * c1y - c0y * c1x;
		this.det = c0x * k[0] + c0y * k[1] + c0z * k[2];
		this.dirty = false;
	}

	private xform(p: Readonly<P3>): P3 {
		const m = this.m;
		const [x, y, z] = p;
		return [
			m[0] * x + m[4] * y + m[8] * z + m[12],
			m[1] * x + m[5] * y + m[9] * z + m[13],
			m[2] * x + m[6] * y + m[10] * z + m[14]
		];
	}

	private xformNormal(n: Readonly<P3>): P3 {
		this.updateCofactors();
		const k = this.k;
		const s = this.det < 0 ? -1 : 1;
		const x = (k[0] * n[0] + k[3] * n[1] + k[6] * n[2]) * s;
		const y = (k[1] * n[0] + k[4] * n[1] + k[7] * n[2]) * s;
		const z = (k[2] * n[0] + k[5] * n[1] + k[8] * n[2]) * s;
		const l = Math.hypot(x, y, z) || 1;
		return [x / l, y / l, z / l];
	}

	private emit(p: P3, n: P3, m: Material): void {
		this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], m.r, m.g, m.b, m.rough, m.metal, m.emit);
	}

	/** Flat-shaded triangle in local space. */
	tri(a: Readonly<P3>, b: Readonly<P3>, c: Readonly<P3>, m: Material): this {
		const pa = this.xform(a),
			pb = this.xform(b),
			pc = this.xform(c);
		const ux = pb[0] - pa[0],
			uy = pb[1] - pa[1],
			uz = pb[2] - pa[2];
		const vx = pc[0] - pa[0],
			vy = pc[1] - pa[1],
			vz = pc[2] - pa[2];
		let nx = uy * vz - uz * vy,
			ny = uz * vx - ux * vz,
			nz = ux * vy - uy * vx;
		const l = Math.hypot(nx, ny, nz);
		if (l < 1e-12) return this;
		nx /= l;
		ny /= l;
		nz /= l;
		const n: P3 = [nx, ny, nz];
		this.emit(pa, n, m);
		this.emit(pb, n, m);
		this.emit(pc, n, m);
		return this;
	}

	/** Smooth triangle with explicit local normals; keeps CCW winding under mirroring. */
	smoothTri(
		a: Readonly<P3>,
		b: Readonly<P3>,
		c: Readonly<P3>,
		na: Readonly<P3>,
		nb: Readonly<P3>,
		nc: Readonly<P3>,
		m: Material
	): this {
		this.updateCofactors();
		const pa = this.xform(a),
			pb = this.xform(b),
			pc = this.xform(c);
		const ta = this.xformNormal(na),
			tb = this.xformNormal(nb),
			tc = this.xformNormal(nc);
		if (this.det < 0) {
			this.emit(pa, ta, m);
			this.emit(pc, tc, m);
			this.emit(pb, tb, m);
		} else {
			this.emit(pa, ta, m);
			this.emit(pb, tb, m);
			this.emit(pc, tc, m);
		}
		return this;
	}

	quad(a: Readonly<P3>, b: Readonly<P3>, c: Readonly<P3>, d: Readonly<P3>, m: Material): this {
		this.tri(a, b, c, m);
		return this.tri(a, c, d, m);
	}

	// ------------------------------------------------------------ primitives

	/** Axis-aligned box centred on (x, y, z). */
	box(w: number, h: number, d: number, m: Material, x = 0, y = 0, z = 0): this {
		const x0 = x - w / 2,
			x1 = x + w / 2,
			y0 = y - h / 2,
			y1 = y + h / 2,
			z0 = z - d / 2,
			z1 = z + d / 2;
		return this.hexahedron(
			[
				[x0, y0, z0],
				[x1, y0, z0],
				[x1, y0, z1],
				[x0, y0, z1],
				[x0, y1, z0],
				[x1, y1, z0],
				[x1, y1, z1],
				[x0, y1, z1]
			],
			m
		);
	}

	/**
	 * Tapered block: bottom rectangle (bw × bd) at y = 0, top rectangle (tw × td)
	 * at y = h shifted by (sx, sz). Great for hulls, turrets and roofs.
	 */
	taper(
		bw: number,
		bd: number,
		tw: number,
		td: number,
		h: number,
		m: Material,
		sx = 0,
		sz = 0
	): this {
		return this.hexahedron(
			[
				[-bw / 2, 0, -bd / 2],
				[bw / 2, 0, -bd / 2],
				[bw / 2, 0, bd / 2],
				[-bw / 2, 0, bd / 2],
				[sx - tw / 2, h, sz - td / 2],
				[sx + tw / 2, h, sz - td / 2],
				[sx + tw / 2, h, sz + td / 2],
				[sx - tw / 2, h, sz + td / 2]
			],
			m
		);
	}

	/** Six-faced solid from 8 corners: bottom 0-3, top 4-7, same order. */
	hexahedron(c: Readonly<P3>[], m: Material): this {
		this.quad(c[0], c[1], c[2], c[3], m);
		this.quad(c[4], c[7], c[6], c[5], m);
		this.quad(c[0], c[4], c[5], c[1], m);
		this.quad(c[1], c[5], c[6], c[2], m);
		this.quad(c[2], c[6], c[7], c[3], m);
		this.quad(c[3], c[7], c[4], c[0], m);
		return this;
	}

	/** Extrudes a 2D polygon given in the XY plane along Z, centred on z = 0. */
	extrude(points: readonly P2[], depth: number, m: Material, bevel = 0): this {
		const z0 = -depth / 2,
			z1 = depth / 2;
		const n = points.length;
		const inset = bevel > 0 ? insetPolygon(points, bevel) : points;
		for (let i = 0; i < n; i++) {
			const a = points[i],
				b = points[(i + 1) % n];
			if (bevel > 0) {
				const ia = inset[i],
					ib = inset[(i + 1) % n];
				this.quad(
					[a[0], a[1], z0 + bevel],
					[b[0], b[1], z0 + bevel],
					[b[0], b[1], z1 - bevel],
					[a[0], a[1], z1 - bevel],
					m
				);
				this.quad(
					[a[0], a[1], z1 - bevel],
					[b[0], b[1], z1 - bevel],
					[ib[0], ib[1], z1],
					[ia[0], ia[1], z1],
					m
				);
				this.quad(
					[a[0], a[1], z0 + bevel],
					[ia[0], ia[1], z0],
					[ib[0], ib[1], z0],
					[b[0], b[1], z0 + bevel],
					m
				);
			} else {
				this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], m);
			}
		}
		const tris = triangulate(inset);
		for (let i = 0; i < tris.length; i += 3) {
			const a = inset[tris[i]],
				b = inset[tris[i + 1]],
				c = inset[tris[i + 2]];
			this.tri([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], m);
			this.tri([a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0], m);
		}
		return this;
	}

	/** Polygon in the XZ plane (x, z pairs) extruded along Y — wings, fins, slabs. */
	slab(points: readonly P2[], thickness: number, m: Material): this {
		this.push().rotateX(Math.PI / 2);
		this.extrude(points, thickness, m);
		return this.pop();
	}

	/**
	 * Surface of revolution. `profile` holds (radius, t) pairs with t increasing
	 * along the axis. Closed ends get flat caps when `caps` is set.
	 */
	lathe(profile: readonly P2[], segments: number, m: Material, opts: LatheOptions = {}): this {
		const axis = opts.axis ?? 'y';
		const smooth = opts.smooth ?? true;
		const phase = opts.phase ?? 0;
		const frame = (r: number, t: number, th: number): P3 => {
			const c = Math.cos(th) * r,
				s = Math.sin(th) * r;
			if (axis === 'y') return [c, t, -s];
			if (axis === 'x') return [t, c, s];
			return [c, s, t];
		};
		const radial = (th: number, nr: number, nt: number): P3 => {
			const c = Math.cos(th) * nr,
				s = Math.sin(th) * nr;
			if (axis === 'y') return [c, nt, -s];
			if (axis === 'x') return [nt, c, s];
			return [c, s, nt];
		};
		// Profile normals in the (radial, axial) half-plane, averaged at joints.
		const pn: P2[] = profile.map((_, i) => {
			const a = profile[Math.max(0, i - 1)],
				b = profile[Math.min(profile.length - 1, i + 1)];
			const dr = b[0] - a[0],
				dt = b[1] - a[1];
			const l = Math.hypot(dr, dt) || 1;
			return [dt / l, -dr / l];
		});
		for (let i = 0; i < profile.length - 1; i++) {
			const [r0, t0] = profile[i];
			const [r1, t1] = profile[i + 1];
			if (r0 < 1e-6 && r1 < 1e-6) continue;
			const segN: P2 = (() => {
				const dr = r1 - r0,
					dt = t1 - t0;
				const l = Math.hypot(dr, dt) || 1;
				return [dt / l, -dr / l];
			})();
			for (let j = 0; j < segments; j++) {
				const a0 = phase + (j / segments) * Math.PI * 2;
				const a1 = phase + ((j + 1) / segments) * Math.PI * 2;
				const p00 = frame(r0, t0, a0),
					p01 = frame(r0, t0, a1);
				const p10 = frame(r1, t1, a0),
					p11 = frame(r1, t1, a1);
				if (smooth) {
					const n0 = pn[i],
						n1 = pn[i + 1];
					const n00 = radial(a0, n0[0], n0[1]),
						n01 = radial(a1, n0[0], n0[1]);
					const n10 = radial(a0, n1[0], n1[1]),
						n11 = radial(a1, n1[0], n1[1]);
					if (r0 > 1e-6) this.smoothTri(p00, p01, p10, n00, n01, n10, m);
					if (r1 > 1e-6) this.smoothTri(p01, p11, p10, n01, n11, n10, m);
				} else {
					const am = (a0 + a1) / 2;
					const nf = radial(am, segN[0], segN[1]);
					if (r0 > 1e-6) this.smoothTri(p00, p01, p10, nf, nf, nf, m);
					if (r1 > 1e-6) this.smoothTri(p01, p11, p10, nf, nf, nf, m);
				}
			}
		}
		if (opts.caps) {
			const first = profile[0],
				last = profile[profile.length - 1];
			for (const [r, t] of [first, last]) {
				if (r < 1e-6) continue;
				const center: P3 = frame(0, t, 0);
				for (let j = 0; j < segments; j++) {
					const a0 = phase + (j / segments) * Math.PI * 2;
					const a1 = phase + ((j + 1) / segments) * Math.PI * 2;
					this.tri(center, frame(r, t, a0), frame(r, t, a1), m);
				}
			}
		}
		return this;
	}

	/** Cylinder or cone from t = 0 to t = h along `axis`. */
	cylinder(
		rBottom: number,
		rTop: number,
		h: number,
		segments: number,
		m: Material,
		opts: LatheOptions = {}
	): this {
		return this.lathe(
			[
				[rBottom, 0],
				[rTop, h]
			],
			segments,
			m,
			{ caps: true, smooth: false, ...opts }
		);
	}

	/** Sphere (scale the builder for ellipsoids). */
	sphere(r: number, segments: number, rings: number, m: Material, smooth = true): this {
		const profile: P2[] = [];
		for (let i = 0; i <= rings; i++) {
			const phi = (i / rings) * Math.PI;
			profile.push([Math.sin(phi) * r, -Math.cos(phi) * r]);
		}
		return this.lathe(profile, segments, m, { smooth });
	}

	/**
	 * Irregular faceted blob (rocks, debris, bushes). Displacement is a pure
	 * function of the undisplaced position so shared corners stay welded.
	 */
	blob(
		r: number,
		segments: number,
		rings: number,
		m: Material,
		roughness: number,
		seed: number
	): this {
		const offset = (p: P3): P3 => {
			const h =
				Math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719 + seed * 4.123) * 43758.5453;
			const f = 1 + (h - Math.floor(h) - 0.5) * 2 * roughness;
			return [p[0] * f, p[1] * f, p[2] * f];
		};
		for (let i = 0; i < rings; i++) {
			const ph0 = (i / rings) * Math.PI,
				ph1 = ((i + 1) / rings) * Math.PI;
			for (let j = 0; j < segments; j++) {
				const th0 = (j / segments) * Math.PI * 2,
					th1 = ((j + 1) / segments) * Math.PI * 2;
				const pt = (ph: number, th: number): P3 => {
					const s = Math.sin(ph) * r;
					const q: P3 = [
						Math.round(Math.cos(th) * s * 1e4) / 1e4,
						Math.round(-Math.cos(ph) * r * 1e4) / 1e4,
						Math.round(-Math.sin(th) * s * 1e4) / 1e4
					];
					return offset(q);
				};
				const a = pt(ph0, th0),
					b = pt(ph0, th1),
					c = pt(ph1, th0),
					d = pt(ph1, th1);
				if (i > 0) this.tri(a, b, c, m);
				if (i < rings - 1) this.tri(b, d, c, m);
			}
		}
		return this;
	}
}

/** Ear-clipping triangulation of a simple polygon. Returns index triples. */
export function triangulate(points: readonly P2[]): number[] {
	const n = points.length;
	if (n < 3) return [];
	let area = 0;
	for (let i = 0; i < n; i++) {
		const a = points[i],
			b = points[(i + 1) % n];
		area += a[0] * b[1] - b[0] * a[1];
	}
	const idx = Array.from({ length: n }, (_, i) => i);
	if (area < 0) idx.reverse();
	const out: number[] = [];
	const cross = (a: P2, b: P2, c: P2): number =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	const inside = (p: P2, a: P2, b: P2, c: P2): boolean =>
		cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
	let guard = 0;
	while (idx.length > 3 && guard++ < 10000) {
		let clipped = false;
		for (let i = 0; i < idx.length; i++) {
			const ia = idx[(i + idx.length - 1) % idx.length],
				ib = idx[i],
				ic = idx[(i + 1) % idx.length];
			const a = points[ia],
				b = points[ib],
				c = points[ic];
			if (cross(a, b, c) <= 1e-12) continue;
			let blocked = false;
			for (const j of idx) {
				if (j === ia || j === ib || j === ic) continue;
				if (inside(points[j], a, b, c)) {
					blocked = true;
					break;
				}
			}
			if (blocked) continue;
			out.push(ia, ib, ic);
			idx.splice(i, 1);
			clipped = true;
			break;
		}
		if (!clipped) break;
	}
	if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
	return out;
}

/** Moves every vertex of a polygon toward its centroid by `amount` (cheap bevel helper). */
function insetPolygon(points: readonly P2[], amount: number): P2[] {
	let cx = 0,
		cy = 0;
	for (const p of points) {
		cx += p[0];
		cy += p[1];
	}
	cx /= points.length;
	cy /= points.length;
	return points.map(([x, y]) => {
		const dx = x - cx,
			dy = y - cy;
		const l = Math.hypot(dx, dy) || 1;
		const k = Math.max(0, l - amount) / l;
		return [cx + dx * k, cy + dy * k] as P2;
	});
}
