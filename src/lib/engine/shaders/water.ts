import { HEADER, LIGHTING } from './common';

export const MAX_RIPPLES = 16;

export const WATER_VS = /* glsl */ `${HEADER}
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
out vec3 v_wp;
void main() {
	v_wp = a_pos;
	gl_Position = u_viewProj * vec4(a_pos, 1.0);
}
`;

export const WATER_FS = /* glsl */ `${HEADER}
${LIGHTING}
#define MAX_RIPPLES ${MAX_RIPPLES}
uniform mat4 u_viewProj;
uniform sampler2D u_depth;
uniform sampler2D u_scene;
uniform vec2 u_nearFar;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec4 u_ripples[MAX_RIPPLES];
uniform int u_numRipples;
// Channel cross-section: centre x, half width, bed depth, shoal width.
uniform vec4 u_river;
in vec3 v_wp;
out vec4 o_color;

const vec3 DEEP = vec3(0.018, 0.05, 0.046);
const vec3 ABSORB = vec3(0.42, 0.17, 0.13);

// Water depth straight down to the bed (negative over the banks). Analytic, so
// the shoreline stays smooth where a depth buffer read would quantise.
float bedDepth(vec2 p) {
	float d = abs(p.x - u_river.x);
	return mix(u_river.z, -0.6, smoothstep(u_river.y - u_river.w, u_river.y, d));
}

float linearDepth(float d) {
	float z = d * 2.0 - 1.0;
	return 2.0 * u_nearFar.x * u_nearFar.y / (u_nearFar.y + u_nearFar.x - z * (u_nearFar.y - u_nearFar.x));
}

float waves(vec2 p) {
	float t = u_time;
	return texture(u_noise, p * 0.038 + vec2(0.004 * t, 0.03 * t)).r * 0.55 +
		texture(u_noise, p * 0.093 + vec2(-0.011 * t, 0.06 * t)).g * 0.3 +
		texture(u_noise, p * 0.27 + vec2(0.02 * t, 0.11 * t)).b * 0.15;
}

vec3 skyColor(vec3 d) {
	float h = max(d.y, 0.0);
	vec3 sky = mix(u_horizon, u_zenith, pow(h, 0.33));
	float mu = max(dot(d, u_sunDir), 0.0);
	return sky + u_sunColor * (pow(mu, 6.0) * 0.25 + pow(mu, 60.0) * 0.6);
}

// Depth of the opaque scene behind a projected point: >0 means the ray went behind it.
float behind(vec3 pos, out vec2 uv, out float raw) {
	vec4 c = u_viewProj * vec4(pos, 1.0);
	vec3 ndc = c.xyz / max(c.w, 1e-4);
	uv = ndc.xy * 0.5 + 0.5;
	raw = texture(u_depth, uv).r;
	return linearDepth(ndc.z * 0.5 + 0.5) - linearDepth(raw);
}

// Screen-space reflection against the opaque depth; sky when nothing is hit.
vec3 reflection(vec3 wp, vec3 R, float jitter) {
	vec3 skySample = skyColor(R);
	float stepLen = 1.0 + jitter;
	vec3 prev = wp;
	vec3 pos = wp + R * (0.4 + jitter);
	for (int i = 0; i < 32; i++) {
		vec2 uv;
		float raw;
		float diff = behind(pos, uv, raw);
		if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
		if (raw >= 0.99999) {
			skySample = texture(u_scene, uv).rgb;
		} else if (diff > 0.0) {
			// Bisect back to the surface so hit edges do not stair-step.
			vec3 a = prev, b = pos;
			for (int k = 0; k < 6; k++) {
				vec3 m = (a + b) * 0.5;
				if (behind(m, uv, raw) > 0.0) b = m; else a = m;
			}
			float d = behind(b, uv, raw);
			if (d < stepLen * 1.5 + 1.5 && raw < 0.99999) {
				vec2 edge = smoothstep(vec2(0.0), vec2(0.08), uv) * smoothstep(vec2(1.0), vec2(0.92), uv);
				return mix(skySample, texture(u_scene, uv).rgb, edge.x * edge.y);
			}
		}
		prev = pos;
		pos += R * stepLen;
		stepLen *= 1.16;
	}
	return skySample;
}

void main() {
	vec2 screen = vec2(textureSize(u_depth, 0));
	vec2 uv = gl_FragCoord.xy / screen;
	vec2 p = v_wp.xz;

	// Wave normal from scrolling noise, plus rings from splashes.
	float e = 0.4;
	float h0 = waves(p);
	vec2 grad = vec2(waves(p + vec2(e, 0.0)) - h0, waves(p + vec2(0.0, e)) - h0) / e;
	float foam = 0.0;
	for (int i = 0; i < MAX_RIPPLES; i++) {
		if (i >= u_numRipples) break;
		vec4 r = u_ripples[i];
		vec2 d = p - r.xy;
		float dist = length(d) + 1e-3;
		float front = r.z * 7.5;
		float band = exp(-pow(dist - front, 2.0) * 0.12) * exp(-r.z * 0.75) * r.w;
		grad += d / dist * band * sin((dist - front) * 2.2) * 0.9;
		foam += band * exp(-r.z * 1.5) * 0.8 + exp(-dist * dist * 0.05) * exp(-r.z * 1.2) * r.w * 0.6;
	}
	vec3 N = normalize(vec3(-grad.x * 0.55, 1.0, -grad.y * 0.55));
	vec3 V = normalize(u_camPos - v_wp);
	float NoV = max(dot(N, V), 0.0);
	float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

	// Refraction: the bed seen through tinted water, thicker water darker and greener.
	float vert = max(bedDepth(p), 0.0);
	float thick = vert / max(V.y, 0.12);
	vec2 ruv = uv + N.xz * 0.025 * clamp(vert / 3.0, 0.0, 1.0);
	// Don't refract things standing in front of the water (piers, wrecks).
	if (texture(u_depth, ruv).r <= gl_FragCoord.z) ruv = uv;
	vec3 below = texture(u_scene, ruv).rgb;
	vec3 trans = exp(-ABSORB * thick);
	// Wide, dithered shadow lookup: the bank shadows on bright glitter would show texel steps.
	float sh = 0.0;
	float rot = texture(u_noise, gl_FragCoord.xy * 0.13).r * 6.2831;
	for (int i = 0; i < 4; i++) {
		float a = rot + float(i) * 1.5708;
		sh += shadowFactor(v_wp + vec3(cos(a), 0.0, sin(a)) * 2.2, vec3(0.0, 1.0, 0.0));
	}
	sh *= 0.25;
	vec3 lightIn = u_ambSky * 0.9 + u_sunColor * max(u_sunDir.y, 0.0) * 0.25 * sh;
	vec3 refr = below * trans + DEEP * lightIn * 2.4 * (1.0 - trans);

	vec3 R = reflect(-V, N);
	R.y = abs(R.y);
	float jitter = texture(u_noise, gl_FragCoord.xy * 0.37).g;
	vec3 refl = reflection(v_wp, R, jitter);
	vec3 col = mix(refr, refl, fres);

	// Sun glitter and the glints of fires and explosions.
	vec3 H = normalize(V + u_sunDir);
	float spec = D_GGX(max(dot(N, H), 0.0), 0.07) * 0.25;
	col += u_sunColor * spec * sh * fres * 4.0;
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= u_numLights) break;
		vec3 d = u_lightPos[i].xyz - v_wp;
		float rr = u_lightPos[i].w * 1.6;
		float d2 = dot(d, d);
		if (d2 > rr * rr) continue;
		vec3 L = d * inversesqrt(d2);
		float g = D_GGX(max(dot(N, normalize(L + V)), 0.0), 0.12) * 0.08;
		col += u_lightCol[i].rgb * g * (1.0 - d2 / (rr * rr)) * fres * 3.0;
	}

	// Foam where the water thins out against banks and piers, and in fresh splashes.
	float camDist = length(u_camPos - v_wp);
	float n = texture(u_noise, p * 0.31 + vec2(0.0, u_time * 0.12)).a;
	// A thin, broken lace of foam at the shore that fades with distance.
	foam += smoothstep(0.3, 0.0, vert) * smoothstep(0.5, 0.8, n + 0.2) * 0.45 * exp(-camDist * 0.004);
	foam = clamp(foam, 0.0, 1.0);
	vec3 foamCol = u_sunColor * max(u_sunDir.y, 0.0) * 0.35 * sh + u_ambSky * 0.9;
	col = mix(col, foamCol, foam * 0.8);

	col = applyFog(col, v_wp);
	// Feather the shoreline into the bank instead of a hard edge.
	col = mix(texture(u_scene, uv).rgb, col, smoothstep(0.0, 0.35, vert));
	o_color = vec4(col, 1.0);
}
`;
