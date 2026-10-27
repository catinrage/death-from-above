import { inBattlePlane } from './combat';
import type { CameraRig } from './camera';
import type { AirUnit } from './enemy-air';
import type { Player } from './player';
import type { Designation, Trackable, Unit } from './types';
import type { World } from './world';

/** Most targets that can be painted for one salvo. */
export const MAX_LOCKS = 6;
/** How close (CSS px) the reticle must be to pick a target. */
const PICK_RADIUS = 72;
/** Real seconds the reticle must rest on a target to paint it in focus. */
const DWELL = 0.08;
/** Without a pointer, focus paints the nearest targets on this cadence. */
const AUTO_LOCK_EVERY = 0.16;
/** Furthest automatic pick for keyboard-only aiming. */
const AUTO_RANGE = 900;

export interface Lock {
	/** The unit or aircraft object itself; identity is the lock key. */
	key: Unit | AirUnit;
	unit: Unit | null;
	air: AirUnit | null;
	track: Trackable;
	age: number;
}

export interface ScreenMarker {
	x: number;
	y: number;
	size: number;
}

/** Live view of a ground unit's centre for missile guidance. */
export function trackUnit(u: Unit): Trackable {
	return {
		get x() {
			return u.x;
		},
		get y() {
			return u.y + u.def.half[1];
		},
		get z() {
			return u.z;
		},
		get vx() {
			return u.alive ? u.speed * u.dir : 0;
		},
		vy: 0,
		get alive() {
			return u.alive;
		},
		heat: 1
	};
}

/** A fixed spot on the battlefield. */
export function pointTrack(x: number, y: number): Trackable {
	return { x, y, z: 0, vx: 0, vy: 0, alive: true, heat: 0 };
}

const isLive = (l: Lock): boolean =>
	l.unit ? l.unit.alive : !!l.air && l.air.alive && !l.air.dying;

const toDesignation = (l: Lock): Designation => ({
	track: l.track,
	unit: l.unit,
	x: l.track.x,
	y: l.track.y
});

/**
 * The pilot's aiming: a reticle (mouse or right stick) projected onto the
 * battlefield, the target under it, and in focus mode a list of painted locks
 * for a missile salvo. Keyboard-only pilots get automatic picks instead.
 */
export class Targeting {
	cursorX = 0;
	cursorY = 0;
	/** A pointer is driving the reticle (mouse moved / stick used recently). */
	pointer = false;
	/** Reticle position on the battle plane. */
	aim: [number, number] | null = null;
	hover: Lock | null = null;
	readonly locks: Lock[] = [];
	/** Locks painted during the last update (drives the lock tone). */
	acquired = 0;
	/** Targets with one of the pilot's missiles already on the way; not repainted. */
	private readonly engaged = new Map<Unit | AirUnit, Lock>();
	private dwellKey: Unit | AirUnit | null = null;
	private dwell = 0;
	private autoTimer = 0;

	update(
		dtReal: number,
		w: World,
		cam: CameraRig,
		cssW: number,
		cssH: number,
		cursor: { x: number; y: number; active: boolean },
		focus: boolean,
		capacity: number
	): void {
		this.acquired = 0;
		this.cursorX = cursor.x;
		this.cursorY = cursor.y;
		this.pointer = cursor.active;
		this.aim = cursor.active ? cam.unproject(cursor.x, cursor.y, cssW, cssH) : null;
		w.designator = this.aim ? { x: this.aim[0], y: this.aim[1] } : null;
		for (let i = this.locks.length - 1; i >= 0; i--) {
			const l = this.locks[i];
			l.age += dtReal;
			if (!isLive(l) || !this.marker(cam, l, cssW, cssH)) this.locks.splice(i, 1);
		}
		for (const [key, l] of this.engaged) {
			const inbound =
				w.missiles.some((m) => m.target === l.track) ||
				w.pilots().some((p) => p.hasQueued(l.track));
			if (!inbound || !isLive(l)) this.engaged.delete(key);
		}
		const cap = Math.max(0, Math.min(MAX_LOCKS, capacity));
		if (this.locks.length > cap) this.locks.length = cap;
		this.hover = this.pointer ? this.pick(w, cam, cssW, cssH) : null;
		if (!focus) {
			this.dwellKey = null;
			this.dwell = 0;
			return;
		}
		if (this.locks.length >= cap) return;
		if (this.pointer) {
			const h = this.hover;
			if (!h || this.isLocked(h.key) || this.engaged.has(h.key)) {
				this.dwellKey = null;
				this.dwell = 0;
				return;
			}
			if (this.dwellKey === h.key) this.dwell += dtReal;
			else {
				this.dwellKey = h.key;
				this.dwell = 0;
			}
			if (this.dwell >= DWELL) this.add(h);
			return;
		}
		this.autoTimer -= dtReal;
		if (this.autoTimer > 0) return;
		this.autoTimer = AUTO_LOCK_EVERY;
		const next = this.nearest(w, cam, cssW, cssH, true);
		if (next) this.add(next);
	}

	/** Targets for a missile salvo; consumes the painted locks. */
	salvo(w: World, p: Player, count: number): Designation[] {
		if (count <= 0) return [];
		if (this.locks.length > 0) {
			const fired = this.locks.slice(0, count);
			for (const l of fired) this.engaged.set(l.key, l);
			this.locks.length = 0;
			return fired.map(toDesignation);
		}
		const one = this.single(w, p);
		if (one) return [one];
		// Nothing to aim at: fire at the ground ahead.
		const x = p.x + (Math.cos(p.angle) >= 0 ? 1 : -1) * 260;
		return [{ track: pointTrack(x, w.ground(x) + 0.5), unit: null, x, y: w.ground(x) }];
	}

	/** Where a single guided weapon should go: lock, reticle target, reticle spot, or auto pick. */
	single(w: World, p: Player): Designation | null {
		if (this.locks.length > 0) return toDesignation(this.locks[0]);
		if (this.hover) return toDesignation(this.hover);
		if (this.aim) {
			const x = this.aim[0];
			const g = w.ground(x);
			return { track: pointTrack(x, g + 0.5), unit: null, x, y: g };
		}
		const auto = this.ahead(w, p);
		return auto ? toDesignation(auto) : null;
	}

	/** The pilot's pick for the wingman's "attack my target": first lock, reticle target, or best one ahead. */
	primary(w: World, p: Player): Lock | null {
		return this.locks[0] ?? this.hover ?? this.ahead(w, p);
	}

	/**
	 * Where a guided bomb should go: a painted ground target, the ground unit
	 * under the reticle, or the reticle spot. Null lets the bomb pick a target
	 * it can actually glide to.
	 */
	bombTarget(w: World): Designation | null {
		const lock = this.locks.find((l) => l.unit);
		if (lock) return toDesignation(lock);
		if (this.hover?.unit) return toDesignation(this.hover);
		if (!this.aim) return null;
		const x = this.aim[0];
		const g = w.ground(x);
		return { track: pointTrack(x, g + 0.5), unit: null, x, y: g };
	}

	/** Screen placement of a lock's target, or null when off screen. */
	marker(cam: CameraRig, l: Lock, cssW: number, cssH: number): ScreenMarker | null {
		const t = l.track;
		const c = cam.project(t.x, t.y, t.z, cssW, cssH);
		if (!c || c[0] < -20 || c[0] > cssW + 20 || c[1] < -20 || c[1] > cssH + 20) return null;
		const h = l.unit ? l.unit.def.half[1] : 2.5;
		const top = cam.project(t.x, t.y + h + 1.5, t.z, cssW, cssH);
		const size = top ? Math.max(30, Math.abs(c[1] - top[1]) * 2.6) : 30;
		return { x: c[0], y: c[1], size };
	}

	isLocked(key: Unit | AirUnit): boolean {
		return this.locks.some((l) => l.key === key);
	}

	clear(): void {
		this.locks.length = 0;
		this.engaged.clear();
		this.hover = null;
		this.dwellKey = null;
		this.dwell = 0;
		this.pointer = false;
		this.aim = null;
	}

	private add(l: Lock): void {
		this.locks.push(l);
		this.acquired++;
		this.dwellKey = null;
		this.dwell = 0;
	}

	private candidates(w: World): Lock[] {
		const out: Lock[] = [];
		for (const u of w.units) {
			if (u.alive && inBattlePlane(u))
				out.push({ key: u, unit: u, air: null, track: trackUnit(u), age: 0 });
		}
		for (const a of w.air) {
			if (a.alive && !a.dying) out.push({ key: a, unit: null, air: a, track: a, age: 0 });
		}
		return out;
	}

	private pick(w: World, cam: CameraRig, cssW: number, cssH: number): Lock | null {
		let best: Lock | null = null;
		let bestD = Infinity;
		for (const c of this.candidates(w)) {
			const m = this.marker(cam, c, cssW, cssH);
			if (!m) continue;
			const d = Math.hypot(m.x - this.cursorX, m.y - this.cursorY);
			if (d < PICK_RADIUS + m.size * 0.25 && d < bestD) {
				bestD = d;
				best = c;
			}
		}
		if (best) {
			// Reuse the existing lock object so its tracking adapter stays stable.
			const key = best.key;
			return this.locks.find((l) => l.key === key) ?? best;
		}
		return null;
	}

	/** Nearest on-screen target to the aircraft (optionally skipping painted ones). */
	private nearest(
		w: World,
		cam: CameraRig,
		cssW: number,
		cssH: number,
		unlocked: boolean
	): Lock | null {
		const p = w.player;
		if (!p) return null;
		let best: Lock | null = null;
		let bestD = Infinity;
		for (const c of this.candidates(w)) {
			if (unlocked && (this.isLocked(c.key) || this.engaged.has(c.key))) continue;
			if (!this.marker(cam, c, cssW, cssH)) continue;
			const d = Math.hypot(c.track.x - p.x, c.track.y - p.y);
			if (d < bestD) {
				bestD = d;
				best = c;
			}
		}
		return best;
	}

	/** Best target roughly ahead of the nose, for pilots without a pointer. */
	private ahead(w: World, p: Player): Lock | null {
		const ca = Math.cos(p.angle),
			sa = Math.sin(p.angle);
		let best: Lock | null = null;
		let bestScore = Infinity;
		for (const c of this.candidates(w)) {
			const dx = c.track.x - p.x,
				dy = c.track.y - p.y;
			const d = Math.hypot(dx, dy);
			const along = (dx * ca + dy * sa) / Math.max(d, 1);
			if (d > AUTO_RANGE || along < -0.2) continue;
			const score = d * (1.6 - along);
			if (score < bestScore) {
				bestScore = score;
				best = c;
			}
		}
		return best;
	}
}
