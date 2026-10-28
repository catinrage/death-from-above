import type { Environment, RGB } from '../engine/renderer';
import type { MeshName } from '../models';
import type { TerrainShape } from './terrain';

export type BiomeId = 'temperate' | 'desert' | 'snow' | 'jungle' | 'city';

/** Ground colours the terrain shader blends between (linear RGB). */
export interface GroundPalette {
	lush: RGB;
	dry: RGB;
	dirt: RGB;
	rock: RGB;
	road: RGB;
}

/** What grows and stands along the battlefield. */
export interface Flora {
	/** Forest trees with relative weights. */
	trees: readonly (readonly [MeshName, number])[];
	/** Scale on how many trees the forests hold. */
	forest: number;
	/** Lowest forest density anywhere (0 leaves open clearings between woods). */
	cover: number;
	/** Undergrowth beside trees and in the foreground (empty for none). */
	bushes: readonly MeshName[];
	/** Scale on how often undergrowth appears. */
	undergrowth: number;
	/** Scale on how many boulders lie about. */
	rocks: number;
	/** Foreground tufts (grass, ferns); empty for bare ground. */
	grass: readonly MeshName[];
	/** Tufts tried per foreground step (temperate is 3). */
	grassDensity: number;
	/** Colour multiplied into trees, undergrowth and tufts. */
	foliage: RGB;
	/** Farm villages, or a city of blocks behind the road. */
	settlement: 'village' | 'city';
}

/**
 * Multipliers laid over each time-of-day preset, so a desert noon and a snowy
 * noon still follow the same day/night cycle but read differently.
 */
export interface Grade {
	tint: RGB;
	saturation: number;
	contrast: number;
	exposure: number;
	/** Scale on fog density. */
	fog: number;
	/** Multiplied into fog, horizon and the sunward fog glow. */
	haze: RGB;
	/** Multiplied into light bounced up off the ground. */
	bounce: RGB;
	/** Scale on cloud coverage. */
	clouds: number;
}

export interface Biome {
	id: BiomeId;
	name: string;
	/** One line for menus. */
	blurb: string;
	ground: GroundPalette;
	shape: TerrainShape;
	flora: Flora;
	grade: Grade;
	/** Colour multiplied into the distant mountain ranges. */
	mountains: RGB;
}

const NEUTRAL: Grade = {
	tint: [1, 1, 1],
	saturation: 1,
	contrast: 1,
	exposure: 1,
	fog: 1,
	haze: [1, 1, 1],
	bounce: [1, 1, 1],
	clouds: 1
};

export const BIOMES: Readonly<Record<BiomeId, Biome>> = {
	temperate: {
		id: 'temperate',
		name: 'Valley',
		blurb: 'Farmland, pine woods and a river valley',
		ground: {
			lush: [0.085, 0.1, 0.045],
			dry: [0.2, 0.15, 0.072],
			dirt: [0.13, 0.095, 0.065],
			rock: [0.17, 0.155, 0.135],
			road: [0.19, 0.135, 0.08]
		},
		shape: { hills: 1, ridges: 1, dunes: 0, roughness: 1 },
		flora: {
			trees: [
				['pine0', 18],
				['pine1', 18],
				['pine2', 17],
				['broad0', 13],
				['broad1', 13],
				['broad2', 14],
				['deadTree', 7]
			],
			forest: 1,
			cover: 0,
			bushes: ['bush0', 'bush1'],
			undergrowth: 1,
			rocks: 1,
			grass: ['grass0', 'grass1', 'grass2'],
			grassDensity: 3,
			foliage: [1, 1, 1],
			settlement: 'village'
		},
		grade: NEUTRAL,
		mountains: [1, 1, 1]
	},
	desert: {
		id: 'desert',
		name: 'Desert',
		blurb: 'Dunes, cactus scrub and a palm-lined oasis river',
		ground: {
			lush: [0.4, 0.3, 0.18],
			dry: [0.46, 0.35, 0.2],
			dirt: [0.33, 0.22, 0.12],
			rock: [0.3, 0.2, 0.13],
			road: [0.25, 0.18, 0.11]
		},
		shape: { hills: 0.55, ridges: 0.8, dunes: 1, roughness: 0.4 },
		flora: {
			trees: [
				['cactus0', 30],
				['cactus1', 30],
				['palm0', 12],
				['palm1', 12],
				['deadTree', 10]
			],
			forest: 0.22,
			cover: 0,
			bushes: ['bush1'],
			undergrowth: 0.35,
			rocks: 1.8,
			grass: ['grass1'],
			grassDensity: 0.6,
			foliage: [1.15, 1.0, 0.7],
			settlement: 'village'
		},
		grade: {
			tint: [1.04, 1.0, 0.93],
			saturation: 0.95,
			contrast: 1.08,
			exposure: 1.0,
			fog: 0.75,
			haze: [1.12, 1.02, 0.88],
			bounce: [1.5, 1.25, 0.95],
			clouds: 0.35
		},
		mountains: [1.6, 1.15, 0.78]
	},
	snow: {
		id: 'snow',
		name: 'Snowfield',
		blurb: 'Frozen pine forest under high, white ridges',
		ground: {
			lush: [0.64, 0.68, 0.76],
			dry: [0.72, 0.74, 0.8],
			dirt: [0.46, 0.46, 0.5],
			rock: [0.2, 0.2, 0.22],
			road: [0.2, 0.18, 0.17]
		},
		shape: { hills: 1.3, ridges: 1.6, dunes: 0, roughness: 0.8 },
		flora: {
			trees: [
				['snowPine0', 30],
				['snowPine1', 30],
				['snowPine2', 30],
				['deadTree', 6]
			],
			forest: 1.15,
			cover: 0.35,
			bushes: [],
			undergrowth: 0,
			rocks: 1.2,
			grass: ['grass2'],
			grassDensity: 0.4,
			foliage: [0.85, 0.9, 1.0],
			settlement: 'village'
		},
		grade: {
			tint: [0.94, 0.99, 1.08],
			saturation: 0.8,
			contrast: 1.04,
			exposure: 0.84,
			fog: 1.25,
			haze: [1.1, 1.15, 1.28],
			bounce: [2.2, 2.3, 2.6],
			clouds: 1.25
		},
		mountains: [2.4, 2.5, 2.8]
	},
	jungle: {
		id: 'jungle',
		name: 'Jungle',
		blurb: 'Dense rainforest, ferns and steaming air',
		ground: {
			lush: [0.04, 0.085, 0.03],
			dry: [0.09, 0.1, 0.04],
			dirt: [0.15, 0.08, 0.045],
			rock: [0.12, 0.12, 0.1],
			road: [0.22, 0.11, 0.06]
		},
		shape: { hills: 1.15, ridges: 1.2, dunes: 0, roughness: 1.3 },
		flora: {
			trees: [
				['jungle0', 34],
				['jungle1', 34],
				['palm0', 10],
				['palm1', 10],
				['broad0', 12]
			],
			forest: 1.9,
			cover: 1.0,
			bushes: ['bush0'],
			undergrowth: 2.2,
			rocks: 0.6,
			grass: ['fern', 'grass0', 'fern'],
			grassDensity: 3.5,
			foliage: [0.8, 1.12, 0.78],
			settlement: 'village'
		},
		grade: {
			tint: [0.96, 1.04, 0.95],
			saturation: 1.12,
			contrast: 1.02,
			exposure: 1.0,
			fog: 1.45,
			haze: [0.88, 1.06, 0.92],
			bounce: [0.75, 1.1, 0.7],
			clouds: 1.3
		},
		mountains: [0.8, 1.05, 0.75]
	},
	city: {
		id: 'city',
		name: 'City',
		blurb: 'Apartment blocks and towers along a ruined avenue',
		ground: {
			lush: [0.09, 0.095, 0.06],
			dry: [0.14, 0.125, 0.1],
			dirt: [0.12, 0.11, 0.1],
			rock: [0.16, 0.16, 0.16],
			road: [0.07, 0.07, 0.075]
		},
		shape: { hills: 0.35, ridges: 0.7, dunes: 0, roughness: 0.35 },
		flora: {
			trees: [
				['broad0', 40],
				['broad2', 40],
				['deadTree', 20]
			],
			forest: 0.25,
			cover: 0,
			bushes: ['bush0'],
			undergrowth: 0.4,
			rocks: 0.3,
			grass: ['grass0', 'grass1'],
			grassDensity: 1.2,
			foliage: [0.9, 0.95, 0.85],
			settlement: 'city'
		},
		grade: {
			tint: [0.98, 0.98, 1.03],
			saturation: 0.82,
			contrast: 1.1,
			exposure: 0.98,
			fog: 1.15,
			haze: [0.95, 0.95, 1.0],
			bounce: [0.9, 0.9, 0.95],
			clouds: 1.1
		},
		mountains: [0.85, 0.85, 0.9]
	}
};

export const BIOME_ORDER: readonly BiomeId[] = ['temperate', 'desert', 'snow', 'jungle', 'city'];

export function isBiome(id: unknown): id is BiomeId {
	return typeof id === 'string' && id in BIOMES;
}

const mul = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** Lays a biome's colour grading over a time-of-day environment (returns a new object). */
export function gradeEnvironment(env: Environment, biome: Biome): Environment {
	const g = biome.grade;
	if (g === NEUTRAL) return env;
	return {
		...env,
		ambGround: mul(env.ambGround, g.bounce),
		horizon: mul(env.horizon, g.haze),
		fogColor: mul(env.fogColor, g.haze),
		fogSun: mul(env.fogSun, g.haze),
		fog: [env.fog[0] * g.fog, env.fog[1], env.fog[2], env.fog[3]],
		cloud: [Math.min(1, env.cloud[0] * g.clouds), env.cloud[1], env.cloud[2], env.cloud[3]],
		exposure: env.exposure * g.exposure,
		saturation: env.saturation * g.saturation,
		contrast: env.contrast * g.contrast,
		tint: mul(env.tint, g.tint)
	};
}
