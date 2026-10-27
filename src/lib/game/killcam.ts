import { damp, lerp } from '../engine/math';
import type { CameraRig } from './camera';
import { distToUnit } from './combat';
import { CHAIN_DAMAGE, CHAIN_REACH } from './deaths';
import type { BlastSpec } from './defs-bombs';
import type { Unit } from './types';
import { predictImpact, type Bomb } from './weapons';
import type { World } from './world';

/** World speed while the kill cam rolls. */
export const KILLCAM_TIME_SCALE = 0.3;
/** Simulation seconds before impact at which a bomb is picked up. */
const LEAD = 0.7;
/** Real seconds the shot lingers on the blast before handing back. */
const HOLD = 1.1;
/** Real seconds after a kill cam before another may start. */
const COOLDOWN = 6;
/** Kills (the burning structure included) that make a chain reaction worth watching. */
const CHAIN_KILLS = 3;

export type BigKill = 'bridge' | 'chain';

/** Weapons with their own spectacle (or none worth following). */
const SKIP = new Set(['cluster', 'thunder', 'nuke', 'emp', 'chemical', 'para']);

/** A unit whose death is a fireball that reaches its neighbours (fuel depots). */
const chains = (u: Unit): boolean => u.def.death === 'blast' && u.def.boom > 2;

/**
 * Would a blast at (x, y, z) drop a bridge span, or set off a structure whose
 * fireball takes a crowd with it? Mirrors the blast, bridge and chain-reaction
 * damage rules without touching the world.
 */
export function bigKillAt(w: World, x: number, y: number, z: number, b: BlastSpec): BigKill | null {
	const r = b.radius;
	if (r <= 0) return null;
	const bridge = w.bridge;
	if (bridge) {
		for (const s of bridge.spans) {
			if (!s.down && bridge.blastDamage(s, x, y, z, r, b.damage, b.pierce) >= s.hp) return 'bridge';
		}
	}
	const hp = new Map<Unit, number>();
	for (const u of w.units) {
		if (!u.alive) continue;
		hp.set(u, u.hp);
		if (Math.abs(u.x - x) > r + u.def.half[0] + 2) continue;
		const d = distToUnit(u, x, y, z);
		if (d >= r) continue;
		const k = 1 - d / r;
		const armorK = 1 - u.def.armor * (1 - Math.min(b.pierce, 1));
		hp.set(u, u.hp - b.damage * (0.15 + 0.85 * k * k) * armorK);
	}
	// Fireballs set off more fireballs: keep going until nothing new burns.
	const burnt = new Set<Unit>();
	let lit = true;
	while (lit) {
		lit = false;
		for (const [u, h] of hp) {
			if (h > 0 || burnt.has(u) || !chains(u)) continue;
			burnt.add(u);
			lit = true;
			for (const [o, oh] of hp) {
				if (o !== u && Math.abs(o.x - u.x) < CHAIN_REACH)
					hp.set(o, oh - CHAIN_DAMAGE * (1 - o.def.armor * 0.7));
			}
		}
	}
	if (burnt.size === 0) return null;
	let kills = 0;
	for (const h of hp.values()) if (h <= 0) kills++;
	return burnt.size >= 2 || kills >= CHAIN_KILLS ? 'chain' : null;
}

/** Where a falling bomb will come down, and how soon (simulation seconds). */
function landing(w: World, b: Bomb): { x: number; y: number; t: number } {
	const hit = predictImpact(w, b.x, b.y, b.vx, b.vy, b.def.drag, null);
	// Guided bombs steer onto their mark; trust it over the ballistic arc.
	if (b.def.id === 'guided' && !Number.isNaN(b.aimX))
		return { ...hit, x: b.aimX, y: w.ground(b.aimX) };
	return hit;
}

/**
 * A short slow-motion shot that rides a bomb down to the impact when it is
 * about to drop a bridge span or touch off a chain of depots, lingers on the
 * blast, then hands the camera back. Timers run on real time.
 */
export class KillCam {
	active = false;
	/** Eases the slow-down and grading in and out. */
	blend = 0;
	reason: BigKill | null = null;
	/** Bomb being followed, then the blast once it lands. */
	x = 0;
	y = 0;
	/** Where the bomb will hit. */
	impactX = 0;
	impactY = 0;
	private bomb: Bomb | null = null;
	private hold = 0;
	private cooldown = 0;

	/**
	 * Advances by real time. `allowed` is false whenever the pilot needs the
	 * normal view (low, under fire, aiming in focus); it also cuts a shot short.
	 * Returns true on the frame a shot starts.
	 */
	update(dtReal: number, w: World, allowed: boolean): boolean {
		let started = false;
		this.cooldown = Math.max(0, this.cooldown - dtReal);
		if (this.active) {
			const b = this.bomb;
			if (b && b.alive && b.dig < 0) {
				this.x = b.x;
				this.y = b.y;
			} else if (b) {
				// Landed: settle on the blast.
				this.bomb = null;
				this.x = this.impactX;
				this.y = this.impactY;
				this.hold = HOLD;
			} else {
				this.hold -= dtReal;
			}
			if (!allowed || (!this.bomb && this.hold <= 0)) this.stop();
		} else if (allowed && this.cooldown <= 0) {
			started = this.watch(w);
		}
		this.blend = damp(this.blend, this.active ? 1 : 0, 7, dtReal);
		return started;
	}

	/** Multiplier for simulation time. */
	timeScale(): number {
		return lerp(1, KILLCAM_TIME_SCALE, this.blend);
	}

	/** Frames the falling bomb and the ground it is about to hit, then the blast. */
	drive(cam: CameraRig, dtReal: number): void {
		const falling = !!this.bomb;
		const x = falling ? (this.x + this.impactX) / 2 : this.impactX;
		const y = falling ? (this.y + this.impactY) / 2 + 2 : this.impactY + 9;
		const span = falling ? Math.hypot(this.x - this.impactX, this.y - this.impactY) : 0;
		const dist = falling ? Math.min(150, Math.max(55, span * 1.25 + 30)) : 75;
		cam.x = damp(cam.x, x, 5, dtReal);
		cam.y = damp(cam.y, y, 5, dtReal);
		cam.dist = damp(cam.dist, dist, 3, dtReal);
	}

	reset(): void {
		this.active = false;
		this.blend = 0;
		this.reason = null;
		this.bomb = null;
		this.hold = 0;
		this.cooldown = 0;
	}

	private watch(w: World): boolean {
		for (const b of w.bombs) {
			if (!b.alive || b.owner !== 'player' || b.bomblet || b.dig >= 0 || SKIP.has(b.def.id))
				continue;
			const hit = landing(w, b);
			if (hit.t > LEAD) continue;
			const reason = bigKillAt(w, hit.x, hit.y, b.z, b.def.blast);
			if (!reason) continue;
			this.active = true;
			this.reason = reason;
			this.bomb = b;
			this.x = b.x;
			this.y = b.y;
			this.impactX = hit.x;
			this.impactY = hit.y;
			this.hold = 0;
			return true;
		}
		return false;
	}

	private stop(): void {
		this.active = false;
		this.bomb = null;
		this.reason = null;
		this.cooldown = COOLDOWN;
	}
}
