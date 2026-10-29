import { angleDiff } from '../engine/math';

/** Seconds of sink allowed for before an AI pilot reacts to the ground. */
const REACTION = 0.25;

/**
 * Height an AI pilot needs to pull out of its current dive: the arc it sinks
 * along at its turn rate before the nose comes level, plus a moment to react.
 * Zero while climbing or level.
 */
export function pullUpRoom(angle: number, speed: number, rate: number): number {
	const sink = -Math.sin(angle);
	if (sink <= 0) return 0;
	const radius = speed / Math.max(rate, 0.1);
	return radius * (1 - Math.sqrt(1 - sink * sink)) + speed * sink * REACTION;
}

/**
 * Signed rotation toward `target`. Close to the ground, a reversal (a turn
 * of more than a right angle) goes up and over rather than nose-down through
 * the terrain, whichever way is shorter.
 */
export function safeTurn(angle: number, target: number, low: boolean): number {
	const d = angleDiff(angle, target);
	if (!low || Math.abs(d) <= Math.PI / 2) return d;
	// Facing right the nose rises as the angle grows; facing left as it shrinks.
	const up = Math.cos(angle) >= 0 ? 1 : -1;
	return Math.sign(d) === up ? d : d - Math.sign(d) * 2 * Math.PI;
}

/** Nose levelled off if it still points into the ground. */
export function levelOff(angle: number): number {
	if (Math.sin(angle) >= 0) return angle;
	return Math.cos(angle) >= 0 ? 0 : Math.PI;
}
