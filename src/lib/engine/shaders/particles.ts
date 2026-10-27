import { HEADER, MAX_LIGHTS } from './common';

/** Particle shapes understood by the particle fragment shader. */
export const Shape = {
	Smoke: 0,
	Fire: 1,
	Spark: 2,
	Glow: 3,
	Ring: 4,
	Dirt: 5,
	Streak: 6
} as const;
export type ShapeId = (typeof Shape)[keyof typeof Shape];

export const PARTICLE_VS = /* glsl */ `${HEADER}
#define MAX_LIGHTS ${MAX_LIGHTS}
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 i_posSize;
layout(location = 2) in vec4 i_color;
layout(location = 3) in vec4 i_params; // rotation, shape, seed, stretch
layout(location = 4) in vec4 i_vel;    // velocity, lit amount
uniform mat4 u_view;
uniform mat4 u_proj;
uniform int u_numLights;
uniform vec4 u_lightPos[MAX_LIGHTS];
uniform vec4 u_lightCol[MAX_LIGHTS];
out vec2 v_uv;
out vec4 v_color;
flat out int v_shape;
out float v_seed;
out vec3 v_light;
out float v_viewZ;
out float v_lit;
out float v_size;
void main() {
	vec4 vp = u_view * vec4(i_posSize.xyz, 1.0);
	float size = i_posSize.w;
	vec2 c = a_corner;
	vec2 offset;
	if (i_params.w > 0.0) {
		vec3 vv = mat3(u_view) * i_vel.xyz;
		float sp = length(vv.xy);
		vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
		vec2 perp = vec2(-dir.y, dir.x);
		float len = size + sp * i_params.w;
		offset = dir * c.x * len + perp * c.y * size;
	} else {
		float cs = cos(i_params.x), sn = sin(i_params.x);
		offset = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
	}
	vp.xy += offset;
	gl_Position = u_proj * vp;
	v_uv = c * 0.5 + 0.5;
	v_color = i_color;
	v_shape = int(i_params.y + 0.5);
	v_seed = i_params.z;
	v_viewZ = -vp.z;
	v_lit = i_vel.w;
	v_size = size;
	vec3 L = vec3(0.0);
	if (i_vel.w > 0.0) {
		for (int i = 0; i < MAX_LIGHTS; i++) {
			if (i >= u_numLights) break;
			vec3 d = u_lightPos[i].xyz - i_posSize.xyz;
			float r = u_lightPos[i].w;
			float d2 = dot(d, d);
			if (d2 > r * r) continue;
			float w = 1.0 - d2 / (r * r);
			L += u_lightCol[i].rgb * w * w / (1.0 + d2 * 0.015);
		}
	}
	v_light = L;
}
`;

export const PARTICLE_FS = /* glsl */ `${HEADER}
uniform sampler2D u_noise;
uniform sampler2D u_depth;
uniform vec2 u_nearFar;
uniform vec3 u_sunView;
uniform vec3 u_sunColor;
uniform vec3 u_ambSky;
uniform vec3 u_ambGround;
uniform float u_time;
in vec2 v_uv;
in vec4 v_color;
flat in int v_shape;
in float v_seed;
in vec3 v_light;
in float v_viewZ;
in float v_lit;
in float v_size;
out vec4 o_color;

float linearDepth(float d) {
	float z = d * 2.0 - 1.0;
	return 2.0 * u_nearFar.x * u_nearFar.y / (u_nearFar.y + u_nearFar.x - z * (u_nearFar.y - u_nearFar.x));
}

void main() {
	vec2 p = v_uv * 2.0 - 1.0;
	float r2 = dot(p, p);
	vec4 col;
	float softness = 0.6;
	if (v_shape == 0) {
		// Billowing smoke: noise-eroded sphere with a fake normal for lighting.
		vec2 nuv = v_uv * 0.45 + vec2(v_seed * 7.13, v_seed * 3.71);
		float n = texture(u_noise, nuv).r * 0.55 + texture(u_noise, nuv * 2.3 + 0.37).g * 0.3 +
			texture(u_noise, nuv * 5.1 + 0.71).b * 0.15;
		float r = sqrt(r2);
		float body = 1.0 - smoothstep(0.3, 0.9, r + (n - 0.5) * 1.05);
		float a = body * v_color.a;
		vec3 nrm = normalize(vec3(p * 1.1 + (n - 0.5) * 0.8, sqrt(max(1.0 - r2, 0.0)) + 0.25));
		float sun = clamp(dot(nrm, u_sunView) * 0.55 + 0.45, 0.0, 1.0);
		vec3 amb = mix(u_ambGround, u_ambSky, nrm.y * 0.5 + 0.5);
		// Light leaks through the thin rim when the sun sits behind the smoke.
		float rim = (1.0 - body) * pow(clamp(-u_sunView.z, 0.0, 1.0), 2.0);
		float occl = 0.7 + 0.3 * smoothstep(0.0, 0.8, r);
		vec3 lighting = (amb * 1.2 + u_sunColor * (sun * 0.45 + rim * 0.9)) * occl + v_light * 0.7;
		vec3 c = v_color.rgb * mix(vec3(1.0), lighting, v_lit) * (0.75 + 0.5 * n);
		col = vec4(c * a, a);
		softness = 3.0;
	} else if (v_shape == 1) {
		vec2 nuv = v_uv * 0.6 + vec2(v_seed * 5.3, v_seed * 2.9 - u_time * 0.15);
		float n = texture(u_noise, nuv).r * 0.65 + texture(u_noise, nuv * 2.7).b * 0.35;
		float r = sqrt(r2);
		float a = 1.0 - smoothstep(0.05, 1.0, r + (n - 0.5) * 0.9);
		a *= a;
		float core = 1.0 + 0.7 * (1.0 - smoothstep(0.0, 0.45, r));
		vec3 tint = mix(v_color.rgb * vec3(1.0, 0.82, 0.7), v_color.rgb, n);
		col = vec4(tint * a * v_color.a * core, a * v_color.a * 0.55);
		softness = 2.0;
	} else if (v_shape == 2 || v_shape == 6) {
		float along = 1.0 - p.x * p.x;
		float across = exp(-p.y * p.y * (v_shape == 6 ? 10.0 : 5.0));
		float a = along * across;
		col = vec4(v_color.rgb * a * v_color.a, 0.0);
		softness = 0.4;
	} else if (v_shape == 3) {
		float a = exp(-r2 * 5.0) + exp(-r2 * 30.0) * 0.6;
		col = vec4(v_color.rgb * a * v_color.a, 0.0);
		softness = 1.5;
	} else if (v_shape == 4) {
		float r = sqrt(r2);
		float a = exp(-pow((r - 0.82) * 10.0, 2.0)) * step(r, 1.0);
		col = vec4(v_color.rgb * a * v_color.a, 0.0);
		softness = 1.0;
	} else {
		float r = sqrt(r2);
		float n = texture(u_noise, v_uv * 0.5 + v_seed).a;
		float a = 1.0 - smoothstep(0.45, 0.85, r + (n - 0.5) * 0.4);
		vec3 lighting = mix(u_ambGround, u_ambSky, 0.6) * 1.2 + u_sunColor * 0.35 + v_light * 0.5;
		vec3 c = v_color.rgb * lighting;
		col = vec4(c * a * v_color.a, a * v_color.a);
		softness = 0.3;
	}
	float sceneZ = linearDepth(texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r);
	float fade = clamp((sceneZ - v_viewZ) / min(softness, v_size * 1.5 + 0.05), 0.0, 1.0);
	if (fade <= 0.0) discard;
	// Fade particles that get right up against the camera.
	fade *= smoothstep(1.5, 6.0, v_viewZ);
	o_color = col * fade;
}
`;
