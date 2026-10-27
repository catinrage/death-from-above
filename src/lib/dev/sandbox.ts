import { LightSystem } from '../engine/lights';
import { mat4 } from '../engine/math';
import { ParticleSystem, particleInit } from '../engine/particles';
import { Renderer, QUALITY_PRESETS, type PostFrame } from '../engine/renderer';
import { Shape } from '../engine/shaders/particles';
import { CameraRig } from '../game/camera';
import { environmentAt } from '../game/environment';
import { Terrain } from '../game/terrain';
import { TerrainView } from '../game/terrain-view';
import { createModels } from '../models';

/** Static showcase scene for checking the renderer in isolation (/sandbox). */
export function startSandbox(canvas: HTMLCanvasElement): () => void {
	const params = new URLSearchParams(location.search);
	const phase = Number(params.get('t') ?? 0);
	const camX = Number(params.get('x') ?? 620);
	const renderer = new Renderer(canvas, QUALITY_PRESETS.high);
	const terrain = new Terrain();
	const view = new TerrainView(renderer, terrain);
	const models = createModels(renderer);
	const lights = new LightSystem();
	const particles = new ParticleSystem();
	const cam = new CameraRig();
	const post: PostFrame = {
		flash: [0, 0, 0],
		damage: 0,
		aberration: 0.0025,
		waves: new Float32Array(32),
		numWaves: 0,
		skyFlash: [0, -1, 0]
	};
	const m = mat4.create();
	const ground = (x: number, z: number): number => terrain.heightAtXZ(x, z);

	const place = (x: number, z: number, yaw = 0, s = 1): void => {
		mat4.fromTranslation(m, x, terrain.heightAtXZ(x, z), z);
		mat4.rotateY(m, m, yaw);
		if (s !== 1) mat4.scale(m, m, s, s, s);
	};

	const p = particleInit();
	const boom = (x: number, z: number): void => {
		const y = terrain.heightAt(x);
		terrain.crater(x, z, 5, 1.6, 1, 0.8);
		lights.add(x, y + 4, z, [1, 0.6, 0.3], 900, 60, { life: 0.9 });
		for (let i = 0; i < 26; i++) {
			const a = Math.random() * Math.PI * 2,
				s = 6 + Math.random() * 14;
			Object.assign(p, particleInit(), {
				x,
				y: y + 1,
				z,
				vx: Math.cos(a) * s,
				vy: Math.random() * 18 + 4,
				vz: Math.sin(a) * s * 0.5,
				life: 0.6 + Math.random() * 0.5,
				size0: 2.5,
				size1: 6,
				r0: 30,
				g0: 14,
				b0: 4,
				a0: 1,
				r1: 2,
				g1: 0.3,
				b1: 0.05,
				a1: 0,
				drag: 2.5,
				gravity: -4,
				shape: Shape.Fire,
				rot: Math.random() * 6
			});
			particles.spawn(p);
		}
		for (let i = 0; i < 22; i++) {
			Object.assign(p, particleInit(), {
				x: x + (Math.random() - 0.5) * 6,
				y: y + 2 + Math.random() * 4,
				z: z + (Math.random() - 0.5) * 3,
				vx: (Math.random() - 0.5) * 8,
				vy: Math.random() * 8 + 2,
				vz: (Math.random() - 0.5) * 3,
				life: 5 + Math.random() * 3,
				size0: 3,
				size1: 11,
				r0: 0.18,
				g0: 0.16,
				b0: 0.15,
				a0: 0.9,
				r1: 0.35,
				g1: 0.33,
				b1: 0.32,
				a1: 0,
				drag: 1.2,
				gravity: -1.5,
				shape: Shape.Smoke,
				lit: 1,
				fadeIn: 0.3,
				flags: 2,
				rot: Math.random() * 6,
				spin: (Math.random() - 0.5) * 0.6
			});
			particles.spawn(p);
		}
		for (let i = 0; i < 40; i++) {
			const a = Math.random() * Math.PI;
			const s = 20 + Math.random() * 40;
			Object.assign(p, particleInit(), {
				x,
				y: y + 1,
				z,
				vx: Math.cos(a) * s,
				vy: Math.sin(a) * s,
				vz: (Math.random() - 0.5) * 10,
				life: 0.5 + Math.random() * 0.8,
				size0: 0.15,
				size1: 0.05,
				r0: 40,
				g0: 18,
				b0: 5,
				a0: 1,
				r1: 8,
				g1: 1,
				b1: 0.1,
				a1: 0,
				drag: 0.6,
				gravity: 25,
				shape: Shape.Spark,
				stretch: 0.04,
				flags: 1
			});
			particles.spawn(p);
		}
	};

	let raf = 0;
	let last = performance.now();
	let t = 0;
	let nextBoom = 0.5;
	const env = environmentAt(phase);
	if (params.has('el')) {
		const el = (Number(params.get('el')) * Math.PI) / 180;
		const az = (Number(params.get('az') ?? 48) * Math.PI) / 180;
		env.sunDir[0] = Math.cos(el) * Math.sin(az);
		env.sunDir[1] = Math.sin(el);
		env.sunDir[2] = -Math.cos(el) * Math.cos(az);
	}
	const resize = (): void => {
		renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
		cam.aspect = renderer.width / renderer.height;
	};
	window.addEventListener('resize', resize);
	resize();
	const planeY = terrain.heightAt(camX) + 55;
	cam.snap({ x: camX, y: planeY, vx: 0, vy: 0 }, terrain.heightAt(camX));

	const frame = (now: number): void => {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		t += dt;
		if (t > nextBoom) {
			boom(camX - 40 + Math.random() * 80, (Math.random() - 0.5) * 6);
			nextBoom = t + 2.2;
		}
		particles.update(dt, ground);
		lights.update(dt);
		terrain.update(dt);
		view.sync();
		cam.update(dt, terrain.heightAt(camX));

		for (const mesh of models.mountains) mesh.push(mat4.identity(m));
		const tx = camX - 60;
		place(tx, 0, Math.PI);
		models.tankHull.push(m);
		mat4.translate(m, m, -0.3, 1.65, 0);
		mat4.rotateY(m, m, Math.sin(t * 0.5) * 0.8);
		models.tankTurret.push(m);
		mat4.translate(m, m, 1.7, 0.5, 0);
		mat4.rotateZ(m, m, 0.15);
		models.tankBarrel.push(m);
		place(camX + 20, -2);
		models.spaagHull.push(m);
		mat4.translate(m, m, 0, 1.5, 0);
		models.spaagTurret.push(m);
		place(camX - 15, 2.5);
		models.truck.push(m);
		for (const [wx, wz] of [
			[2.9, 1],
			[-0.8, 1],
			[-2.0, 1],
			[2.9, -1],
			[-0.8, -1],
			[-2.0, -1]
		]) {
			place(camX - 15, 2.5);
			mat4.translate(m, m, wx, 0.5, wz);
			models.wheel.push(m);
		}
		for (let i = 0; i < 6; i++) {
			place(camX + 45 + i * 3, 1 + (i % 2));
			models.soldierBody.push(m);
		}
		for (let i = 0; i < 60; i++) {
			const x = camX - 300 + i * 10 + Math.sin(i * 7.3) * 4;
			const z = -14 - (i % 5) * 9 - Math.abs(Math.sin(i * 3.1)) * 10;
			place(x, z, i, 0.9 + (i % 3) * 0.15);
			[models.pine0, models.broad0, models.pine1, models.broad1, models.pine2][i % 5].push(m, {
				r: 1,
				g: 1,
				b: 1,
				char: 0,
				emissive: 1,
				flash: 0,
				sway: 0.6,
				embers: 0
			});
		}
		for (let i = 0; i < 200; i++) {
			const x = camX - 250 + i * 2.5 + Math.sin(i * 1.7) * 1.2;
			const z = -6 + Math.sin(i * 2.9) * 10 + 4;
			place(x, z, i);
			[models.grass0, models.grass1, models.grass2][i % 3].push(m, {
				r: 1,
				g: 1,
				b: 1,
				char: 0,
				emissive: 1,
				flash: 0,
				sway: 1,
				embers: 0
			});
		}
		mat4.fromTranslation(m, camX + 10, planeY, 0);
		mat4.rotateZ(m, m, 0.1);
		models.kestrel.push(m);
		renderer.render(cam.frame, env, lights, particles, post, t);
		raf = requestAnimationFrame(frame);
	};
	raf = requestAnimationFrame(frame);
	return () => {
		cancelAnimationFrame(raf);
		window.removeEventListener('resize', resize);
	};
}
