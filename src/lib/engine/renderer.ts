import { Program } from './gl/program';
import { Mesh } from './gl/mesh';
import {
	createDepthTexture,
	createTarget,
	deleteTarget,
	wrapTarget,
	type RenderTarget,
	type TextureFormat
} from './gl/target';
import { mat4, vec3, type Mat4, type Vec3 } from './math';
import { buildTilingNoise } from './noise';
import type { LightSystem } from './lights';
import { PARTICLE_INSTANCE_FLOATS, type ParticleSystem } from './particles';
import { FULLSCREEN_VS } from './shaders/common';
import {
	BEAM_FS,
	BEAM_VS,
	SHADOW_FS,
	SHADOW_VS,
	STANDARD_FS,
	STANDARD_VS,
	TERRAIN_FS,
	TERRAIN_VS
} from './shaders/scene';
import { SKY_FS, SKY_VS } from './shaders/sky';
import { WaterRenderer } from './water';
import { PARTICLE_FS, PARTICLE_VS } from './shaders/particles';
import {
	BLOOM_DOWN_FS,
	BLOOM_PREFILTER_FS,
	BLOOM_UP_FS,
	COMPOSITE_FS,
	FXAA_FS,
	RAYS_BLUR_FS,
	RAYS_MASK_FS
} from './shaders/post';

export type RGB = [number, number, number];

/** Lighting, sky and grading parameters for one frame. */
export interface Environment {
	sunDir: Vec3;
	sunColor: RGB;
	sunDisk: number;
	ambSky: RGB;
	ambGround: RGB;
	/** Unshadowed camera-side fill light (direction toward the light). */
	fillDir: Vec3;
	fillColor: RGB;
	zenith: RGB;
	horizon: RGB;
	fogColor: RGB;
	fogSun: RGB;
	/** density, height falloff, base height, max fog */
	fog: [number, number, number, number];
	cloudLit: RGB;
	cloudShadow: RGB;
	/** coverage, softness, opacity, drift speed */
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

export interface ShadowBox {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
}

export interface CameraFrame {
	view: Mat4;
	proj: Mat4;
	viewProj: Mat4;
	invViewProj: Mat4;
	pos: Vec3;
	near: number;
	far: number;
	/** Point the light ranking is centred on. */
	focusX: number;
	focusY: number;
	viewRadius: number;
	/** Horizontal range of terrain worth drawing. */
	cullMinX: number;
	cullMaxX: number;
	shadowBox: ShadowBox;
}

export interface PostFrame {
	flash: RGB;
	damage: number;
	aberration: number;
	/** Up to 8 shockwaves: uv x, uv y, radius (uv height units), strength. */
	waves: Float32Array;
	numWaves: number;
	/** Horizon artillery flash: direction x, direction z, intensity. */
	skyFlash: [number, number, number];
}

export interface Quality {
	scale: number;
	shadowSize: number;
	bloom: boolean;
	rays: boolean;
	fxaa: boolean;
}

export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', Quality> = {
	low: { scale: 0.6, shadowSize: 1024, bloom: true, rays: false, fxaa: true },
	medium: { scale: 0.8, shadowSize: 2048, bloom: true, rays: true, fxaa: true },
	high: { scale: 1, shadowSize: 2048, bloom: true, rays: true, fxaa: true }
};

interface TerrainChunk {
	vao: WebGLVertexArrayObject;
	vbo: WebGLBuffer;
	indexCount: number;
	indexType: number;
	minX: number;
	maxX: number;
}

export const TERRAIN_VERTEX_FLOATS = 7;
const BLOOM_LEVELS = 6;

export class Renderer {
	readonly gl: WebGL2RenderingContext;
	width = 1;
	height = 1;
	readonly hdr: boolean;
	quality: Quality;
	stats = { drawCalls: 0, instances: 0, particles: 0 };

	private readonly meshes: Mesh[] = [];
	private readonly beamMeshes: Mesh[] = [];
	private readonly chunks: TerrainChunk[] = [];
	private readonly noiseTex: WebGLTexture;
	private readonly emptyVao: WebGLVertexArrayObject;
	private readonly particleVao: WebGLVertexArrayObject;
	private readonly particleBuffer: WebGLBuffer;
	private particleCapacity = 0;

	private readonly standard: Program;
	private readonly shadow: Program;
	private readonly terrain: Program;
	private readonly sky: Program;
	private readonly particles: Program;
	private readonly beam: Program;
	private readonly bloomPre: Program;
	private readonly bloomDown: Program;
	private readonly bloomUp: Program;
	private readonly raysMask: Program;
	private readonly raysBlur: Program;
	private readonly composite: Program;
	private readonly fxaa: Program;

	private shadowTarget!: RenderTarget;
	private scene!: RenderTarget;
	private sceneNoDepth!: RenderTarget;
	private bloom: RenderTarget[] = [];
	private raysA!: RenderTarget;
	private raysB!: RenderTarget;
	private ldr!: RenderTarget;
	private readonly hdrFormat: TextureFormat;

	private readonly lightVP = mat4.create();
	private readonly lightView = mat4.create();
	private readonly lightProj = mat4.create();
	private readonly tmpV = vec3.create();
	private readonly sunView = vec3.create();
	private frameTime = 0;
	roadParams: [number, number, number, number] = [3.4, -1e9, 1e9, 0];
	/** Stretch of the battle line where the road leaves the ground (a bridge). */
	roadGap: [number, number] = [1e9, 1e9];
	readonly water: WaterRenderer;

	constructor(
		readonly canvas: HTMLCanvasElement,
		quality: Quality
	) {
		const gl = canvas.getContext('webgl2', {
			antialias: false,
			alpha: false,
			depth: true,
			stencil: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: false
		});
		if (!gl) throw new Error('WebGL2 is not available in this browser.');
		this.gl = gl;
		this.quality = quality;
		this.hdr = !!gl.getExtension('EXT_color_buffer_float');
		gl.getExtension('OES_texture_float_linear');
		this.hdrFormat = this.hdr
			? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR }
			: { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };

		this.standard = new Program(gl, 'standard', STANDARD_VS, STANDARD_FS);
		this.shadow = new Program(gl, 'shadow', SHADOW_VS, SHADOW_FS);
		this.terrain = new Program(gl, 'terrain', TERRAIN_VS, TERRAIN_FS);
		this.sky = new Program(gl, 'sky', SKY_VS, SKY_FS);
		this.particles = new Program(gl, 'particles', PARTICLE_VS, PARTICLE_FS);
		this.beam = new Program(gl, 'beam', BEAM_VS, BEAM_FS);
		this.bloomPre = new Program(gl, 'bloomPre', FULLSCREEN_VS, BLOOM_PREFILTER_FS);
		this.bloomDown = new Program(gl, 'bloomDown', FULLSCREEN_VS, BLOOM_DOWN_FS);
		this.bloomUp = new Program(gl, 'bloomUp', FULLSCREEN_VS, BLOOM_UP_FS);
		this.raysMask = new Program(gl, 'raysMask', FULLSCREEN_VS, RAYS_MASK_FS);
		this.raysBlur = new Program(gl, 'raysBlur', FULLSCREEN_VS, RAYS_BLUR_FS);
		this.composite = new Program(gl, 'composite', FULLSCREEN_VS, COMPOSITE_FS);
		this.fxaa = new Program(gl, 'fxaa', FULLSCREEN_VS, FXAA_FS);

		this.noiseTex = this.createNoiseTexture();
		this.water = new WaterRenderer(gl, this.hdrFormat);
		const empty = gl.createVertexArray();
		if (!empty) throw new Error('VAO allocation failed');
		this.emptyVao = empty;

		const pvao = gl.createVertexArray();
		const quad = gl.createBuffer();
		const pbuf = gl.createBuffer();
		if (!pvao || !quad || !pbuf) throw new Error('Particle buffer allocation failed');
		this.particleVao = pvao;
		this.particleBuffer = pbuf;
		gl.bindVertexArray(pvao);
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
		for (let i = 0; i < 4; i++) {
			gl.enableVertexAttribArray(1 + i);
			gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, PARTICLE_INSTANCE_FLOATS * 4, i * 16);
			gl.vertexAttribDivisor(1 + i, 1);
		}
		gl.bindVertexArray(null);

		this.createShadowTarget();
		this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720, 1);
	}

	// ------------------------------------------------------------ resources

	createMesh(name: string, vertices: Float32Array, castShadow = true): Mesh {
		const m = new Mesh(this.gl, name, vertices, castShadow);
		this.meshes.push(m);
		return m;
	}

	createBeamMesh(name: string, vertices: Float32Array): Mesh {
		const m = new Mesh(this.gl, name, vertices, false);
		this.beamMeshes.push(m);
		return m;
	}

	createTerrainChunk(
		vertices: Float32Array,
		indices: Uint32Array,
		minX: number,
		maxX: number
	): number {
		const gl = this.gl;
		const vao = gl.createVertexArray();
		const vbo = gl.createBuffer();
		const ibo = gl.createBuffer();
		if (!vao || !vbo || !ibo) throw new Error('Terrain buffer allocation failed');
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
		const stride = TERRAIN_VERTEX_FLOATS * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
		gl.bindVertexArray(null);
		this.chunks.push({
			vao,
			vbo,
			indexCount: indices.length,
			indexType: gl.UNSIGNED_INT,
			minX,
			maxX
		});
		return this.chunks.length - 1;
	}

	updateTerrainChunk(id: number, vertices: Float32Array): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.chunks[id].vbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
	}

	private createNoiseTexture(): WebGLTexture {
		const gl = this.gl;
		const size = 256;
		const tex = gl.createTexture();
		if (!tex) throw new Error('Noise texture allocation failed');
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			size,
			size,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			buildTilingNoise(size)
		);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		return tex;
	}

	private createShadowTarget(): void {
		const gl = this.gl;
		const s = this.quality.shadowSize;
		if (this.shadowTarget) deleteTarget(gl, this.shadowTarget);
		const depth = createDepthTexture(gl, s, s, true);
		this.shadowTarget = createTarget(gl, s, s, null, depth);
	}

	setQuality(q: Quality): void {
		const shadowChanged = q.shadowSize !== this.quality.shadowSize;
		this.quality = q;
		if (shadowChanged) this.createShadowTarget();
		this.resize(this.canvas.clientWidth, this.canvas.clientHeight, window.devicePixelRatio || 1);
	}

	resize(cssWidth: number, cssHeight: number, dpr: number): void {
		const gl = this.gl;
		const scale = Math.min(dpr, 2) * this.quality.scale;
		const w = Math.max(64, Math.round(cssWidth * scale));
		const h = Math.max(64, Math.round(cssHeight * scale));
		if (w === this.width && h === this.height && this.scene) return;
		this.width = w;
		this.height = h;
		this.canvas.width = w;
		this.canvas.height = h;

		if (this.scene) {
			deleteTarget(gl, this.scene);
			gl.deleteFramebuffer(this.sceneNoDepth.fbo);
			for (const b of this.bloom) deleteTarget(gl, b);
			deleteTarget(gl, this.raysA);
			deleteTarget(gl, this.raysB);
			deleteTarget(gl, this.ldr);
		}
		const depth = createDepthTexture(gl, w, h, false);
		this.scene = createTarget(gl, w, h, this.hdrFormat, depth);
		if (!this.scene.color) throw new Error('Scene target has no colour attachment');
		this.sceneNoDepth = wrapTarget(gl, w, h, this.scene.color, null);
		this.bloom = [];
		for (let i = 0; i < BLOOM_LEVELS; i++) {
			const bw = Math.max(1, w >> (i + 1)),
				bh = Math.max(1, h >> (i + 1));
			this.bloom.push(createTarget(gl, bw, bh, this.hdrFormat, null));
		}
		const hw = Math.max(1, w >> 1),
			hh = Math.max(1, h >> 1);
		this.raysA = createTarget(gl, hw, hh, this.hdrFormat, null);
		this.raysB = createTarget(gl, hw, hh, this.hdrFormat, null);
		this.water.resize(w, h);
		this.ldr = createTarget(
			gl,
			w,
			h,
			{ internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR },
			null
		);
	}

	// ------------------------------------------------------------ frame

	render(
		cam: CameraFrame,
		env: Environment,
		lights: LightSystem,
		particles: ParticleSystem,
		post: PostFrame,
		time: number
	): void {
		const gl = this.gl;
		this.frameTime = time;
		this.stats.drawCalls = 0;
		this.stats.instances = 0;

		for (const m of this.meshes) m.upload();
		for (const m of this.beamMeshes) m.upload();
		lights.pack(cam.focusX, cam.focusY, cam.viewRadius);
		this.computeLightMatrix(env.sunDir, cam.shadowBox);

		this.shadowPass();
		this.mainPass(cam, env, lights);
		if (this.water.draw(this.scene, cam, env, (p) => this.applyLighting(p, cam, env, lights)))
			this.stats.drawCalls++;
		this.transparentPass(cam, env, lights, particles);
		this.postPass(cam, env, post);

		for (const m of this.meshes) m.clear();
		for (const m of this.beamMeshes) m.clear();
		gl.bindVertexArray(null);
	}

	private computeLightMatrix(sunDir: Vec3, box: ShadowBox): void {
		const cx = (box.minX + box.maxX) / 2,
			cy = (box.minY + box.maxY) / 2,
			cz = (box.minZ + box.maxZ) / 2;
		const eye = [cx + sunDir[0] * 600, cy + sunDir[1] * 600, cz + sunDir[2] * 600];
		const up = Math.abs(sunDir[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
		mat4.lookAt(this.lightView, eye, [cx, cy, cz], up);
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity,
			maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;
		const v = this.tmpV;
		for (let i = 0; i < 8; i++) {
			const x = i & 1 ? box.maxX : box.minX;
			const y = i & 2 ? box.maxY : box.minY;
			const z = i & 4 ? box.maxZ : box.minZ;
			mat4.transformPoint(v, this.lightView, x, y, z);
			minX = Math.min(minX, v[0]);
			maxX = Math.max(maxX, v[0]);
			minY = Math.min(minY, v[1]);
			maxY = Math.max(maxY, v[1]);
			minZ = Math.min(minZ, v[2]);
			maxZ = Math.max(maxZ, v[2]);
		}
		// Snap to texels so the shadow does not shimmer as the camera glides.
		const size = this.quality.shadowSize;
		const tx = (maxX - minX) / size,
			ty = (maxY - minY) / size;
		minX = Math.floor(minX / tx) * tx;
		maxX = minX + tx * size;
		minY = Math.floor(minY / ty) * ty;
		maxY = minY + ty * size;
		mat4.ortho(this.lightProj, minX, maxX, minY, maxY, -maxZ - 400, -minZ + 50);
		mat4.multiply(this.lightVP, this.lightProj, this.lightView);
	}

	private shadowPass(): void {
		const gl = this.gl;
		const t = this.shadowTarget;
		gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
		gl.viewport(0, 0, t.width, t.height);
		gl.depthMask(true);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.POLYGON_OFFSET_FILL);
		gl.polygonOffset(2.5, 6);
		this.shadow.use().m4('u_lightVP', this.lightVP).f1('u_time', this.frameTime);
		for (const m of this.meshes) {
			if (!m.castShadow || m.instanceCount === 0) continue;
			m.draw();
			this.stats.drawCalls++;
		}
		gl.disable(gl.POLYGON_OFFSET_FILL);
	}

	private applyLighting(p: Program, cam: CameraFrame, env: Environment, lights: LightSystem): void {
		const gl = this.gl;
		p.v3('u_camPos', cam.pos)
			.v3('u_sunDir', env.sunDir)
			.v3('u_sunColor', env.sunColor)
			.v3('u_ambSky', env.ambSky)
			.v3('u_ambGround', env.ambGround)
			.v3('u_fillDir', env.fillDir)
			.v3('u_fillColor', env.fillColor)
			.v3('u_fogColor', env.fogColor)
			.v3('u_fogSun', env.fogSun)
			.f4('u_fog', env.fog[0], env.fog[1], env.fog[2], env.fog[3])
			.m4('u_lightVP', this.lightVP)
			.f1('u_shadowTexel', 1 / this.quality.shadowSize)
			.i1('u_numLights', lights.packedCount)
			.v4array('u_lightPos', lights.packedPos, lights.packedCount)
			.v4array('u_lightCol', lights.packedCol, lights.packedCount)
			.f1('u_time', this.frameTime)
			.tex('u_noise', this.noiseTex, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.shadowTarget.depth);
		p.i1('u_shadowMap', 1);
	}

	private mainPass(cam: CameraFrame, env: Environment, lights: LightSystem): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, 1);
		gl.depthMask(true);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);

		const std = this.standard.use();
		std.m4('u_viewProj', cam.viewProj);
		this.applyLighting(std, cam, env, lights);
		for (const m of this.meshes) {
			if (m.instanceCount === 0) continue;
			m.draw();
			this.stats.drawCalls++;
			this.stats.instances += m.instanceCount;
		}

		const ter = this.terrain.use();
		ter.m4('u_viewProj', cam.viewProj);
		ter.f4(
			'u_road',
			this.roadParams[0],
			this.roadParams[1],
			this.roadParams[2],
			this.roadParams[3]
		);
		ter.f2('u_roadGap', this.roadGap[0], this.roadGap[1]);
		this.applyLighting(ter, cam, env, lights);
		for (const c of this.chunks) {
			if (c.maxX < cam.cullMinX || c.minX > cam.cullMaxX) continue;
			gl.bindVertexArray(c.vao);
			gl.drawElements(gl.TRIANGLES, c.indexCount, c.indexType, 0);
			this.stats.drawCalls++;
		}

		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(false);
		const sky = this.sky.use();
		sky
			.m4('u_invViewProj', cam.invViewProj)
			.v3('u_camPos', cam.pos)
			.v3('u_sunDir', env.sunDir)
			.v3('u_sunColor', env.sunColor)
			.f1('u_sunDisk', env.sunDisk)
			.v3('u_zenith', env.zenith)
			.v3('u_horizon', env.horizon)
			.v3('u_cloudLit', env.cloudLit)
			.v3('u_cloudShadow', env.cloudShadow)
			.f4('u_cloud', env.cloud[0], env.cloud[1], env.cloud[2], env.cloud[3])
			.f1('u_stars', env.stars)
			.f1('u_time', this.frameTime)
			.tex('u_noise', this.noiseTex, 0);
		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.stats.drawCalls++;
		gl.depthFunc(gl.LESS);
	}

	setSkyFlash(dirX: number, dirZ: number, intensity: number): void {
		this.sky.use().f4('u_flashes', dirX, dirZ, intensity, 0);
	}

	private transparentPass(
		cam: CameraFrame,
		env: Environment,
		lights: LightSystem,
		particles: ParticleSystem
	): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneNoDepth.fbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.enable(gl.BLEND);

		// Searchlight beams (additive).
		gl.blendFunc(gl.ONE, gl.ONE);
		const beam = this.beam.use();
		beam
			.m4('u_viewProj', cam.viewProj)
			.m4('u_view', cam.view)
			.v3('u_camPos', cam.pos)
			.f2('u_nearFar', cam.near, cam.far)
			.f1('u_time', this.frameTime);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.scene.depth);
		beam.i1('u_depth', 2);
		for (const m of this.beamMeshes) {
			if (m.instanceCount === 0) continue;
			m.draw();
			this.stats.drawCalls++;
		}

		// Particles: premultiplied alpha, so alpha 0 means purely additive.
		const n = particles.build(cam.view);
		this.stats.particles = n;
		if (n > 0) {
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
			const floats = n * PARTICLE_INSTANCE_FLOATS;
			if (floats > this.particleCapacity) {
				this.particleCapacity = particles.instances.length;
				gl.bufferData(gl.ARRAY_BUFFER, particles.instances.byteLength, gl.DYNAMIC_DRAW);
			}
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles.instances, 0, floats);
			const v = cam.view;
			const s = env.sunDir;
			const sv = this.sunView;
			sv[0] = v[0] * s[0] + v[4] * s[1] + v[8] * s[2];
			sv[1] = v[1] * s[0] + v[5] * s[1] + v[9] * s[2];
			sv[2] = v[2] * s[0] + v[6] * s[1] + v[10] * s[2];
			const p = this.particles.use();
			p.m4('u_view', cam.view)
				.m4('u_proj', cam.proj)
				.i1('u_numLights', lights.packedCount)
				.v4array('u_lightPos', lights.packedPos, lights.packedCount)
				.v4array('u_lightCol', lights.packedCol, lights.packedCount)
				.f2('u_nearFar', cam.near, cam.far)
				.v3('u_sunView', sv)
				.v3('u_sunColor', env.sunColor)
				.v3('u_ambSky', env.ambSky)
				.v3('u_ambGround', env.ambGround)
				.f1('u_time', this.frameTime)
				.tex('u_noise', this.noiseTex, 0);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, this.scene.depth);
			p.i1('u_depth', 2);
			gl.bindVertexArray(this.particleVao);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
			this.stats.drawCalls++;
		}
		gl.disable(gl.BLEND);
	}

	private fullscreen(target: RenderTarget | null): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
		gl.viewport(0, 0, target ? target.width : this.width, target ? target.height : this.height);
		gl.bindVertexArray(this.emptyVao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.stats.drawCalls++;
	}

	private postPass(cam: CameraFrame, env: Environment, post: PostFrame): void {
		const gl = this.gl;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		const sceneColor = this.scene.color as WebGLTexture;

		// Bloom: prefilter, downsample chain, additive tent upsample.
		const b = this.bloom;
		this.bloomPre
			.use()
			.tex('u_src', sceneColor, 3)
			.f2('u_texel', 1 / this.width, 1 / this.height)
			.f1('u_threshold', 3.0)
			.f1('u_knee', 1.2);
		this.fullscreen(b[0]);
		const down = this.bloomDown.use();
		for (let i = 1; i < b.length; i++) {
			down
				.tex('u_src', b[i - 1].color as WebGLTexture, 3)
				.f2('u_texel', 1 / b[i - 1].width, 1 / b[i - 1].height);
			this.fullscreen(b[i]);
		}
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		const up = this.bloomUp.use();
		for (let i = b.length - 1; i > 0; i--) {
			up.tex('u_src', b[i].color as WebGLTexture, 3)
				.f2('u_texel', 1 / b[i].width, 1 / b[i].height)
				.f1('u_radius', 1.0)
				.f1('u_weight', 0.72);
			this.fullscreen(b[i - 1]);
		}
		gl.disable(gl.BLEND);

		// God rays from the sun when it is in front of the camera.
		const sun = this.tmpV;
		const sx = cam.pos[0] + env.sunDir[0] * 4000,
			sy = cam.pos[1] + env.sunDir[1] * 4000,
			sz = cam.pos[2] + env.sunDir[2] * 4000;
		const m = cam.viewProj;
		const w = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
		let raysOn = this.quality.rays && env.rays > 0 && w > 0;
		if (raysOn) {
			sun[0] = ((m[0] * sx + m[4] * sy + m[8] * sz + m[12]) / w) * 0.5 + 0.5;
			sun[1] = ((m[1] * sx + m[5] * sy + m[9] * sz + m[13]) / w) * 0.5 + 0.5;
			raysOn = sun[0] > -0.6 && sun[0] < 1.6 && sun[1] > -0.6 && sun[1] < 1.6;
		}
		if (raysOn) {
			gl.activeTexture(gl.TEXTURE4);
			gl.bindTexture(gl.TEXTURE_2D, this.scene.depth);
			this.raysMask
				.use()
				.tex('u_scene', sceneColor, 3)
				.i1('u_depth', 4)
				.f2('u_sunUV', sun[0], sun[1])
				.f1('u_aspect', this.width / this.height);
			gl.activeTexture(gl.TEXTURE4);
			gl.bindTexture(gl.TEXTURE_2D, this.scene.depth);
			this.fullscreen(this.raysA);
			this.raysBlur
				.use()
				.tex('u_src', this.raysA.color as WebGLTexture, 3)
				.f2('u_sunUV', sun[0], sun[1])
				.f1('u_density', 0.85)
				.f1('u_decay', 0.955)
				.f1('u_weight', 0.03)
				.f1('u_jitter', this.frameTime % 10);
			this.fullscreen(this.raysB);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.raysB.fbo);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}

		const rayK = raysOn ? env.rays : 0;
		const c = this.composite.use();
		c.tex('u_scene', sceneColor, 3)
			.tex('u_bloom', this.bloom[0].color as WebGLTexture, 4)
			.tex('u_rays', this.raysB.color as WebGLTexture, 5)
			.f2('u_resolution', this.width, this.height)
			.f1('u_exposure', env.exposure)
			.f1('u_bloomStrength', this.quality.bloom ? env.bloom : 0)
			.f3('u_raysColor', env.sunColor[0] * rayK, env.sunColor[1] * rayK, env.sunColor[2] * rayK)
			.f1('u_vignette', env.vignette)
			.f1('u_grain', env.grain)
			.f1('u_time', this.frameTime)
			.f1('u_aberration', post.aberration)
			.f1('u_saturation', env.saturation)
			.f1('u_contrast', env.contrast)
			.v3('u_tint', env.tint)
			.v3('u_flash', post.flash)
			.f1('u_damage', post.damage)
			.i1('u_numWaves', post.numWaves)
			.v4array('u_waves', post.waves, post.numWaves);
		if (this.quality.fxaa) {
			this.fullscreen(this.ldr);
			this.fxaa
				.use()
				.tex('u_src', this.ldr.color as WebGLTexture, 3)
				.f2('u_texel', 1 / this.width, 1 / this.height);
			this.fullscreen(null);
		} else {
			this.fullscreen(null);
		}
	}
}
