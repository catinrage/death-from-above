import type { Environment, RGB } from '../engine/renderer';
import { DEG, lerp, vec3 } from '../engine/math';

interface Preset {
	name: string;
	elevation: number;
	azimuth: number;
	sunColor: RGB;
	sunDisk: number;
	ambSky: RGB;
	ambGround: RGB;
	zenith: RGB;
	horizon: RGB;
	fogColor: RGB;
	fogSun: RGB;
	fog: [number, number, number, number];
	cloudLit: RGB;
	cloudShadow: RGB;
	cloud: [number, number, number, number];
	stars: number;
	exposure: number;
	saturation: number;
	contrast: number;
	tint: RGB;
	bloom: number;
	rays: number;
	vignette: number;
	grain: number;
}

const k = (c: RGB, s: number): RGB => [c[0] * s, c[1] * s, c[2] * s];

/** Time-of-day looks a battle cycles through, one step per wave. */
export const PRESETS: readonly Preset[] = [
	{
		name: 'Golden Hour',
		elevation: 7.5,
		azimuth: 40,
		sunColor: k([1.0, 0.68, 0.4], 4.4),
		sunDisk: 14,
		ambSky: k([0.3, 0.37, 0.58], 0.85),
		ambGround: k([0.22, 0.15, 0.09], 0.75),
		zenith: [0.1, 0.22, 0.52],
		horizon: [0.92, 0.58, 0.36],
		fogColor: [0.46, 0.4, 0.42],
		fogSun: [1.05, 0.66, 0.38],
		fog: [0.00052, 0.003, 0, 0.88],
		cloudLit: [1.4, 0.95, 0.68],
		cloudShadow: [0.36, 0.34, 0.46],
		cloud: [0.5, 0.26, 0.92, 0.0035],
		stars: 0,
		exposure: 0.95,
		saturation: 1.15,
		contrast: 1.12,
		tint: [1.04, 1.0, 0.95],
		bloom: 0.38,
		rays: 0.45,
		vignette: 0.38,
		grain: 0.03
	},
	{
		name: 'Sunset',
		elevation: 3.2,
		azimuth: 54,
		sunColor: k([1.0, 0.47, 0.22], 3.1),
		sunDisk: 12,
		ambSky: k([0.28, 0.27, 0.45], 0.85),
		ambGround: k([0.2, 0.11, 0.07], 0.7),
		zenith: [0.07, 0.1, 0.3],
		horizon: [1.0, 0.44, 0.24],
		fogColor: [0.4, 0.29, 0.33],
		fogSun: [1.15, 0.52, 0.26],
		fog: [0.0006, 0.003, 0, 0.9],
		cloudLit: [1.5, 0.66, 0.4],
		cloudShadow: [0.3, 0.24, 0.37],
		cloud: [0.5, 0.3, 0.9, 0.0035],
		stars: 0.05,
		exposure: 1.05,
		saturation: 1.15,
		contrast: 1.08,
		tint: [1.05, 0.98, 0.94],
		bloom: 0.45,
		rays: 0.65,
		vignette: 0.42,
		grain: 0.035
	},
	{
		name: 'Dusk',
		elevation: -1.5,
		azimuth: 58,
		sunColor: k([0.95, 0.38, 0.2], 1.1),
		sunDisk: 0,
		ambSky: k([0.19, 0.2, 0.36], 0.8),
		ambGround: k([0.09, 0.07, 0.07], 0.8),
		zenith: [0.035, 0.05, 0.14],
		horizon: [0.68, 0.28, 0.21],
		fogColor: [0.23, 0.18, 0.25],
		fogSun: [0.8, 0.34, 0.2],
		fog: [0.00085, 0.0035, 0, 0.94],
		cloudLit: [0.7, 0.32, 0.26],
		cloudShadow: [0.1, 0.09, 0.16],
		cloud: [0.48, 0.3, 0.85, 0.0035],
		stars: 0.35,
		exposure: 1.25,
		saturation: 1.1,
		contrast: 1.08,
		tint: [1.0, 0.98, 1.02],
		bloom: 0.75,
		rays: 0.3,
		vignette: 0.45,
		grain: 0.04
	},
	{
		name: 'Night',
		elevation: 38,
		azimuth: -32,
		sunColor: k([0.5, 0.62, 1.0], 0.5),
		sunDisk: 4,
		ambSky: k([0.07, 0.1, 0.2], 1.0),
		ambGround: k([0.025, 0.025, 0.04], 1.0),
		zenith: [0.006, 0.01, 0.03],
		horizon: [0.045, 0.055, 0.1],
		fogColor: [0.035, 0.045, 0.08],
		fogSun: [0.09, 0.11, 0.17],
		fog: [0.0009, 0.003, 0, 0.95],
		cloudLit: [0.13, 0.15, 0.24],
		cloudShadow: [0.02, 0.025, 0.045],
		cloud: [0.42, 0.3, 0.8, 0.003],
		stars: 1,
		exposure: 1.45,
		saturation: 1.0,
		contrast: 1.1,
		tint: [0.95, 1.0, 1.08],
		bloom: 0.9,
		rays: 0.0,
		vignette: 0.5,
		grain: 0.045
	},
	{
		name: 'Dawn',
		elevation: 7,
		azimuth: -46,
		sunColor: k([1.0, 0.64, 0.56], 2.7),
		sunDisk: 20,
		ambSky: k([0.3, 0.33, 0.5], 0.85),
		ambGround: k([0.17, 0.13, 0.12], 0.8),
		zenith: [0.2, 0.28, 0.52],
		horizon: [0.95, 0.66, 0.6],
		fogColor: [0.6, 0.52, 0.56],
		fogSun: [1.2, 0.78, 0.66],
		fog: [0.0009, 0.0032, 0, 0.92],
		cloudLit: [1.35, 0.9, 0.85],
		cloudShadow: [0.4, 0.38, 0.5],
		cloud: [0.44, 0.3, 0.88, 0.0035],
		stars: 0.08,
		exposure: 1.0,
		saturation: 1.08,
		contrast: 1.05,
		tint: [1.02, 0.99, 1.0],
		bloom: 0.55,
		rays: 0.6,
		vignette: 0.38,
		grain: 0.03
	}
];

const FILL_DIR = vec3.normalize(vec3.create(), [-0.35, 0.62, 0.7]);

function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
	const el = elevationDeg * DEG,
		az = azimuthDeg * DEG;
	return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
	lerp(a[0], b[0], t),
	lerp(a[1], b[1], t),
	lerp(a[2], b[2], t)
];

function mix4(
	a: [number, number, number, number],
	b: [number, number, number, number],
	t: number
): [number, number, number, number] {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

/**
 * Environment for a continuous phase: integer phases are exact presets,
 * fractions blend between consecutive presets (wrapping around).
 */
export function environmentAt(phase: number): Environment {
	const n = PRESETS.length;
	const p = ((phase % n) + n) % n;
	const i = Math.floor(p);
	const t = p - i;
	const a = PRESETS[i],
		b = PRESETS[(i + 1) % n];
	// Fade the light out and back in when the key light swaps between sun and moon.
	const da = sunDirection(a.elevation, a.azimuth),
		db = sunDirection(b.elevation, b.azimuth);
	const swap = da[0] * db[0] + da[1] * db[1] + da[2] * db[2] < 0.8;
	const dir = swap
		? t < 0.5
			? da
			: db
		: [lerp(da[0], db[0], t), lerp(da[1], db[1], t), lerp(da[2], db[2], t)];
	const lightK = swap ? Math.abs(t - 0.5) * 2 : 1;
	const sunDir = vec3.normalize(vec3.create(), dir);
	const sunColor = swap
		? ((t < 0.5 ? a.sunColor : b.sunColor).map((c) => c * lightK) as RGB)
		: mixRGB(a.sunColor, b.sunColor, t);
	const ambSky = mixRGB(a.ambSky, b.ambSky, t);
	const fillK = 1.6;
	return {
		sunDir,
		sunColor,
		fillDir: FILL_DIR,
		fillColor: [
			ambSky[0] * fillK + sunColor[0] * 0.05,
			ambSky[1] * fillK + sunColor[1] * 0.05,
			ambSky[2] * fillK + sunColor[2] * 0.05
		],
		sunDisk: lerp(a.sunDisk, b.sunDisk, t) * (swap ? lightK : 1),
		ambSky,
		ambGround: mixRGB(a.ambGround, b.ambGround, t),
		zenith: mixRGB(a.zenith, b.zenith, t),
		horizon: mixRGB(a.horizon, b.horizon, t),
		fogColor: mixRGB(a.fogColor, b.fogColor, t),
		fogSun: mixRGB(a.fogSun, b.fogSun, t),
		fog: mix4(a.fog, b.fog, t),
		cloudLit: mixRGB(a.cloudLit, b.cloudLit, t),
		cloudShadow: mixRGB(a.cloudShadow, b.cloudShadow, t),
		cloud: mix4(a.cloud, b.cloud, t),
		stars: lerp(a.stars, b.stars, t),
		exposure: lerp(a.exposure, b.exposure, t),
		saturation: lerp(a.saturation, b.saturation, t),
		contrast: lerp(a.contrast, b.contrast, t),
		tint: mixRGB(a.tint, b.tint, t),
		bloom: lerp(a.bloom, b.bloom, t),
		rays: lerp(a.rays, b.rays, t),
		vignette: lerp(a.vignette, b.vignette, t),
		grain: lerp(a.grain, b.grain, t)
	};
}

export function presetName(phase: number): string {
	const n = PRESETS.length;
	return PRESETS[((Math.round(phase) % n) + n) % n].name;
}
