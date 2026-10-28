import { clamp } from '../engine/math';
import type { CameraRig } from './camera';

/** Aircraft a solo sortie starts with. */
export const SOLO_LIVES = 3;
/** Aircraft two co-op pilots share: three each, drawn from one pool. */
export const COOP_LIVES = 6;
/** Seconds between a crash and the next airframe. */
export const RESPAWN_DELAY = 3.2;
/** Training respawns faster. */
export const TRAINING_RESPAWN = 2;

/** One cockpit: the player's, or player two's. */
export interface Seat {
	/** Counts down to the next airframe while > 0. */
	timer: number;
	/** Shot down with no aircraft left: sits out the rest of the sortie. */
	out: boolean;
}

/** What happened to a seat this step. */
export type SeatEvent = 'lost' | 'respawn' | 'out' | null;

/**
 * The aircraft pool and respawn timers for everyone flying a sortie. Solo it
 * holds one seat; in co-op both pilots draw replacement airframes from the
 * same pool, and the sortie is lost only once every seat is out.
 */
export class Squadron {
	lives: number;
	readonly maxLives: number;
	readonly seats: Seat[];
	/** Aircraft lost this sortie. */
	lost = 0;

	constructor(seats: number, lives = seats > 1 ? COOP_LIVES : SOLO_LIVES) {
		this.lives = this.maxLives = lives;
		this.seats = Array.from({ length: seats }, () => ({ timer: 0, out: false }));
	}

	/**
	 * Advances one seat whose aircraft is (or isn't) a wreck. A fresh crash
	 * costs an aircraft (except in training) and starts the timer; when it runs
	 * out the seat gets a new airframe, or sits out if the pool is empty.
	 */
	update(i: number, crashed: boolean, dt: number, training = false): SeatEvent {
		const seat = this.seats[i];
		if (!seat || seat.out || !crashed) return null;
		if (seat.timer <= 0) {
			if (!training) this.lives--;
			this.lost++;
			seat.timer = training ? TRAINING_RESPAWN : RESPAWN_DELAY;
			return 'lost';
		}
		seat.timer -= dt;
		if (seat.timer > 0) return null;
		seat.timer = 0;
		if (this.lives > 0) return 'respawn';
		seat.out = true;
		return 'out';
	}

	/** Every seat is out of the fight: the sortie is lost. */
	allOut(): boolean {
		return this.seats.every((s) => s.out);
	}

	/** Seconds until seat i flies again, or 0 when it is flying or out. */
	respawnIn(i: number): number {
		const seat = this.seats[i];
		return seat && !seat.out && this.lives > 0 ? Math.max(0, seat.timer) : 0;
	}
}

/** Placement of each co-op pilot's name tag, pinned to the screen edge when off screen. */
export function pilotTag(
	cam: CameraRig,
	p: { x: number; y: number; z: number },
	cssW: number,
	cssH: number,
	margin = 28
): { x: number; y: number; off: boolean } | null {
	const s = cam.project(p.x, p.y, p.z, cssW, cssH);
	if (!s) return null;
	const x = clamp(s[0], margin, cssW - margin);
	const y = clamp(s[1], margin, cssH - margin);
	return { x, y, off: x !== s[0] || y !== s[1] };
}
