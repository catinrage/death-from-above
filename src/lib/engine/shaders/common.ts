export const MAX_LIGHTS = 32;

export const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;

/** Uniforms and functions shared by every lit surface shader. */
export const LIGHTING = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
#define PI 3.14159265

uniform vec3 u_camPos;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_ambSky;
uniform vec3 u_ambGround;
uniform vec3 u_fillDir;
uniform vec3 u_fillColor;
uniform vec3 u_fogColor;
uniform vec3 u_fogSun;
uniform vec4 u_fog;
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_lightVP;
uniform float u_shadowTexel;
uniform int u_numLights;
uniform vec4 u_lightPos[MAX_LIGHTS];
uniform vec4 u_lightCol[MAX_LIGHTS];
uniform sampler2D u_noise;
uniform float u_time;

float shadowFactor(vec3 wp, vec3 n) {
	vec4 lp = u_lightVP * vec4(wp + n * 0.12, 1.0);
	vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
	if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
	float ref = sc.z - 0.0006;
	float s = 0.0;
	for (int x = -1; x <= 1; x++) {
		for (int y = -1; y <= 1; y++) {
			s += texture(u_shadowMap, vec3(sc.xy + vec2(float(x), float(y)) * u_shadowTexel * 1.25, ref));
		}
	}
	return s / 9.0;
}

float D_GGX(float NoH, float a) {
	float a2 = a * a;
	float d = NoH * NoH * (a2 - 1.0) + 1.0;
	return a2 / (PI * d * d);
}

float V_Smith(float NoV, float NoL, float a) {
	float k = a * 0.5;
	return 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k));
}

vec3 shadeLight(vec3 albedo, float rough, float metal, vec3 N, vec3 V, vec3 L, vec3 radiance) {
	float NoL = dot(N, L);
	if (NoL <= 0.0) return vec3(0.0);
	vec3 H = normalize(L + V);
	float NoV = max(dot(N, V), 1e-3);
	float NoH = max(dot(N, H), 0.0);
	float VoH = max(dot(V, H), 0.0);
	float a = max(rough * rough, 0.03);
	vec3 f0 = mix(vec3(0.04), albedo, metal);
	vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
	vec3 spec = D_GGX(NoH, a) * V_Smith(NoV, NoL, a) * F;
	vec3 diff = (1.0 - F) * (1.0 - metal) * albedo / PI;
	return (diff + spec) * radiance * NoL;
}

vec3 ambientLight(vec3 albedo, float rough, float metal, vec3 N, vec3 V) {
	vec3 amb = mix(u_ambGround, u_ambSky, N.y * 0.5 + 0.5);
	vec3 f0 = mix(vec3(0.04), albedo, metal);
	float NoV = max(dot(N, V), 0.0);
	vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NoV, 5.0);
	vec3 R = reflect(-V, N);
	vec3 env = mix(u_ambGround * 1.2, u_ambSky * 1.6, smoothstep(-0.25, 0.35, R.y));
	env += u_sunColor * pow(max(dot(R, u_sunDir), 0.0), mix(4.0, 160.0, 1.0 - rough)) * (1.0 - rough) * 0.35;
	return (1.0 - F) * (1.0 - metal) * albedo * amb + F * env * (1.0 - rough * 0.6);
}

vec3 pointLights(vec3 albedo, float rough, float metal, vec3 N, vec3 V, vec3 wp) {
	vec3 sum = vec3(0.0);
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= u_numLights) break;
		vec3 d = u_lightPos[i].xyz - wp;
		float r = u_lightPos[i].w;
		float dist2 = dot(d, d);
		if (dist2 > r * r) continue;
		float dist = sqrt(dist2);
		vec3 L = d / max(dist, 1e-3);
		float win = 1.0 - dist2 / (r * r);
		float att = win * win / (1.0 + dist2 * 0.015);
		vec3 rad = u_lightCol[i].rgb * att;
		// A touch of wrap so fire light reads on surfaces facing slightly away.
		sum += shadeLight(albedo, rough, metal, N, V, L, rad) + albedo * rad * 0.04;
	}
	return sum;
}

vec3 applyFog(vec3 col, vec3 wp) {
	vec3 d = wp - u_camPos;
	float dist = length(d);
	vec3 dir = d / max(dist, 1e-3);
	float density = u_fog.x * exp(-max(wp.y - u_fog.z, 0.0) * u_fog.y);
	float f = min(1.0 - exp(-dist * density), u_fog.w);
	float s = pow(max(dot(dir, u_sunDir), 0.0), 5.0);
	return mix(col, mix(u_fogColor, u_fogSun, s), f);
}
`;

/** Vertex attributes for instanced static meshes (see gl/mesh.ts). */
export const INSTANCED_ATTRIBS = /* glsl */ `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec3 a_col;
layout(location = 3) in vec3 a_mat;
layout(location = 4) in vec4 a_m0;
layout(location = 5) in vec4 a_m1;
layout(location = 6) in vec4 a_m2;
layout(location = 7) in vec4 a_m3;
layout(location = 8) in vec4 a_tint;
layout(location = 9) in vec4 a_extra;

vec4 instanceWorld(mat4 model, float time) {
	vec4 wp = model * vec4(a_pos, 1.0);
	if (a_extra.z > 0.0) {
		float h = max(a_pos.y, 0.0);
		float w = sin(time * 1.6 + wp.x * 0.21 + wp.z * 0.13) + 0.5 * sin(time * 3.7 + wp.x * 0.7);
		wp.x += w * a_extra.z * h * h * 0.012;
	}
	return wp;
}
`;

export const FULLSCREEN_VS = /* glsl */ `${HEADER}
out vec2 v_uv;
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	v_uv = p;
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
