import { clamp, damp, lerp } from '../engine/math';
import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import type { Environment } from '../engine/renderer';
import type { World } from './world';

export type WeatherKind = 'clear' | 'mist';

/** What a wave's sky should be: the kind of weather and the mean wind (m/s, + blows toward +x). */
export interface WeatherSpec {
	kind: WeatherKind;
	wind: number;
}

export const CLEAR: WeatherSpec = { kind: 'clear', wind: 2 };

/** How thick the mist gets at full strength. */
const THICK: Record<WeatherKind, number> = { clear: 0, mist: 1 };
/** Water in the air soaks up infrared: heat seekers see this much less far in full mist. */
const IR_LOSS = 0.35;
const LABEL: Record<WeatherKind, string> = { clear: 'Clear', mist: 'Mist' };
/** Mist banks spawned per second at full strength, spread over the visible battlefield. */
const BANK_RATE = 7;
/** Seconds mist takes to roll in or burn off. */
const FRONT = 6;

/** Endless mode cycles these, one per wave, after two clear waves to learn the ropes. */
const ENDLESS: readonly WeatherSpec[] = [
	{ kind: 'clear', wind: 2 },
	{ kind: 'clear', wind: -3 },
	{ kind: 'mist', wind: 3 },
	{ kind: 'clear', wind: -5 },
	{ kind: 'clear', wind: 8 },
	{ kind: 'mist', wind: -2 },
	{ kind: 'clear', wind: 7 },
	{ kind: 'clear', wind: -8 },
	{ kind: 'mist', wind: 4 },
	{ kind: 'clear', wind: 11 }
];

/** Weather for an endless wave (1-based). */
export function weatherForWave(wave: number): WeatherSpec {
	return ENDLESS[(Math.max(1, wave) - 1) % ENDLESS.length];
}

/**
 * Wind and mist. Wind is a gusting horizontal air speed that bombs fly
 * through and smoke and gas drift on; mist thickens the low fog, rolls
 * soft banks across the ground and shortens what heat seekers can see.
 */
export class Weather {
	kind: WeatherKind = 'clear';
	/** Mean wind the gusts swing around. */
	baseWind = CLEAR.wind;
	/** Current wind in m/s along x. */
	wind = CLEAR.wind;
	/** Mist strength 0..1, eased so it rolls in and burns off. */
	mist = 0;
	private targetWind = CLEAR.wind;
	private spawnDebt = 0;

	/** Changes the target weather. `instant` skips the mist rolling in (new sortie, title). */
	set(spec: WeatherSpec, instant = false): void {
		this.kind = spec.kind;
		this.targetWind = spec.wind;
		if (instant) {
			this.baseWind = this.wind = spec.wind;
			this.mist = THICK[spec.kind];
			this.spawnDebt = 0;
		}
	}

	get label(): string {
		return LABEL[this.kind];
	}

	/** Fraction of its clear-weather range a heat seeker can see through. */
	irScale(): number {
		return 1 - IR_LOSS * this.mist;
	}

	update(w: World, dt: number): void {
		this.mist += clamp(THICK[this.kind] - this.mist, -dt / FRONT, dt / FRONT);
		this.baseWind = damp(this.baseWind, this.targetWind, 0.3, dt);
		// Two slow sines make gusts that never quite repeat.
		const t = w.time;
		const gust = 0.22 * (Math.sin(t * 0.37) * 0.7 + Math.sin(t * 1.31 + 2) * 0.3);
		this.wind = this.baseWind * (1 + gust);
		w.particles.windX = this.wind;
		if (dt <= 0) return;
		this.banks(w, dt);
	}

	/** Big, faint, slow puffs hugging the ground through the volume the camera can see. */
	private banks(w: World, dt: number): void {
		if (this.mist < 0.02) return;
		this.spawnDebt += BANK_RATE * this.mist * dt;
		const n = Math.floor(this.spawnDebt);
		this.spawnDebt -= n;
		const cam = w.camera;
		const tanY = Math.tan(cam.fovY / 2);
		const fx = w.fx;
		for (let i = 0; i < n; i++) {
			// Pick a depth first so the spread matches the view frustum at that depth.
			const z = rnd.range(-1.1, -0.25) * cam.dist;
			const halfW = (cam.dist - z) * tanY * cam.aspect;
			const x = cam.x + rnd.range(-1.2, 1.2) * halfW;
			const ground = w.surface.heightAtXZ(x, z);
			const scale = cam.dist - z;
			const life = rnd.range(9, 14);
			const p = fx.make(Shape.Smoke, x, ground + rnd.range(1, 10), z, life);
			p.vy = rnd.range(-0.1, 0.3);
			p.vz = rnd.gauss(0.4);
			p.size0 = scale * rnd.range(0.14, 0.22);
			p.size1 = p.size0 * rnd.range(1.3, 1.7);
			const a = rnd.range(0.05, 0.08) * this.mist;
			fx.color(p, 0.9, 0.92, 0.95, a, 0.9, 0.92, 0.95, 0);
			p.fadeIn = life * 0.4;
			p.spin = rnd.range(-0.05, 0.05);
			p.lit = 1;
			p.flags = PFlag.Wind;
			fx.ps.spawn(p);
		}
	}
}

/** Pales and thickens the low fog, softens the sun and washes out colour for the current mist. */
export function applyWeather(env: Environment, weather: Weather): void {
	const m = weather.mist;
	if (m <= 0.001) return;
	const sun = 1 - 0.35 * m;
	for (let i = 0; i < 3; i++) env.sunColor[i] *= sun;
	env.sunDisk *= 1 - 0.6 * m;
	env.stars *= 1 - 0.8 * m;
	// Light scatters through mist: shafts read stronger, not weaker.
	env.rays *= 1 + 0.5 * m;
	const grey = (env.fogColor[0] + env.fogColor[1] + env.fogColor[2]) / 3;
	// Mist is paler than haze: lift the fog toward a soft white of the same brightness.
	const pale = Math.min(1.1, grey * 1.35 + 0.06);
	for (let i = 0; i < 3; i++) {
		env.fogColor[i] = lerp(env.fogColor[i], pale * (0.97 + 0.02 * i), m * 0.6);
		env.fogSun[i] = lerp(env.fogSun[i], env.fogColor[i] * 1.2, m * 0.5);
		env.horizon[i] = lerp(env.horizon[i], env.fogColor[i], m * 0.55);
		env.cloudShadow[i] = lerp(env.cloudShadow[i], grey * 0.8, m * 0.4);
	}
	// Thick near the ground and thinning quickly with height, so high flight peeks out above it.
	env.fog[0] *= 1 + 1.6 * m;
	env.fog[1] *= 1 + 0.8 * m;
	env.fog[3] = Math.min(0.97, env.fog[3] + 0.04 * m);
	env.saturation *= 1 - 0.12 * m;
	env.contrast *= 1 - 0.06 * m;
}
