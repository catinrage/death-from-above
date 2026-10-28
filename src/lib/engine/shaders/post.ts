import { HEADER } from './common';

export const BLOOM_PREFILTER_FS = /* glsl */ `${HEADER}
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_threshold;
uniform float u_knee;
in vec2 v_uv;
out vec4 o_color;
vec3 prefilter(vec3 c) {
	float br = max(c.r, max(c.g, c.b));
	float rq = clamp(br - u_threshold + u_knee, 0.0, 2.0 * u_knee);
	rq = rq * rq / (4.0 * u_knee + 1e-4);
	float w = max(rq, br - u_threshold) / max(br, 1e-4);
	return c * w;
}
vec3 karis(vec3 c) {
	return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25);
}
void main() {
	vec3 a = texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
	vec3 b = texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb;
	vec3 c = texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb;
	vec3 d = texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
	vec3 s = (karis(a) + karis(b) + karis(c) + karis(d)) * 0.25;
	o_color = vec4(prefilter(min(s, vec3(64.0))), 1.0);
}
`;

export const BLOOM_DOWN_FS = /* glsl */ `${HEADER}
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o_color;
vec3 s(vec2 o) { return texture(u_src, v_uv + o * u_texel).rgb; }
void main() {
	vec3 e = s(vec2(0.0));
	vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
	vec3 d = s(vec2(-2.0, 0.0)), f = s(vec2(2.0, 0.0));
	vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
	vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
	vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
	o_color = vec4(r, 1.0);
}
`;

export const BLOOM_UP_FS = /* glsl */ `${HEADER}
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_weight;
in vec2 v_uv;
out vec4 o_color;
void main() {
	vec2 d = u_texel * u_radius;
	vec3 r = texture(u_src, v_uv + vec2(-d.x, -d.y)).rgb;
	r += texture(u_src, v_uv + vec2(0.0, -d.y)).rgb * 2.0;
	r += texture(u_src, v_uv + vec2(d.x, -d.y)).rgb;
	r += texture(u_src, v_uv + vec2(-d.x, 0.0)).rgb * 2.0;
	r += texture(u_src, v_uv).rgb * 4.0;
	r += texture(u_src, v_uv + vec2(d.x, 0.0)).rgb * 2.0;
	r += texture(u_src, v_uv + vec2(-d.x, d.y)).rgb;
	r += texture(u_src, v_uv + vec2(0.0, d.y)).rgb * 2.0;
	r += texture(u_src, v_uv + vec2(d.x, d.y)).rgb;
	o_color = vec4(r / 16.0 * u_weight, 1.0);
}
`;

export const RAYS_MASK_FS = /* glsl */ `${HEADER}
uniform sampler2D u_scene;
uniform sampler2D u_depth;
uniform vec2 u_sunUV;
uniform float u_aspect;
in vec2 v_uv;
out vec4 o_color;
void main() {
	float d = texture(u_depth, v_uv).r;
	vec3 c = d >= 0.99999 ? texture(u_scene, v_uv).rgb : vec3(0.0);
	vec2 dv = v_uv - u_sunUV;
	dv.x *= u_aspect;
	float w = exp(-dot(dv, dv) * 9.0);
	float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
	o_color = vec4(min(c, vec3(6.0)) * w * smoothstep(0.2, 1.5, lum), 1.0);
}
`;

export const RAYS_BLUR_FS = /* glsl */ `${HEADER}
uniform sampler2D u_src;
uniform vec2 u_sunUV;
uniform float u_density;
uniform float u_decay;
uniform float u_weight;
uniform float u_jitter;
in vec2 v_uv;
out vec4 o_color;
const int SAMPLES = 48;
void main() {
	vec2 delta = (v_uv - u_sunUV) * u_density / float(SAMPLES);
	float j = fract(sin(dot(v_uv * 913.7 + u_jitter, vec2(12.9898, 78.233))) * 43758.5453);
	vec2 uv = v_uv - delta * j;
	float illum = 1.0;
	vec3 acc = vec3(0.0);
	for (int i = 0; i < SAMPLES; i++) {
		uv -= delta;
		acc += texture(u_src, uv).rgb * illum;
		illum *= u_decay;
	}
	o_color = vec4(acc * u_weight, 1.0);
}
`;

export const COMPOSITE_FS = /* glsl */ `${HEADER}
#define MAX_WAVES 8
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_rays;
uniform vec2 u_resolution;
uniform float u_exposure;
uniform float u_bloomStrength;
uniform vec3 u_raysColor;
uniform float u_vignette;
uniform float u_grain;
uniform float u_time;
uniform float u_aberration;
uniform float u_saturation;
uniform float u_contrast;
uniform vec3 u_tint;
uniform vec3 u_flash;
uniform float u_damage;
uniform float u_lens;
uniform float u_lensK;
uniform int u_numWaves;
uniform vec4 u_waves[MAX_WAVES];
in vec2 v_uv;
out vec4 o_color;

vec3 aces(vec3 x) {
	const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
	return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Barrel distortion; mirrors lensDistort in engine/lens.ts so HTML overlays stay aligned.
vec2 lensUV(vec2 q, float aspect) {
	vec2 c = q - 0.5;
	float a2 = aspect * aspect;
	float r2 = 2.0 * (c.x * c.x * a2 + c.y * c.y) / (a2 + 1.0);
	return 0.5 + c * (1.0 + u_lensK * (r2 - 0.5));
}

void main() {
	float aspect = u_resolution.x / u_resolution.y;
	vec2 uv = v_uv;
	for (int i = 0; i < MAX_WAVES; i++) {
		if (i >= u_numWaves) break;
		vec4 w = u_waves[i];
		vec2 d = uv - w.xy;
		d.x *= aspect;
		float dist = length(d);
		float x = (dist - w.z) / max(w.z * 0.18, 0.004);
		float ring = exp(-x * x) * x;
		uv -= (d / max(dist, 1e-4)) * ring * w.w / vec2(aspect, 1.0);
	}
	// Vintage lens: film runs at 24 fps, so its flaws change on that beat.
	float L = u_lens;
	float fr = floor(u_time * 24.0);
	vec2 sc = uv - 0.5;
	if (L > 0.0) {
		uv = lensUV(uv, aspect);
		// Gate weave: the print shifts a hair from frame to frame.
		uv += (vec2(hash(vec2(fr, 1.7)), hash(vec2(fr, 5.3))) - 0.5) * 0.0007 * L;
	}
	vec2 cc = uv - 0.5;
	float ca = u_aberration * (0.4 + dot(cc, cc) * 2.4) + L * 0.012 * dot(cc, cc);
	vec3 col;
	col.r = texture(u_scene, uv - cc * ca).r;
	col.g = texture(u_scene, uv).g;
	col.b = texture(u_scene, uv + cc * ca).b;
	vec3 bloom = texture(u_bloom, uv).rgb;
	col += bloom * u_bloomStrength;
	// Halation: highlights bleed a red-orange fringe through the film base.
	col += bloom * vec3(0.9, 0.32, 0.12) * (0.45 * L * step(1e-4, u_bloomStrength));
	col += texture(u_rays, uv).rgb * u_raysColor;
	col += u_flash;
	col *= u_exposure * u_tint;
	col = aces(col);
	float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(l), col, u_saturation);
	col = clamp((col - 0.5) * u_contrast + 0.5, 0.0, 1.0);
	vec2 vc = cc * vec2(aspect, 1.0) * 0.72;
	float vig = smoothstep(0.95, 0.15, length(vc));
	col *= mix(1.0 - u_vignette, 1.0, vig);
	// Lens falloff: a round, soft darkening toward the frame edge.
	col *= 1.0 - L * 0.42 * smoothstep(0.3, 1.05, length(sc * vec2(aspect, 1.0)));
	col = mix(col, vec3(0.55, 0.02, 0.0), u_damage * (1.0 - vig) * 0.85);
	col = pow(col, vec3(1.0 / 2.2));
	if (L > 0.0) {
		// Faded print: a little less colour, cool shadows, warm cream highlights,
		// lifted blacks and softened whites.
		float dl = dot(col, vec3(0.2126, 0.7152, 0.0722));
		vec3 f = mix(vec3(dl), col, 0.86);
		f = mix(f * vec3(0.93, 1.0, 1.03), f * vec3(1.06, 1.0, 0.84), smoothstep(0.2, 0.85, dl));
		f = vec3(0.035, 0.03, 0.04) + f * 0.93;
		// Projector flicker.
		f *= 1.0 + (hash(vec2(fr, 3.1)) - 0.5) * 0.04;
		col = mix(col, f, L);
	}
	col += (hash(uv * u_resolution + fract(u_time) * 100.0) - 0.5) * u_grain;
	if (L > 0.0) {
		vec2 px = v_uv * u_resolution;
		float gl = dot(col, vec3(0.299, 0.587, 0.114));
		// Film grain: clumpier than pixel noise, strongest in the midtones.
		float g = hash(floor(px / 1.6) + fr * 17.13) + hash(floor(px / 2.7) + fr * 7.31) - 1.0;
		col += g * L * 0.035 * (0.4 + 2.4 * gl * (1.0 - gl));
		// Dust: a speck or two lands on the odd frame.
		vec2 cells = vec2(12.0, 7.0);
		vec2 gcell = v_uv * cells;
		vec2 id = floor(gcell);
		if (hash(id + fr * 1.37) > 0.988) {
			vec2 at = vec2(hash(id + fr * 2.11 + 0.3), hash(id + fr * 3.71 + 0.9));
			float dd = length((fract(gcell) - at) * u_resolution / cells);
			col *= 1.0 - L * 0.55 * smoothstep(2.6, 0.6, dd);
		}
		// A faint scratch that wanders along the print now and then.
		float sl = floor(u_time * 0.6);
		float sx = hash(vec2(sl, 8.2)) + sin(u_time * 2.3) * 0.004;
		float on = step(0.6, hash(vec2(sl, 4.4))) * step(0.25, hash(vec2(fr, 6.6)));
		float line = exp(-pow((v_uv.x - sx) * u_resolution.x / 1.1, 2.0));
		line *= 0.5 + 0.5 * sin(v_uv.y * 37.0 + fr);
		col += line * on * L * 0.07;
	}
	o_color = vec4(col, dot(col, vec3(0.299, 0.587, 0.114)));
}
`;

export const FXAA_FS = /* glsl */ `${HEADER}
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o_color;
void main() {
	const float REDUCE_MIN = 1.0 / 128.0;
	const float REDUCE_MUL = 1.0 / 8.0;
	const float SPAN_MAX = 8.0;
	vec3 rgbNW = texture(u_src, v_uv + vec2(-1.0, -1.0) * u_texel).rgb;
	vec3 rgbNE = texture(u_src, v_uv + vec2(1.0, -1.0) * u_texel).rgb;
	vec3 rgbSW = texture(u_src, v_uv + vec2(-1.0, 1.0) * u_texel).rgb;
	vec3 rgbSE = texture(u_src, v_uv + vec2(1.0, 1.0) * u_texel).rgb;
	vec4 rgbaM = texture(u_src, v_uv);
	vec3 rgbM = rgbaM.rgb;
	vec3 luma = vec3(0.299, 0.587, 0.114);
	float lumaNW = dot(rgbNW, luma), lumaNE = dot(rgbNE, luma);
	float lumaSW = dot(rgbSW, luma), lumaSE = dot(rgbSE, luma);
	float lumaM = dot(rgbM, luma);
	float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
	float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
	vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), (lumaNW + lumaSW) - (lumaNE + lumaSE));
	float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * REDUCE_MUL), REDUCE_MIN);
	float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
	dir = clamp(dir * rcpDirMin, vec2(-SPAN_MAX), vec2(SPAN_MAX)) * u_texel;
	vec3 rgbA = 0.5 * (texture(u_src, v_uv + dir * (1.0 / 3.0 - 0.5)).rgb +
		texture(u_src, v_uv + dir * (2.0 / 3.0 - 0.5)).rgb);
	vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(u_src, v_uv + dir * -0.5).rgb +
		texture(u_src, v_uv + dir * 0.5).rgb);
	float lumaB = dot(rgbB, luma);
	o_color = vec4((lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB, 1.0);
}
`;
