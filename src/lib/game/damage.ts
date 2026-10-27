import { clamp } from '../engine/math';
import type { Rng } from '../engine/rng';

/** Aircraft systems a hit can knock out; only a landing on the runway fixes them. */
export type Component = 'engine' | 'wing' | 'hydraulics';
export const COMPONENTS: readonly Component[] = ['engine', 'wing', 'hydraulics'];

/** Severity 0 (working) .. 1 (barely working) for each system. */
export type Systems = Record<Component, number>;

export const COMPONENT_INFO: Record<Component, { label: string; effect: string }> = {
	engine: { label: 'ENGINE HIT', effect: 'Thrust reduced' },
	wing: { label: 'WING DAMAGED', effect: 'Aircraft pulls to one side' },
	hydraulics: { label: 'HYDRAULICS HIT', effect: 'Bomb bay sticking' }
};

/** Causes that wear armour down but never hit a particular system. */
const NO_COMPONENT = new Set(['bounds', 'crash']);
/** Thrust lost with a fully damaged engine. */
export const ENGINE_THRUST_LOSS = 0.45;
/** Turn rate (rad/s) a fully damaged wing pulls the nose by. */
export const WING_PULL = 0.32;
/** Share of the turn rate a fully damaged wing loses. */
export const WING_AGILITY_LOSS = 0.25;
/** Chance a fully damaged bay jams a release. */
export const BAY_JAM = 0.7;
/** Severity repaired per second while landed. */
export const LANDED_REPAIR_RATE = 0.4;

export function noDamage(): Systems {
	return { engine: 0, wing: 0, hydraulics: 0 };
}

/**
 * Which system (if any) a hit of this size damages, and by how much. Bigger
 * hits are likelier to break something and break it worse; chip damage rarely does.
 */
export function rollComponentHit(
	amount: number,
	hpMax: number,
	cause: string,
	r: Rng
): { component: Component; severity: number } | null {
	if (NO_COMPONENT.has(cause) || amount <= 0) return null;
	const frac = amount / hpMax;
	if (!r.chance(clamp(frac * 2.2, 0, 0.75))) return null;
	return { component: r.pick(COMPONENTS), severity: clamp(0.3 + frac * 2.5, 0.3, 1) };
}

/** Thrust multiplier for an engine at this severity. */
export function engineFactor(severity: number): number {
	return 1 - ENGINE_THRUST_LOSS * severity;
}

/** Whether a bomb release jams in a bay with this much hydraulic damage. */
export function bayJams(severity: number, r: Rng): boolean {
	return severity > 0 && r.chance(BAY_JAM * severity);
}

/** Heals every system by one landed step; returns true if anything is still broken. */
export function repairSystems(s: Systems, dt: number): boolean {
	let broken = false;
	for (const c of COMPONENTS) {
		s[c] = Math.max(0, s[c] - LANDED_REPAIR_RATE * dt);
		if (s[c] > 0) broken = true;
	}
	return broken;
}
