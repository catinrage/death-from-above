import { clamp, damp, DEG, mat4, vec3 } from '../engine/math';
import type { CameraFrame } from '../engine/renderer';

export interface FollowTarget {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

/** Metres kept visible behind the aircraft and beyond the bomb's landing point. */
const BEHIND = 30;
const BEYOND = 45;
/** Furthest landing point (from the aircraft) the camera will widen out to show. */
const MAX_REACH = 340;
/** Camera pitch for the usual side-on shot and for looking down on the gunship's orbit. */
export const SIDE_PITCH = 5 * DEG;
export const ORBIT_PITCH = 16 * DEG;

/**
 * Side-on chase camera. It frames the aircraft, the ground beneath it and —
 * while flying a sortie — where the next bomb will land, plus any bombs still
 * falling. It zooms out only as far as that needs, and adds trauma-based shake.
 */
export class CameraRig {
	x = 0;
	y = 40;
	dist = 150;
	pitch = SIDE_PITCH;
	/** Pitch the camera eases toward (set every step by the simulation). */
	pitchTarget = SIDE_PITCH;
	readonly fovY = 38 * DEG;
	readonly near = 2;
	readonly far = 9000;
	aspect = 16 / 9;
	trauma = 0;
	private time = 0;
	private lead = 0;
	minDist = 70;
	/** Far enough to frame the aircraft at the ceiling with the ground still in view. */
	maxDist = 760;
	/** Extra metres of space below the ground line (lifts the battle up the screen). */
	groundBias = 0;
	/**
	 * World-x range that must stay on screen besides the aircraft (predicted
	 * impact, bombs in flight). Null falls back to a plain velocity lead.
	 */
	interest: [number, number] | null = null;
	/** Someone else is driving the shot (the hangar showcase): `follow` does nothing. */
	locked = false;

	readonly frame: CameraFrame = {
		view: mat4.create(),
		proj: mat4.create(),
		viewProj: mat4.create(),
		invViewProj: mat4.create(),
		pos: vec3.create(),
		near: 2,
		far: 9000,
		focusX: 0,
		focusY: 0,
		viewRadius: 300,
		cullMinX: -1000,
		cullMaxX: 1000,
		shadowBox: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 }
	};

	private readonly target = vec3.create();
	private readonly up = vec3.create(0, 1, 0);

	/** Snaps straight to the framing without smoothing (on spawn / scene change). */
	snap(t: FollowTarget, groundY: number): void {
		const f = this.framing(t, groundY);
		this.x = f.x;
		this.y = f.y;
		this.dist = f.dist;
		this.lead = f.lead;
		this.pitch = this.pitchTarget;
	}

	private framing(
		t: FollowTarget,
		groundY: number
	): { x: number; y: number; dist: number; lead: number } {
		const tanH = Math.tan(this.fovY / 2);
		// Lead the climb or dive a little so the easing doesn't trail off-screen.
		const low = Math.min(groundY, t.y - 16 + Math.min(0, t.vy) * 0.6);
		// High up the shot widens a lot: grow the margins with it so the battle line clears the
		// bottom HUD and the aircraft clears the top one.
		const extra = Math.max(0, t.y - low - 100);
		const top = t.y + 15 + Math.max(0, t.vy) * 0.6 + extra * 0.1;
		const bottom = low - 19 - this.groundBias - extra * 0.28;
		const distV = ((top - bottom) * 0.5 * 1.08) / tanH;

		let x = t.x + clamp(t.vx, -90, 90);
		let distH = 0;
		const span = this.interest;
		if (span) {
			const lo = clamp(Math.min(span[0], span[1]), t.x - MAX_REACH, t.x + MAX_REACH);
			const hi = clamp(Math.max(span[0], span[1]), t.x - MAX_REACH, t.x + MAX_REACH);
			const ahead = (lo + hi) / 2 >= t.x ? 1 : -1;
			const left = Math.min(t.x - (ahead > 0 ? BEHIND : 10), lo - (ahead > 0 ? 15 : BEYOND));
			const right = Math.max(t.x + (ahead > 0 ? 10 : BEHIND), hi + (ahead > 0 ? BEYOND : 15));
			x = (left + right) / 2;
			distH = ((right - left) * 0.5 * 1.03) / (tanH * this.aspect);
		}
		const dist = clamp(Math.max(distV, distH), this.minDist, this.maxDist);
		let y = (top + bottom) / 2;
		if (dist > distV * 1.02) {
			// Zoomed out for the bomb sight: keep the battle line low (~71% down the
			// screen, clear of the HUD) instead of floating mid-screen.
			const halfH = dist * tanH;
			y = groundY + halfH * 0.42;
			y = Math.min(Math.max(y, top - halfH), bottom + halfH);
		}
		// Above even the widest shot (past the ceiling): keep the aircraft rather than the ground.
		const halfH = dist * tanH;
		y = Math.max(y, top - halfH * 0.95);
		return { x, y, dist, lead: x - t.x };
	}

	follow(dt: number, t: FollowTarget, groundY: number): void {
		if (this.locked) return;
		const f = this.framing(t, groundY);
		this.lead = damp(this.lead, f.lead, 2.2, dt);
		this.x = damp(this.x, t.x + this.lead, 8, dt);
		// Ride along with vertical speed so a hard climb never outruns the frame.
		this.y = damp(this.y + t.vy * dt * 0.7, f.y, 3, dt);
		this.dist = damp(this.dist, f.dist, 1.8, dt);
		this.pitch = damp(this.pitch, this.pitchTarget, 1.5, dt);
	}

	addTrauma(amount: number): void {
		this.trauma = Math.min(1, this.trauma + amount);
	}

	update(dt: number, groundY: number): void {
		this.time += dt;
		this.trauma = Math.max(0, this.trauma - dt * 0.9);
		const f = this.frame;
		const shake = this.trauma * this.trauma;
		const t = this.time;
		const sx = (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7) * 0.4) * shake * 3.2;
		const sy = (Math.sin(t * 43.3 + 1.3) * 0.6 + Math.sin(t * 71.9) * 0.4) * shake * 3.2;
		const tx = this.x + sx,
			ty = this.y + sy;
		f.pos[0] = tx;
		f.pos[1] = ty + Math.sin(this.pitch) * this.dist;
		f.pos[2] = Math.cos(this.pitch) * this.dist;
		vec3.set(this.target, tx, ty, 0);
		const roll = Math.sin(t * 29.3) * shake * 0.035;
		vec3.set(this.up, Math.sin(roll), Math.cos(roll), 0);
		mat4.lookAt(f.view, f.pos, this.target, this.up);
		mat4.perspective(f.proj, this.fovY, this.aspect, this.near, this.far);
		mat4.multiply(f.viewProj, f.proj, f.view);
		mat4.invert(f.invViewProj, f.viewProj);
		f.near = this.near;
		f.far = this.far;

		const halfH = Math.tan(this.fovY / 2) * this.dist;
		const halfW = halfH * this.aspect;
		f.focusX = tx;
		f.focusY = ty;
		f.viewRadius = Math.hypot(halfW, halfH) + 40;
		// Terrain is visible far beyond the battle line, where the frustum is wider.
		const farHalfW = Math.tan(this.fovY / 2) * this.aspect * (this.dist + 450);
		f.cullMinX = tx - farHalfW - 40;
		f.cullMaxX = tx + farHalfW + 40;
		const b = f.shadowBox;
		b.minX = tx - halfW - 70;
		b.maxX = tx + halfW + 70;
		b.minY = Math.min(groundY, ty - halfH) - 15;
		b.maxY = ty + halfH + 15;
		b.minZ = -70;
		b.maxZ = 40;
	}

	/** Half extents of the view at the battle line (z = 0). */
	viewExtents(): { halfW: number; halfH: number } {
		const halfH = Math.tan(this.fovY / 2) * this.dist;
		return { halfW: halfH * this.aspect, halfH };
	}

	/** Maps a CSS-pixel screen point onto the battle plane (z = 0). Null if the ray misses it. */
	unproject(sx: number, sy: number, cssW: number, cssH: number): [number, number] | null {
		const m = this.frame.invViewProj;
		const nx = (sx / cssW) * 2 - 1,
			ny = 1 - (sy / cssH) * 2;
		const a = mat4.transformPoint(vec3.create(), m, nx, ny, -1);
		const b = mat4.transformPoint(vec3.create(), m, nx, ny, 1);
		const dz = b[2] - a[2];
		if (Math.abs(dz) < 1e-6) return null;
		const t = -a[2] / dz;
		if (t < 0) return null;
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	}

	/** Projects a world point to CSS pixel coordinates. Returns null when behind the camera. */
	project(x: number, y: number, z: number, cssW: number, cssH: number): [number, number] | null {
		const m = this.frame.viewProj;
		const w = m[3] * x + m[7] * y + m[11] * z + m[15];
		if (w <= 0) return null;
		const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
		const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
		return [(nx * 0.5 + 0.5) * cssW, (1 - (ny * 0.5 + 0.5)) * cssH];
	}
}
