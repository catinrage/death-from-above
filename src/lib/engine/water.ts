import { Program } from './gl/program';
import {
	createDepthTexture,
	createTarget,
	deleteTarget,
	type RenderTarget,
	type TextureFormat
} from './gl/target';
import type { CameraFrame, Environment } from './renderer';
import { MAX_RIPPLES, WATER_FS, WATER_VS } from './shaders/water';

/**
 * Draws the river surface between the opaque and transparent passes. The
 * hardware depth test hides it behind banks and piers (and it writes depth so
 * smoke and spray sit on it); copies of the opaque colour and depth feed
 * refraction, thickness and reflections.
 */
export class WaterRenderer {
	readonly ripples = new Float32Array(MAX_RIPPLES * 4);
	numRipples = 0;
	/** Channel cross-section for the shader: centre x, half width, bed depth, shoal width. */
	river: [number, number, number, number] = [0, 0, 0, 1];
	private readonly program: Program;
	private vao: WebGLVertexArrayObject | null = null;
	private indexCount = 0;
	private minX = 0;
	private maxX = 0;
	private copy: RenderTarget | null = null;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		private readonly format: TextureFormat
	) {
		this.program = new Program(gl, 'water', WATER_VS, WATER_FS);
	}

	setMesh(vertices: Float32Array, indices: Uint32Array, minX: number, maxX: number): void {
		const gl = this.gl;
		const vao = gl.createVertexArray();
		const vbo = gl.createBuffer();
		const ibo = gl.createBuffer();
		if (!vao || !vbo || !ibo) throw new Error('Water buffer allocation failed');
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
		gl.bindVertexArray(null);
		this.vao = vao;
		this.indexCount = indices.length;
		this.minX = minX;
		this.maxX = maxX;
	}

	resize(width: number, height: number): void {
		if (this.copy) deleteTarget(this.gl, this.copy);
		this.copy = createTarget(
			this.gl,
			width,
			height,
			this.format,
			createDepthTexture(this.gl, width, height, false)
		);
	}

	/** Returns false when there is no river in view. */
	draw(
		scene: RenderTarget,
		cam: CameraFrame,
		env: Environment,
		lighting: (p: Program) => void
	): boolean {
		const gl = this.gl;
		const copy = this.copy;
		if (!this.vao || !copy || !copy.depth) return false;
		if (this.maxX < cam.cullMinX || this.minX > cam.cullMaxX) return false;
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scene.fbo);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, copy.fbo);
		gl.blitFramebuffer(
			0,
			0,
			scene.width,
			scene.height,
			0,
			0,
			copy.width,
			copy.height,
			gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
			gl.NEAREST
		);

		gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
		gl.viewport(0, 0, scene.width, scene.height);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		const p = this.program.use();
		p.m4('u_viewProj', cam.viewProj)
			.f2('u_nearFar', cam.near, cam.far)
			.v3('u_zenith', env.zenith)
			.v3('u_horizon', env.horizon)
			.i1('u_numRipples', this.numRipples)
			.f4('u_river', this.river[0], this.river[1], this.river[2], this.river[3])
			.v4array('u_ripples', this.ripples, Math.max(1, this.numRipples));
		lighting(p);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, copy.depth);
		p.i1('u_depth', 2);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, copy.color);
		p.i1('u_scene', 3);
		gl.bindVertexArray(this.vao);
		gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
		gl.bindVertexArray(null);
		return true;
	}
}
