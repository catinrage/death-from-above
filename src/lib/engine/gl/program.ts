/** Thin wrapper around a linked WebGL2 program with cached uniform locations. */
export class Program {
	readonly handle: WebGLProgram;
	private readonly locations = new Map<string, WebGLUniformLocation | null>();

	constructor(
		private readonly gl: WebGL2RenderingContext,
		readonly name: string,
		vertexSource: string,
		fragmentSource: string
	) {
		const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, name);
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, name);
		const program = gl.createProgram();
		if (!program) throw new Error(`Could not create program ${name}`);
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`Program ${name} failed to link: ${gl.getProgramInfoLog(program)}`);
		}
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		this.handle = program;
	}

	use(): this {
		this.gl.useProgram(this.handle);
		return this;
	}

	private loc(name: string): WebGLUniformLocation | null {
		let l = this.locations.get(name);
		if (l === undefined) {
			l = this.gl.getUniformLocation(this.handle, name);
			this.locations.set(name, l);
		}
		return l;
	}

	f1(name: string, x: number): this {
		const l = this.loc(name);
		if (l) this.gl.uniform1f(l, x);
		return this;
	}

	f2(name: string, x: number, y: number): this {
		const l = this.loc(name);
		if (l) this.gl.uniform2f(l, x, y);
		return this;
	}

	f3(name: string, x: number, y: number, z: number): this {
		const l = this.loc(name);
		if (l) this.gl.uniform3f(l, x, y, z);
		return this;
	}

	f4(name: string, x: number, y: number, z: number, w: number): this {
		const l = this.loc(name);
		if (l) this.gl.uniform4f(l, x, y, z, w);
		return this;
	}

	v3(name: string, v: ArrayLike<number>): this {
		const l = this.loc(name);
		if (l) this.gl.uniform3f(l, v[0], v[1], v[2]);
		return this;
	}

	v4array(name: string, data: Float32Array, count: number): this {
		const l = this.loc(name);
		if (l && count > 0) this.gl.uniform4fv(l, data, 0, count * 4);
		return this;
	}

	m4(name: string, m: Float32Array): this {
		const l = this.loc(name);
		if (l) this.gl.uniformMatrix4fv(l, false, m);
		return this;
	}

	i1(name: string, x: number): this {
		const l = this.loc(name);
		if (l) this.gl.uniform1i(l, x);
		return this;
	}

	/** Binds a texture to `unit` and points the sampler uniform at it. */
	tex(name: string, texture: WebGLTexture, unit: number): this {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		return this.i1(name, unit);
	}
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	name: string
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error(`Could not create shader for ${name}`);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? '';
		const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
		throw new Error(`${name} ${kind} shader failed:\n${log}\n${annotate(source, log)}`);
	}
	return shader;
}

/** Shows the offending source lines next to the compiler log. */
function annotate(source: string, log: string): string {
	const lines = source.split('\n');
	const wanted = new Set<number>();
	for (const m of log.matchAll(/ERROR: \d+:(\d+)/g)) wanted.add(Number(m[1]));
	return [...wanted]
		.flatMap((n) => lines.slice(Math.max(0, n - 3), n + 1).map((l, i) => `${n - 2 + i}: ${l}`))
		.join('\n');
}
