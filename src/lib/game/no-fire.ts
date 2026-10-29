/** A protected stretch of the battlefield: a village or a field hospital full of civilians. */
export interface NoFireZone {
	kind: 'village' | 'hospital';
	name: string;
	/** Centre of the settlement along the battle line. */
	x: number;
	/** Half-width of the protected stretch. */
	half: number;
	/** Civilians living there. */
	population: number;
}

/**
 * Two settlements sit between the airfield and the enemy's line, so columns
 * march straight through them. Their x matches the village sites in props.
 */
export const NO_FIRE_ZONES: readonly NoFireZone[] = [
	{ kind: 'hospital', name: 'Field hospital', x: 1500, half: 72, population: 8 },
	{ kind: 'village', name: 'Village', x: 2650, half: 72, population: 10 }
];

/** Score lost for each civilian the player kills. */
export const CIVILIAN_PENALTY = 150;
/** Score lost for each home the player knocks down in a no-fire zone. */
export const HOUSE_PENALTY = 100;
/** Score lost for flattening the hospital itself. */
export const HOSPITAL_PENALTY = 600;

/** The no-fire zone covering x, if any. */
export function zoneAt(x: number, zones: readonly NoFireZone[] = NO_FIRE_ZONES): NoFireZone | null {
	for (const z of zones) if (Math.abs(x - z.x) <= z.half) return z;
	return null;
}

/**
 * Slides an x position out of every no-fire zone so enemy emplacements never
 * dig in among the houses. Goes to whichever edge is nearer.
 */
export function clearOfZones(x: number, margin = 20, zones = NO_FIRE_ZONES): number {
	const z = zoneAt(x, zones);
	if (!z) return x;
	return x < z.x ? z.x - z.half - margin : z.x + z.half + margin;
}
