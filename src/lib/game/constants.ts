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
	enemySpawnX: 3780,
	baseHeight: 2,
	ceiling: 330,
	gravity: 13
} as const;

/** Terrain sample rows along Z (far to near). Row 0 is the farthest. Includes z = 0 exactly. */
export const TERRAIN_ROWS: readonly number[] = [
	-420, -330, -260, -205, -160, -125, -97, -76, -60, -48, -38, -30, -24, -19, -15, -12, -9.5, -7.5,
	-6, -4.5, -3, -2, -1, 0, 1, 2, 3, 4.5, 6, 8, 10.5, 13.5, 17, 22, 28, 36, 46, 60, 80, 105, 135,
	175, 225, 290, 380, 500
];
