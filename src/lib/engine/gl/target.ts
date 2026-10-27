export interface TextureFormat {
	internal: number;
	format: number;
	type: number;
	filter: number;
}

export interface RenderTarget {
	fbo: WebGLFramebuffer;
	width: number;
	height: number;
	color: WebGLTexture | null;
	depth: WebGLTexture | null;
}

export function createTexture(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	fmt: TextureFormat,
	wrap: number = gl.CLAMP_TO_EDGE
): WebGLTexture {
	const tex = gl.createTexture();
	if (!tex) throw new Error('Failed to create texture');
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, width, height, 0, fmt.format, fmt.type, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fmt.filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fmt.filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
	return tex;
}

export function createDepthTexture(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	comparable: boolean
): WebGLTexture {
	const tex = gl.createTexture();
	if (!tex) throw new Error('Failed to create depth texture');
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.DEPTH_COMPONENT24,
		width,
		height,
		0,
		gl.DEPTH_COMPONENT,
		gl.UNSIGNED_INT,
		null
	);
	const filter = comparable ? gl.LINEAR : gl.NEAREST;
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	if (comparable) {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
	}
	return tex;
}

export function createTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	color: TextureFormat | null,
	depth: WebGLTexture | null
): RenderTarget {
	const fbo = gl.createFramebuffer();
	if (!fbo) throw new Error('Failed to create framebuffer');
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	const colorTex = color ? createTexture(gl, width, height, color) : null;
	if (colorTex) {
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
	} else {
		gl.drawBuffers([gl.NONE]);
		gl.readBuffer(gl.NONE);
	}
	if (depth) {
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
	}
	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if (status !== gl.FRAMEBUFFER_COMPLETE) {
		throw new Error(`Framebuffer incomplete (0x${status.toString(16)})`);
	}
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { fbo, width, height, color: colorTex, depth };
}

/** Wraps an existing colour texture (and optional depth) in a new framebuffer. */
export function wrapTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	colorTex: WebGLTexture,
	depth: WebGLTexture | null
): RenderTarget {
	const fbo = gl.createFramebuffer();
	if (!fbo) throw new Error('Failed to create framebuffer');
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
	if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { fbo, width, height, color: colorTex, depth };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: RenderTarget, keepDepth = false): void {
	gl.deleteFramebuffer(t.fbo);
	if (t.color) gl.deleteTexture(t.color);
	if (t.depth && !keepDepth) gl.deleteTexture(t.depth);
}
