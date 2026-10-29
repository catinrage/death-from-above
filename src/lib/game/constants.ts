/** World layout in metres. +X runs from the friendly airbase toward the enemy, +Z toward the camera. */
export const WORLD = {
	/**
	 * Generated landscape. It reaches well past where the aircraft can go so the
	 * widest camera never sees its edge (the camera sees ~1 km to each side).
	 */
	terrainMinX: -1800,
	terrainMaxX: 5450,
	/** Area the player may fly in before boundary warnings. */
	arenaMinX: -260,
	arenaMaxX: 3880,
	/** Metres past the arena at which the aircraft turns itself back. */
	arenaTurnback: 220,
	/** Friendly airbase occupies [baseMinX, baseMaxX]. */
	baseMinX: -80,
	baseMaxX: 495,
	runwayMinX: 30,
	runwayMaxX: 435,
	/** Ground units that reach this X start shelling the base. */
	baseAttackX: 585,
	/** The enemy HQ compound occupies [hqMinX, hqMaxX]; their columns form up behind it. */
	hqMinX: 3570,
	hqMaxX: 3760,
	/** Our HQ in command mode: theirs mirrored about the bridge, in front of our airfield. */
	ourHqMinX: 560,
	ourHqMaxX: 750,
	enemySpawnX: 3780,
	/** The enemy airfield behind their HQ: ours mirrored, its runway pointing back at us. */
	enemyBaseMinX: 3825,
	enemyBaseMaxX: 4400,
	enemyRunwayMinX: 3885,
	enemyRunwayMaxX: 4290,
	baseHeight: 2,
	ceiling: 330,
	gravity: 13
} as const;

/** Terrain sample rows along Z (far to near). Row 0 is the farthest. Includes z = 0 exactly. */
export const TERRAIN_ROWS: readonly number[] = [
	-420, -385, -350, -318, -291, -276, -261, -246, -231, -216, -201, -186, -171, -156, -141, -126,
	-111, -96, -83, -71, -61, -53, -46, -39, -34, -29, -25, -22, -19, -16, -14, -12, -9.5, -7.5, -6,
	-4.5, -3, -2, -1, 0, 1, 2, 3, 4.5, 6, 8, 10.5, 13.5, 16, 19, 23, 28, 34, 40, 48, 58, 70, 84, 100,
	120, 144, 173, 207, 241, 275, 309, 343, 377, 411, 445, 472, 500, 545, 600, 670, 760, 870
];
