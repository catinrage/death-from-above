import { clamp, smoothstep } from '../engine/math';
import type { AircraftDef } from './defs-aircraft';
import type { PilotInput } from './player';
import type { Vec3T } from './types';

/** Seconds for a full retract or extend cycle. */
export const GEAR_CYCLE = 2.5;
/** Height of the aircraft's origin above the runway when it sits on its wheels. */
export const GEAR_HEIGHT = 1.7;
/** Extra drag with the gear fully down, as a fraction of the clean airframe's: about a quarter off top speed. */
export const GEAR_DRAG = 0.9;
/** Rotation speed as a multiple of the stall speed. */
export const ROTATE_FACTOR = 1.1;
/** Nose attitude while rolling, and the most the tail allows when rotating. */
export const GROUND_PITCH = 0.03;
export const MAX_ROTATION = 0.22;
/** Nose-up attitude at which an aircraft at rotation speed leaves the runway. */
export const LIFTOFF_PITCH = 0.08;
/** Wheel brakes, m/s². */
export const WHEEL_BRAKE = 16;
/** Rolling resistance on the runway (fraction of speed lost per second). */
export const ROLLING_DRAG = 0.04;

/** Something the gear did this step that is worth a sound. */
export type GearEvent = 'motor' | 'refused' | 'down' | 'up';

/** Where the legs attach (local space): nose leg, the right main leg (mirrored), wheel radius. */
export interface GearLayout {
	nose: Vec3T;
	main: Vec3T;
	wheel: number;
}

/**
 * Retractable undercarriage: commanded up or down, it travels between the
 * two over `GEAR_CYCLE` seconds. `parked` is the wheel brakes holding the
 * aircraft at the start of a sortie until the pilot does anything.
 */
export class Gear {
	/** Commanded position. */
	down: boolean;
	/** 0 stowed .. 1 down and locked. */
	level: number;
	parked = false;

	constructor(down = false) {
		this.down = down;
		this.level = down ? 1 : 0;
	}

	/** Down and locked: the only state a touchdown survives. */
	get locked(): boolean {
		return this.down && this.level >= 1;
	}

	get moving(): boolean {
		return this.down ? this.level < 1 : this.level > 0;
	}

	/** Eased extension for drawing the legs. */
	get extension(): number {
		return smoothstep(0, 1, this.level);
	}

	/** Drag multiplier on the airframe. */
	get drag(): number {
		return 1 + GEAR_DRAG * this.level;
	}

	/** Commands the other position. On the ground the gear stays where it is. */
	toggle(onGround: boolean): GearEvent {
		if (onGround && this.down) return 'refused';
		this.down = !this.down;
		return 'motor';
	}

	/** Snaps the gear down and locked (parking on the runway). */
	extend(): void {
		this.down = true;
		this.level = 1;
	}

	/** Runs the gear motor; reports when a leg locks at either end. */
	update(dt: number): GearEvent | null {
		if (!this.moving) return null;
		this.level = clamp(this.level + (this.down ? dt : -dt) / GEAR_CYCLE, 0, 1);
		if (this.down && this.level >= 1) return 'down';
		if (!this.down && this.level <= 0) return 'up';
		return null;
	}
}

/** Speed at which the nose may come up for take-off. */
export function rotationSpeed(def: AircraftDef): number {
	return def.stallSpeed * ROTATE_FACTOR;
}

/** Any steering or throttle input lets the wheel brakes off at the start of a sortie. */
export function releasesBrakes(inp: PilotInput): boolean {
	return inp.boost || Math.hypot(inp.steerX, inp.steerY) > 0.25;
}

/**
 * The nose attitude the wheels allow: held level below rotation speed, and
 * never so high the tail scrapes.
 */
export function groundPitch(pitch: number, speed: number, vr: number): number {
	return clamp(pitch, GROUND_PITCH, speed >= vr ? MAX_ROTATION : GROUND_PITCH);
}

/**
 * The gear layout for an airframe: its own, or one sized from its radius
 * (nose leg well forward, main legs just behind the centre) with the wheels
 * resting on the runway when the aircraft sits at `GEAR_HEIGHT`.
 */
export function gearLayout(def: AircraftDef): GearLayout {
	if (def.gear) return def.gear;
	const r = def.radius / def.scale;
	return {
		nose: [r * 0.6, -0.35, 0],
		main: [-r * 0.08, -0.45, Math.min(r * 0.3, Math.abs(def.tip[2]) * 0.45)],
		wheel: clamp(def.radius * 0.065, 0.3, 0.7) / def.scale
	};
}
