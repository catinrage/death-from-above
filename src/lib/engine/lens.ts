/** Barrel distortion of the vintage lens at full strength. */
export const LENS_BARREL = 0.09;

function stretch(cx: number, cy: number, aspect: number, k: number): number {
	const a2 = aspect * aspect;
	// Radius² scaled so the corners sit at 0.5 and stay put: the edges bow inward, never past the frame.
	const r2 = (2 * (cx * cx * a2 + cy * cy)) / (a2 + 1);
	return 1 + k * (r2 - 0.5);
}

/** Scene uv that a screen uv shows through the lens. Mirrors lensUV in the composite shader. */
export function lensDistort(u: number, v: number, aspect: number, k: number): [number, number] {
	if (k === 0) return [u, v];
	const cx = u - 0.5,
		cy = v - 0.5;
	const f = stretch(cx, cy, aspect, k);
	return [0.5 + cx * f, 0.5 + cy * f];
}

/** Screen uv where a scene uv lands after the lens, so HTML overlays line up with what is drawn. */
export function lensUndistort(u: number, v: number, aspect: number, k: number): [number, number] {
	if (k === 0) return [u, v];
	const px = u - 0.5,
		py = v - 0.5;
	let cx = px,
		cy = py;
	// The stretch is within a few percent of 1, so a fixed-point walk converges in a handful of steps.
	for (let i = 0; i < 6; i++) {
		const f = stretch(cx, cy, aspect, k);
		cx = px / f;
		cy = py / f;
	}
	return [0.5 + cx, 0.5 + cy];
}
