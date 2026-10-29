import { angleDiff } from '../engine/math';

/** An aircraft that can swing round in depth: position, heading and attitude. */
export interface FlatFlier {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	/** Heading in the battle plane, roll about the nose, and turn away from it (radians). */
	angle: number;
	roll: number;
	yaw: number;
}

/** Reversals sharper than this (radians) are flown flat instead of as a half loop. */
const REVERSAL = 2.2;
/** Height (m) a flat turn needs under it; lower down the usual pull-up wins. */
const MIN_AGL = 60;
/** The turn swings out this far in depth, as a share of the way it covers along the road. */
const DEPTH = 0.35;
/** Bank angle at the middle of the turn. */
const BANK = 0.55;

/**
 * A heavy aircraft turning round the way a real one does: level, banked,
 * swinging out in depth, instead of looping over in the battle plane (which
 * would cost a bomber 150 m of height or take it through the ceiling).
 */
export class FlatTurn {
	active = false;
	private from = 0;
	private sweep = 0;

	/** Whether a heading change from `angle` to `target` should be flown flat. */
	wants(angle: number, target: number, agl: number): boolean {
		if (this.active || agl < MIN_AGL) return false;
		const across = Math.cos(angle) >= 0 !== Math.cos(target) >= 0;
		return across && Math.abs(angleDiff(angle, target)) > REVERSAL;
	}

	/** Starts the turn: the same attitude, said as a yaw from the road (0 facing +x, π facing -x). */
	start(f: FlatFlier): void {
		this.from = Math.cos(f.angle) >= 0 ? 0 : Math.PI;
		this.sweep = 0;
		this.active = true;
		f.yaw = this.from;
		f.angle = 0;
		f.roll = 0;
	}

	/** One step round at `rate` rad/s; it ends facing back along the road, level. */
	step(f: FlatFlier, speed: number, rate: number, dt: number): void {
		this.sweep = Math.min(Math.PI, this.sweep + rate * dt);
		f.yaw = this.from + this.sweep;
		f.roll = -BANK * Math.sin(this.sweep);
		f.vx = Math.cos(f.yaw) * speed;
		f.vy = 0;
		f.x += f.vx * dt;
		f.z -= Math.sin(f.yaw) * speed * DEPTH * dt;
		if (this.sweep < Math.PI) return;
		// Round: back to flying along the road, the other way.
		const right = this.from !== 0;
		this.active = false;
		f.yaw = 0;
		f.angle = right ? 0 : Math.PI;
		f.roll = right ? 0 : Math.PI;
		f.vx = Math.cos(f.angle) * speed;
	}
}
