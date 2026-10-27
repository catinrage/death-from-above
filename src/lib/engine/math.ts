// Small, allocation-free linear algebra for the renderer and physics.
// Matrices are column-major (OpenGL convention). Hot paths write into `out`
// arguments instead of returning new objects to keep the GC quiet at 60+ fps.

export type Mat4 = Float32Array;
export type Vec3 = Float32Array;
export type Quat = Float32Array;

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const saturate = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
	const t = saturate((x - e0) / (e1 - e0));
	return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach of `current` toward `target`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
	return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
	let r = (a + Math.PI) % TAU;
	if (r < 0) r += TAU;
	return r - Math.PI;
}

/** Signed shortest rotation from `from` to `to`. */
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
	return current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt));
}

export function moveToward(current: number, target: number, maxDelta: number): number {
	const d = target - current;
	if (Math.abs(d) <= maxDelta) return target;
	return current + Math.sign(d) * maxDelta;
}

// ---------------------------------------------------------------- vec3

export const vec3 = {
	create(x = 0, y = 0, z = 0): Vec3 {
		const v = new Float32Array(3);
		v[0] = x;
		v[1] = y;
		v[2] = z;
		return v;
	},
	set(out: Vec3, x: number, y: number, z: number): Vec3 {
		out[0] = x;
		out[1] = y;
		out[2] = z;
		return out;
	},
	copy(out: Vec3, a: ArrayLike<number>): Vec3 {
		out[0] = a[0];
		out[1] = a[1];
		out[2] = a[2];
		return out;
	},
	length(a: ArrayLike<number>): number {
		return Math.hypot(a[0], a[1], a[2]);
	},
	normalize(out: Vec3, a: ArrayLike<number>): Vec3 {
		const l = Math.hypot(a[0], a[1], a[2]) || 1;
		out[0] = a[0] / l;
		out[1] = a[1] / l;
		out[2] = a[2] / l;
		return out;
	},
	dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	},
	cross(out: Vec3, a: ArrayLike<number>, b: ArrayLike<number>): Vec3 {
		const ax = a[0],
			ay = a[1],
			az = a[2],
			bx = b[0],
			by = b[1],
			bz = b[2];
		out[0] = ay * bz - az * by;
		out[1] = az * bx - ax * bz;
		out[2] = ax * by - ay * bx;
		return out;
	},
	lerp(out: Vec3, a: ArrayLike<number>, b: ArrayLike<number>, t: number): Vec3 {
		out[0] = a[0] + (b[0] - a[0]) * t;
		out[1] = a[1] + (b[1] - a[1]) * t;
		out[2] = a[2] + (b[2] - a[2]) * t;
		return out;
	}
};

// ---------------------------------------------------------------- mat4

export const mat4 = {
	create(): Mat4 {
		const m = new Float32Array(16);
		m[0] = m[5] = m[10] = m[15] = 1;
		return m;
	},
	identity(out: Mat4): Mat4 {
		out.fill(0);
		out[0] = out[5] = out[10] = out[15] = 1;
		return out;
	},
	copy(out: Mat4, a: Mat4): Mat4 {
		out.set(a);
		return out;
	},
	multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15];
		for (let c = 0; c < 4; c++) {
			const b0 = b[c * 4],
				b1 = b[c * 4 + 1],
				b2 = b[c * 4 + 2],
				b3 = b[c * 4 + 3];
			out[c * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
			out[c * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
			out[c * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
			out[c * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
		}
		return out;
	},
	invert(out: Mat4, a: Mat4): Mat4 | null {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15];
		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11;
		const b04 = a01 * a13 - a03 * a11;
		const b05 = a02 * a13 - a03 * a12;
		const b06 = a20 * a31 - a21 * a30;
		const b07 = a20 * a32 - a22 * a30;
		const b08 = a20 * a33 - a23 * a30;
		const b09 = a21 * a32 - a22 * a31;
		const b10 = a21 * a33 - a23 * a31;
		const b11 = a22 * a33 - a23 * a32;
		let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
		if (!det) return null;
		det = 1 / det;
		out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
		out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
		out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
		out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
		out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
		out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
		out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
		out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
		out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
		out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
		out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
		out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
		out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
		out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
		out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
		out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
		return out;
	},
	perspective(out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 {
		const f = 1 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);
		out.fill(0);
		out[0] = f / aspect;
		out[5] = f;
		out[10] = (far + near) * nf;
		out[11] = -1;
		out[14] = 2 * far * near * nf;
		return out;
	},
	ortho(
		out: Mat4,
		left: number,
		right: number,
		bottom: number,
		top: number,
		near: number,
		far: number
	): Mat4 {
		const lr = 1 / (left - right);
		const bt = 1 / (bottom - top);
		const nf = 1 / (near - far);
		out.fill(0);
		out[0] = -2 * lr;
		out[5] = -2 * bt;
		out[10] = 2 * nf;
		out[12] = (left + right) * lr;
		out[13] = (top + bottom) * bt;
		out[14] = (far + near) * nf;
		out[15] = 1;
		return out;
	},
	lookAt(
		out: Mat4,
		eye: ArrayLike<number>,
		center: ArrayLike<number>,
		up: ArrayLike<number>
	): Mat4 {
		let z0 = eye[0] - center[0],
			z1 = eye[1] - center[1],
			z2 = eye[2] - center[2];
		let len = Math.hypot(z0, z1, z2) || 1;
		z0 /= len;
		z1 /= len;
		z2 /= len;
		let x0 = up[1] * z2 - up[2] * z1,
			x1 = up[2] * z0 - up[0] * z2,
			x2 = up[0] * z1 - up[1] * z0;
		len = Math.hypot(x0, x1, x2) || 1;
		x0 /= len;
		x1 /= len;
		x2 /= len;
		const y0 = z1 * x2 - z2 * x1,
			y1 = z2 * x0 - z0 * x2,
			y2 = z0 * x1 - z1 * x0;
		out[0] = x0;
		out[1] = y0;
		out[2] = z0;
		out[3] = 0;
		out[4] = x1;
		out[5] = y1;
		out[6] = z1;
		out[7] = 0;
		out[8] = x2;
		out[9] = y2;
		out[10] = z2;
		out[11] = 0;
		out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
		out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
		out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
		out[15] = 1;
		return out;
	},
	fromTranslation(out: Mat4, x: number, y: number, z: number): Mat4 {
		mat4.identity(out);
		out[12] = x;
		out[13] = y;
		out[14] = z;
		return out;
	},
	/** out = a * T(x, y, z) */
	translate(out: Mat4, a: Mat4, x: number, y: number, z: number): Mat4 {
		if (out !== a) out.set(a);
		out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
		out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
		out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
		out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
		return out;
	},
	/** out = a * S(x, y, z) */
	scale(out: Mat4, a: Mat4, x: number, y: number, z: number): Mat4 {
		for (let i = 0; i < 4; i++) {
			out[i] = a[i] * x;
			out[4 + i] = a[4 + i] * y;
			out[8 + i] = a[8 + i] * z;
			out[12 + i] = a[12 + i];
		}
		return out;
	},
	/** out = a * Rx(rad) */
	rotateX(out: Mat4, a: Mat4, rad: number): Mat4 {
		const s = Math.sin(rad),
			c = Math.cos(rad);
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		if (out !== a) {
			out[0] = a[0];
			out[1] = a[1];
			out[2] = a[2];
			out[3] = a[3];
			out[12] = a[12];
			out[13] = a[13];
			out[14] = a[14];
			out[15] = a[15];
		}
		out[4] = a10 * c + a20 * s;
		out[5] = a11 * c + a21 * s;
		out[6] = a12 * c + a22 * s;
		out[7] = a13 * c + a23 * s;
		out[8] = a20 * c - a10 * s;
		out[9] = a21 * c - a11 * s;
		out[10] = a22 * c - a12 * s;
		out[11] = a23 * c - a13 * s;
		return out;
	},
	/** out = a * Ry(rad) */
	rotateY(out: Mat4, a: Mat4, rad: number): Mat4 {
		const s = Math.sin(rad),
			c = Math.cos(rad);
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11];
		if (out !== a) {
			out[4] = a[4];
			out[5] = a[5];
			out[6] = a[6];
			out[7] = a[7];
			out[12] = a[12];
			out[13] = a[13];
			out[14] = a[14];
			out[15] = a[15];
		}
		out[0] = a00 * c - a20 * s;
		out[1] = a01 * c - a21 * s;
		out[2] = a02 * c - a22 * s;
		out[3] = a03 * c - a23 * s;
		out[8] = a00 * s + a20 * c;
		out[9] = a01 * s + a21 * c;
		out[10] = a02 * s + a22 * c;
		out[11] = a03 * s + a23 * c;
		return out;
	},
	/** out = a * Rz(rad) */
	rotateZ(out: Mat4, a: Mat4, rad: number): Mat4 {
		const s = Math.sin(rad),
			c = Math.cos(rad);
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3];
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7];
		if (out !== a) {
			out[8] = a[8];
			out[9] = a[9];
			out[10] = a[10];
			out[11] = a[11];
			out[12] = a[12];
			out[13] = a[13];
			out[14] = a[14];
			out[15] = a[15];
		}
		out[0] = a00 * c + a10 * s;
		out[1] = a01 * c + a11 * s;
		out[2] = a02 * c + a12 * s;
		out[3] = a03 * c + a13 * s;
		out[4] = a10 * c - a00 * s;
		out[5] = a11 * c - a01 * s;
		out[6] = a12 * c - a02 * s;
		out[7] = a13 * c - a03 * s;
		return out;
	},
	/** Rotation from a unit quaternion followed by a translation. */
	fromQuatTranslation(out: Mat4, q: ArrayLike<number>, x: number, y: number, z: number): Mat4 {
		const qx = q[0],
			qy = q[1],
			qz = q[2],
			qw = q[3];
		const x2 = qx + qx,
			y2 = qy + qy,
			z2 = qz + qz;
		const xx = qx * x2,
			yx = qy * x2,
			yy = qy * y2;
		const zx = qz * x2,
			zy = qz * y2,
			zz = qz * z2;
		const wx = qw * x2,
			wy = qw * y2,
			wz = qw * z2;
		out[0] = 1 - yy - zz;
		out[1] = yx + wz;
		out[2] = zx - wy;
		out[3] = 0;
		out[4] = yx - wz;
		out[5] = 1 - xx - zz;
		out[6] = zy + wx;
		out[7] = 0;
		out[8] = zx + wy;
		out[9] = zy - wx;
		out[10] = 1 - xx - yy;
		out[11] = 0;
		out[12] = x;
		out[13] = y;
		out[14] = z;
		out[15] = 1;
		return out;
	},
	transformPoint(out: Vec3, m: Mat4, x: number, y: number, z: number): Vec3 {
		const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
		out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
		out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
		out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
		return out;
	}
};

// ---------------------------------------------------------------- quat

export const quat = {
	create(): Quat {
		const q = new Float32Array(4);
		q[3] = 1;
		return q;
	},
	identity(out: Quat): Quat {
		out[0] = out[1] = out[2] = 0;
		out[3] = 1;
		return out;
	},
	setAxisAngle(out: Quat, ax: number, ay: number, az: number, rad: number): Quat {
		const s = Math.sin(rad / 2);
		out[0] = ax * s;
		out[1] = ay * s;
		out[2] = az * s;
		out[3] = Math.cos(rad / 2);
		return out;
	},
	/** Hamilton product: out = a * b (apply b first, then a). */
	multiply(out: Quat, a: ArrayLike<number>, b: ArrayLike<number>): Quat {
		const ax = a[0],
			ay = a[1],
			az = a[2],
			aw = a[3];
		const bx = b[0],
			by = b[1],
			bz = b[2],
			bw = b[3];
		out[0] = ax * bw + aw * bx + ay * bz - az * by;
		out[1] = ay * bw + aw * by + az * bx - ax * bz;
		out[2] = az * bw + aw * bz + ax * by - ay * bx;
		out[3] = aw * bw - ax * bx - ay * by - az * bz;
		return out;
	},
	normalize(out: Quat, a: ArrayLike<number>): Quat {
		const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
		out[0] = a[0] / l;
		out[1] = a[1] / l;
		out[2] = a[2] / l;
		out[3] = a[3] / l;
		return out;
	},
	/** Integrates a world-space angular velocity (rad/s) over dt. */
	integrate(q: Quat, wx: number, wy: number, wz: number, dt: number): Quat {
		const qx = q[0],
			qy = q[1],
			qz = q[2],
			qw = q[3];
		const h = 0.5 * dt;
		q[0] = qx + h * (wx * qw + wy * qz - wz * qy);
		q[1] = qy + h * (wy * qw + wz * qx - wx * qz);
		q[2] = qz + h * (wz * qw + wx * qy - wy * qx);
		q[3] = qw + h * (-wx * qx - wy * qy - wz * qz);
		return quat.normalize(q, q);
	},
	/** Rotates vector (x, y, z) by unit quaternion q. */
	rotate(out: Vec3, q: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
		const qx = q[0],
			qy = q[1],
			qz = q[2],
			qw = q[3];
		const tx = 2 * (qy * z - qz * y);
		const ty = 2 * (qz * x - qx * z);
		const tz = 2 * (qx * y - qy * x);
		out[0] = x + qw * tx + (qy * tz - qz * ty);
		out[1] = y + qw * ty + (qz * tx - qx * tz);
		out[2] = z + qw * tz + (qx * ty - qy * tx);
		return out;
	},
	/** Builds q = Ry(yaw) * Rz(pitch) * Rx(roll) — the order the game uses for vehicles. */
	fromYawPitchRoll(out: Quat, yaw: number, pitch: number, roll: number): Quat {
		const cy = Math.cos(yaw / 2),
			sy = Math.sin(yaw / 2);
		const cp = Math.cos(pitch / 2),
			sp = Math.sin(pitch / 2);
		const cr = Math.cos(roll / 2),
			sr = Math.sin(roll / 2);
		// Ry * Rz
		const ax = sy * sp,
			ay = sy * cp,
			az = cy * sp,
			aw = cy * cp;
		// (Ry*Rz) * Rx
		out[0] = ax * cr + aw * sr;
		out[1] = ay * cr + az * sr;
		out[2] = az * cr - ay * sr;
		out[3] = aw * cr - ax * sr;
		return out;
	}
};
