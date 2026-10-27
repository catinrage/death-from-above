import { clamp, damp, lerp } from '../engine/math';
import { PFlag } from '../engine/particles';
import { fx as rnd } from '../engine/rng';
import { Shape } from '../engine/shaders/particles';
import type { Environment } from '../engine/renderer';
import type { World } from './world';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow';

/** What a wave's sky should be: the kind of weather and the mean wind (m/s, + blows toward +x). */
export interface WeatherSpec {
	kind: WeatherKind;
	wind: number;
}

export const CLEAR: WeatherSpec = { kind: 'clear', wind: 2 };

/** How hard it falls and how grey the sky gets at full strength. */
const PRECIP: Record<WeatherKind, number> = { clear: 0, rain: 0.7, storm: 1, snow: 0.8 };
const COVER: Record<WeatherKind, number> = { clear: 0, rain: 0.75, storm: 1, snow: 0.6 };
/** Water in the air soaks up infrared: heat seekers see this much less far at full strength. */
const IR_LOSS: Record<WeatherKind, number> = { clear: 0, rain: 0.45, storm: 0.55, snow: 0.3 };
const LABEL: Record<WeatherKind, string> = {
	clear: 'Clear',
	rain: 'Rain',
	storm: 'Thunderstorm',
	snow: 'Snow'
};
/** Particles spawned per second at full strength, spread over the visible battlefield. */
const RAIN_RATE = 1500;
const SNOW_RATE = 650;
/** Seconds a front takes to roll in or clear. */
const FRONT = 6;
const SPEED_OF_SOUND = 340;

/** Endless mode cycles these, one per wave, after two clear waves to learn the ropes. */
const ENDLESS: readonly WeatherSpec[] = [
	{ kind: 'clear', wind: 2 },
	{ kind: 'clear', wind: -3 },
	{ kind: 'rain', wind: 6 },
	{ kind: 'clear', wind: -5 },
	{ kind: 'storm', wind: -11 },
	{ kind: 'snow', wind: 4 },
	{ kind: 'clear', wind: 7 },
	{ kind: 'rain', wind: -8 },
	{ kind: 'snow', wind: -6 },
	{ kind: 'storm', wind: 12 }
];

/** Weather for an endless wave (1-based). */
export function weatherForWave(wave: number): WeatherSpec {
	return ENDLESS[(Math.max(1, wave) - 1) % ENDLESS.length];
}

interface Thunder {
	x: number;
	y: number;
	delay: number;
	power: number;
}

/**
 * Wind, precipitation and lightning. Wind is a gusting horizontal air speed
 * that bombs fly through and smoke and gas drift on; rain and snow fall as
 * particles around the camera and shorten what heat seekers can see.
 */
export class Weather {
	kind: WeatherKind = 'clear';
	/** Mean wind the gusts swing around. */
	baseWind = CLEAR.wind;
	/** Current wind in m/s along x. */
	wind = CLEAR.wind;
	/** Precipitation strength 0..1, eased so fronts roll in. */
	precip = 0;
	/** Overcast 0..1: dims the sun and thickens fog and cloud. */
	cover = 0;
	/** Lightning brightness 0..1, decays after each bolt. */
	flash = 0;
	/** Bolts struck so far (tests and audio hooks). */
	bolts = 0;
	private targetWind = CLEAR.wind;
	private boltTimer = 6;
	private spawnDebt = 0;
	private readonly thunder: Thunder[] = [];

	/** Changes the target weather. `instant` skips the front rolling in (new sortie, title). */
	set(spec: WeatherSpec, instant = false): void {
		this.kind = spec.kind;
		this.targetWind = spec.wind;
		if (instant) {
			this.baseWind = this.wind = spec.wind;
			this.precip = PRECIP[spec.kind];
			this.cover = COVER[spec.kind];
			this.flash = 0;
			this.thunder.length = 0;
			this.spawnDebt = 0;
		}
	}

	get label(): string {
		return LABEL[this.kind];
	}

	/** Falls as snow (flakes) rather than rain (streaks). */
	get snowing(): boolean {
		return this.kind === 'snow';
	}

	/** Fraction of its clear-weather range a heat seeker can see through. */
	irScale(): number {
		return 1 - IR_LOSS[this.kind] * (PRECIP[this.kind] > 0 ? this.precip / PRECIP[this.kind] : 0);
	}

	update(w: World, dt: number): void {
		const pk = PRECIP[this.kind],
			ck = COVER[this.kind];
		this.precip += clamp(pk - this.precip, -dt / FRONT, dt / FRONT);
		this.cover += clamp(ck - this.cover, -dt / FRONT, dt / FRONT);
		this.baseWind = damp(this.baseWind, this.targetWind, 0.3, dt);
		// Two slow sines make gusts that never quite repeat; storms gust harder.
		const t = w.time;
		const gust =
			(0.22 + 0.2 * this.cover) * (Math.sin(t * 0.37) * 0.7 + Math.sin(t * 1.31 + 2) * 0.3);
		this.wind = this.baseWind * (1 + gust);
		w.particles.windX = this.wind;
		this.flash = Math.max(0, this.flash - dt * (1.5 + this.flash * 4));
		if (dt <= 0) return;
		this.fall(w, dt);
		this.lightning(w, dt);
	}

	/** Rain streaks or snowflakes spread through the volume the camera can see. */
	private fall(w: World, dt: number): void {
		if (this.precip < 0.02) return;
		const snow = this.snowing;
		this.spawnDebt += (snow ? SNOW_RATE : RAIN_RATE) * this.precip * dt;
		const n = Math.floor(this.spawnDebt);
		this.spawnDebt -= n;
		const cam = w.camera;
		const tanY = Math.tan(cam.fovY / 2);
		const fx = w.fx;
		const dark = 1 - 0.75 * w.night;
		for (let i = 0; i < n; i++) {
			// Pick a depth first so the spread matches the view frustum at that depth.
			const z = rnd.range(-0.7, 0.45) * cam.dist;
			const halfH = (cam.dist - z) * tanY;
			const halfW = halfH * cam.aspect;
			const x = cam.x + rnd.range(-1.1, 1.1) * halfW;
			const y = cam.y + rnd.range(-1, 1.2) * halfH;
			if (y < w.surface.heightAtXZ(x, z)) continue;
			const scale = cam.dist - z;
			if (snow) {
				const p = fx.make(Shape.Dirt, x, y, z, rnd.range(2.5, 4));
				p.vx = this.wind * 0.9 + rnd.gauss(1.5);
				p.vy = rnd.range(-7, -4);
				p.vz = rnd.gauss(1);
				p.size0 = p.size1 = scale * rnd.range(0.0035, 0.006);
				fx.color(p, 1.6, 1.65, 1.75, 0.9, 1.6, 1.65, 1.75, 0.9);
				p.fadeIn = 0.4;
				p.spin = rnd.range(-2, 2);
				p.flags = PFlag.DieOnGround;
				fx.ps.spawn(p);
			} else {
				const p = fx.make(Shape.Streak, x, y, z, rnd.range(0.5, 0.9));
				const vy = rnd.range(-75, -60);
				p.vx = this.wind * 1.4;
				p.vy = vy;
				p.size0 = p.size1 = scale * 0.0011;
				p.stretch = (scale * 0.012) / -vy;
				const c = 0.22 * dark;
				fx.color(p, c * 0.85, c * 0.92, c, 1, c * 0.85, c * 0.92, c, 1);
				p.fadeIn = 0.08;
				p.flags = PFlag.DieOnGround;
				fx.ps.spawn(p);
			}
		}
	}

	private lightning(w: World, dt: number): void {
		for (let i = this.thunder.length - 1; i >= 0; i--) {
			const th = this.thunder[i];
			th.delay -= dt;
			if (th.delay > 0) continue;
			w.sound.boom(th.power, th.x, th.y, true);
			this.thunder.splice(i, 1);
		}
		if (this.kind !== 'storm' || this.precip < 0.5) return;
		this.boltTimer -= dt;
		if (this.boltTimer > 0) return;
		this.boltTimer = rnd.range(3, 9) / this.precip;
		const cam = w.camera;
		const halfW = cam.dist * Math.tan(cam.fovY / 2) * cam.aspect;
		this.strike(w, cam.x + rnd.range(-1.3, 1.3) * halfW, rnd.range(-700, -160));
	}

	/** One cloud-to-ground bolt behind the battle line: a jagged chain of glows, light and thunder. */
	strike(w: World, x: number, z: number): void {
		const fx = w.fx;
		const ground = w.surface.heightAtXZ(x, z);
		const top = Math.max(w.camera.y, ground) + rnd.range(260, 380);
		const segs = 24;
		let ox = x + rnd.gauss(40);
		let px = ox,
			py = top;
		for (let s = 1; s <= segs; s++) {
			const t = s / segs;
			ox += rnd.gauss(16);
			// Wander freely up high, then home in on the strike point.
			const nx = lerp(ox, x, t * t),
				ny = lerp(top, ground, t) + (s < segs ? rnd.gauss(4) : 0);
			this.segment(w, px, py, nx, ny, z, 2, 1);
			if (s > 3 && s < segs - 5 && rnd.chance(0.2)) this.branch(w, nx, ny, z);
			px = nx;
			py = ny;
		}
		// A soft glow where it hits and up in the cloud it came from.
		for (const [gx, gy, size] of [
			[x, ground + 4, 26],
			[lerp(ox, x, 0.2), top, 60]
		]) {
			const g = fx.make(Shape.Glow, gx, gy, z, 0.35);
			g.size0 = size;
			g.size1 = size * 1.4;
			fx.color(g, 3, 3.4, 5, 1, 0.5, 0.6, 1, 0);
			g.fadeIn = 0;
			fx.ps.spawn(g);
		}
		w.lights.add(x, (top + ground) / 2, z, [0.75, 0.82, 1.2], 900, 1400, { life: 0.35 });
		fx.flash(0.35);
		fx.flashColor = [0.8, 0.88, 1];
		this.flash = 1;
		this.bolts++;
		const d = Math.hypot(x - w.camera.x, z);
		this.thunder.push({
			x,
			y: ground,
			delay: d / SPEED_OF_SOUND,
			power: clamp(2.2 - d / 600, 0.6, 1.8)
		});
	}

	/** A straight piece of bolt from (x0, y0) to (x1, y1): one streak stretched to span it. */
	private segment(
		w: World,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		z: number,
		width: number,
		bright: number
	): void {
		const dx = x1 - x0,
			dy = y1 - y0;
		const len = Math.hypot(dx, dy);
		if (len < 0.01) return;
		const p = w.fx.make(Shape.Streak, (x0 + x1) / 2, (y0 + y1) / 2, z, rnd.range(0.28, 0.4));
		// The streak points along its velocity; a crawl of 1 m/s keeps it still.
		p.vx = dx / len;
		p.vy = dy / len;
		p.size0 = p.size1 = width;
		p.stretch = Math.max(0, len * 0.55 - width);
		w.fx.color(p, 14 * bright, 16 * bright, 24 * bright, 1, 4, 5, 10, 0);
		p.fadeIn = 0;
		w.fx.ps.spawn(p);
	}

	private branch(w: World, x: number, y: number, z: number): void {
		const dir = rnd.sign();
		let bx = x,
			by = y;
		for (let s = 1; s <= 6; s++) {
			const nx = bx + dir * rnd.range(4, 10),
				ny = by - rnd.range(5, 11);
			this.segment(w, bx, by, nx, ny, z, 0.7, 0.5);
			bx = nx;
			by = ny;
		}
	}
}

/** Greys out the sky, sun and colour for the current overcast, and adds lightning. */
export function applyWeather(env: Environment, weather: Weather): void {
	const c = weather.cover;
	if (c > 0.001) {
		const sun = 1 - 0.7 * c;
		for (let i = 0; i < 3; i++) env.sunColor[i] *= sun;
		env.sunDisk *= 1 - c;
		env.rays *= 1 - c;
		env.stars *= 1 - c;
		const grey = (env.fogColor[0] + env.fogColor[1] + env.fogColor[2]) / 3;
		for (let i = 0; i < 3; i++) {
			env.fogColor[i] = lerp(env.fogColor[i], grey * 0.85, c * 0.6);
			env.fogSun[i] = lerp(env.fogSun[i], env.fogColor[i], c * 0.8);
			env.horizon[i] = lerp(env.horizon[i], grey, c * 0.6);
			env.zenith[i] = lerp(env.zenith[i], grey * 0.7, c * 0.6);
			env.cloudLit[i] = lerp(env.cloudLit[i], grey * 1.1, c * 0.8);
			env.cloudShadow[i] = lerp(env.cloudShadow[i], grey * 0.45, c * 0.85);
		}
		env.fog[0] *= 1 + 1.6 * c;
		env.fog[3] = Math.min(0.98, env.fog[3] + 0.05 * c);
		env.cloud[0] = lerp(env.cloud[0], 0.85, c);
		env.cloud[2] = lerp(env.cloud[2], 1, c);
		env.saturation *= 1 - 0.25 * c;
		if (weather.snowing) {
			env.tint = [env.tint[0] * 0.97, env.tint[1], env.tint[2] * 1.05];
			env.exposure *= 1 + 0.12 * c;
		}
	}
	const f = weather.flash;
	if (f > 0) {
		const k = 1 + 2.5 * f;
		for (let i = 0; i < 3; i++) {
			env.ambSky[i] *= k;
			env.cloudLit[i] = lerp(env.cloudLit[i], 2.2, f * 0.7);
		}
	}
}
