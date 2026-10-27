import type { Mat4 } from '../math';

/** position(3) normal(3) color(3) material(3: roughness, metalness, emissive) */
export const VERTEX_FLOATS = 12;
/** model matrix(16) tint(4: rgb, char) extra(4: emissive, flash, sway, embers) */
export const INSTANCE_FLOATS = 24;

export interface InstanceStyle {
	r: number;
	g: number;
	b: number;
	/** 0 = pristine, 1 = burnt black. */
	char: number;
	/** Multiplier for vertex emissive (lights on / off). */
	emissive: number;
	/** White hit flash 0..1. */
	flash: number;
	/** Wind sway strength for vegetation. */
	sway: number;
	/** Glowing ember amount on charred surfaces. */
	embers: number;
}

export const DEFAULT_STYLE: Readonly<InstanceStyle> = {
	r: 1,
	g: 1,
	b: 1,
	char: 0,
	emissive: 1,
	flash: 0,
	sway: 0,
	embers: 0
};

/**
 * A static triangle mesh drawn with per-instance transforms. Callers push
 * instances every frame; the renderer uploads and draws them once for the
 * shadow pass and once for the colour pass.
 */
export class Mesh {
	readonly vao: WebGLVertexArrayObject;
	readonly vertexCount: number;
	/** Bounding radius around the local origin, for culling. */
	readonly radius: number;
	instanceCount = 0;
	private instanceData: Float32Array;
	private readonly instanceBuffer: WebGLBuffer;
	private gpuCapacity = 0;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		readonly name: string,
		vertices: Float32Array,
		readonly castShadow = true
	) {
		this.vertexCount = vertices.length / VERTEX_FLOATS;
		let r2 = 0;
		for (let i = 0; i < vertices.length; i += VERTEX_FLOATS) {
			const d = vertices[i] ** 2 + vertices[i + 1] ** 2 + vertices[i + 2] ** 2;
			if (d > r2) r2 = d;
		}
		this.radius = Math.sqrt(r2);
		this.instanceData = new Float32Array(INSTANCE_FLOATS * 16);

		const vao = gl.createVertexArray();
		const vbo = gl.createBuffer();
		const ibo = gl.createBuffer();
		if (!vao || !vbo || !ibo) throw new Error(`Failed to allocate mesh ${name}`);
		this.vao = vao;
		this.instanceBuffer = ibo;

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		const stride = VERTEX_FLOATS * 4;
		for (let i = 0; i < 4; i++) {
			gl.enableVertexAttribArray(i);
			gl.vertexAttribPointer(i, 3, gl.FLOAT, false, stride, i * 12);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
		const istride = INSTANCE_FLOATS * 4;
		for (let i = 0; i < 6; i++) {
			const loc = 4 + i;
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, istride, i * 16);
			gl.vertexAttribDivisor(loc, 1);
		}
		gl.bindVertexArray(null);
	}

	push(m: Mat4, style: Readonly<InstanceStyle> = DEFAULT_STYLE): void {
		const o = this.instanceCount * INSTANCE_FLOATS;
		if (o + INSTANCE_FLOATS > this.instanceData.length) {
			const grown = new Float32Array(this.instanceData.length * 2);
			grown.set(this.instanceData);
			this.instanceData = grown;
		}
		const d = this.instanceData;
		d.set(m, o);
		d[o + 16] = style.r;
		d[o + 17] = style.g;
		d[o + 18] = style.b;
		d[o + 19] = style.char;
		d[o + 20] = style.emissive;
		d[o + 21] = style.flash;
		d[o + 22] = style.sway;
		d[o + 23] = style.embers;
		this.instanceCount++;
	}

	upload(): void {
		if (this.instanceCount === 0) return;
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
		const floats = this.instanceCount * INSTANCE_FLOATS;
		if (floats > this.gpuCapacity) {
			this.gpuCapacity = this.instanceData.length;
			gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
		}
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, floats);
	}

	draw(): void {
		if (this.instanceCount === 0) return;
		const gl = this.gl;
		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
	}

	clear(): void {
		this.instanceCount = 0;
	}
}
