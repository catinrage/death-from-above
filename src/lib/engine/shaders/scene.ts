import { HEADER, INSTANCED_ATTRIBS, LIGHTING } from './common';

export const STANDARD_VS = /* glsl */ `${HEADER}
${INSTANCED_ATTRIBS}
uniform mat4 u_viewProj;
uniform float u_time;
out vec3 v_wp;
out vec3 v_n;
out vec3 v_col;
out vec3 v_mat;
out vec4 v_tint;
out vec4 v_extra;
void main() {
	mat4 model = mat4(a_m0, a_m1, a_m2, a_m3);
	vec4 wp = instanceWorld(model, u_time);
	v_wp = wp.xyz;
	v_n = mat3(model) * a_nrm;
	v_col = a_col;
	v_mat = a_mat;
	v_tint = a_tint;
	v_extra = a_extra;
	gl_Position = u_viewProj * wp;
}
`;

export const STANDARD_FS = /* glsl */ `${HEADER}
${LIGHTING}
in vec3 v_wp;
in vec3 v_n;
in vec3 v_col;
in vec3 v_mat;
in vec4 v_tint;
in vec4 v_extra;
out vec4 o_color;
void main() {
	vec3 N = normalize(v_n);
	if (!gl_FrontFacing) N = -N;
	vec3 V = normalize(u_camPos - v_wp);
	float charAmt = v_tint.a;
	vec3 albedo = v_col * v_tint.rgb;
	float grime = texture(u_noise, v_wp.xy * 0.37 + v_wp.z * 0.11).b;
	albedo *= 0.88 + 0.24 * grime;
	albedo = mix(albedo, vec3(0.022, 0.02, 0.018), charAmt);
	float rough = mix(v_mat.x, 1.0, charAmt);
	float metal = v_mat.y * (1.0 - charAmt);

	float sh = shadowFactor(v_wp, N);
	vec3 col = shadeLight(albedo, rough, metal, N, V, u_sunDir, u_sunColor) * sh;
	col += shadeLight(albedo, max(rough, 0.6), metal, N, V, u_fillDir, u_fillColor);
	col += ambientLight(albedo, rough, metal, N, V);
	col += pointLights(albedo, rough, metal, N, V, v_wp);

	// Soft sky rim plus a warm back-light rim so silhouettes separate from the dusk.
	float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
	float back = max(dot(-V, u_sunDir), 0.0);
	col += fres * (u_ambSky * 0.3 + u_sunColor * 0.08 * back * back) * albedo * 3.0 * (1.0 - charAmt * 0.7);

	col += v_col * v_mat.z * v_extra.x * 6.0;

	if (charAmt > 0.3 && v_extra.w > 0.0) {
		float n = texture(u_noise, v_wp.xz * 0.21 + v_wp.y * 0.13 + vec2(u_time * 0.02, 0.0)).r;
		float pulse = 0.7 + 0.3 * sin(u_time * 3.0 + v_wp.x * 2.0);
		col += vec3(2.6, 0.75, 0.15) * smoothstep(0.6, 0.85, n) * v_extra.w * pulse;
	}
	col = mix(col, vec3(6.0, 5.2, 4.5), v_extra.y);
	o_color = vec4(applyFog(col, v_wp), 1.0);
}
`;

export const SHADOW_VS = /* glsl */ `${HEADER}
${INSTANCED_ATTRIBS}
uniform mat4 u_lightVP;
uniform float u_time;
void main() {
	mat4 model = mat4(a_m0, a_m1, a_m2, a_m3);
	gl_Position = u_lightVP * instanceWorld(model, u_time);
}
`;

export const SHADOW_FS = /* glsl */ `${HEADER}
void main() {}
`;

export const TERRAIN_VS = /* glsl */ `${HEADER}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in float a_scorch;
uniform mat4 u_viewProj;
out vec3 v_wp;
out vec3 v_n;
out float v_scorch;
void main() {
	v_wp = a_pos;
	v_n = a_nrm;
	v_scorch = a_scorch;
	gl_Position = u_viewProj * vec4(a_pos, 1.0);
}
`;

export const TERRAIN_FS = /* glsl */ `${HEADER}
${LIGHTING}
uniform vec4 u_road; // x: half width, y: start x, z: end x, w: unused
uniform vec2 u_roadGap; // no road between these x (it is on the bridge)
// Biome ground colours.
uniform vec3 u_lush;
uniform vec3 u_dry;
uniform vec3 u_dirt;
uniform vec3 u_rock;
uniform vec3 u_roadCol;
in vec3 v_wp;
in vec3 v_n;
in float v_scorch;
out vec4 o_color;

void main() {
	vec3 N = normalize(v_n);
	vec2 p = v_wp.xz;
	float n1 = texture(u_noise, p * 0.0021).r;
	float n2 = texture(u_noise, p * 0.019).g;
	float n3 = texture(u_noise, p * 0.13).b;
	float n4 = texture(u_noise, p * 0.71).a;

	vec3 dry = u_dry;
	vec3 lush = u_lush;
	vec3 dirt = u_dirt;
	vec3 rock = u_rock;

	vec3 grass = mix(lush, dry, smoothstep(0.3, 0.7, n1 + (n2 - 0.5) * 0.5));
	grass *= 0.8 + 0.35 * n3 * (0.7 + 0.6 * n4);
	float slope = 1.0 - N.y;
	float dirtAmt = smoothstep(0.62, 0.82, n2 + n4 * 0.2) * 0.45 + smoothstep(0.12, 0.3, slope);
	vec3 albedo = mix(grass, dirt * (0.8 + 0.4 * n4), clamp(dirtAmt, 0.0, 1.0));
	albedo = mix(albedo, rock * (0.75 + 0.5 * n3), smoothstep(0.3, 0.5, slope));

	// Dirt road along the battle line, with darker wheel ruts.
	float roadEdge = u_road.x + (n2 - 0.5) * 1.6;
	float onRoad = (1.0 - smoothstep(roadEdge - 0.6, roadEdge + 0.4, abs(v_wp.z))) *
		smoothstep(u_road.y, u_road.y + 20.0, v_wp.x) * (1.0 - smoothstep(u_road.z - 20.0, u_road.z, v_wp.x)) *
		(1.0 - smoothstep(u_roadGap.x - 1.0, u_roadGap.x + 2.0, v_wp.x) * (1.0 - smoothstep(u_roadGap.y - 2.0, u_roadGap.y + 1.0, v_wp.x)));
	float ruts = smoothstep(0.35, 0.0, abs(abs(v_wp.z) - 1.2)) * 0.35;
	vec3 roadCol = u_roadCol * (0.85 + 0.3 * n4) * (1.0 - ruts);
	albedo = mix(albedo, roadCol, onRoad * 0.92);

	// Scorch: >1 encodes still-hot ground that glows.
	float sc = clamp(v_scorch * (0.75 + 0.5 * n3), 0.0, 1.0);
	albedo = mix(albedo, vec3(0.035, 0.03, 0.026), smoothstep(0.15, 0.85, sc));

	vec3 V = normalize(u_camPos - v_wp);
	float sh = shadowFactor(v_wp, N);
	float rough = 0.92;
	vec3 col = shadeLight(albedo, rough, 0.0, N, V, u_sunDir, u_sunColor) * sh;
	col += shadeLight(albedo, rough, 0.0, N, V, u_fillDir, u_fillColor * 0.6);
	col += ambientLight(albedo, rough, 0.0, N, V);
	col += pointLights(albedo, rough, 0.0, N, V, v_wp);
	float heat = clamp(v_scorch - 1.0, 0.0, 1.0);
	if (heat > 0.0) {
		float e = smoothstep(0.55, 0.8, texture(u_noise, p * 0.45 + vec2(u_time * 0.03, 0.0)).r);
		col += vec3(2.2, 0.6, 0.12) * e * heat;
	}
	o_color = vec4(applyFog(col, v_wp), 1.0);
}
`;

/** Additive light cones (searchlights) drawn after the opaque pass. */
export const BEAM_VS = /* glsl */ `${HEADER}
${INSTANCED_ATTRIBS}
uniform mat4 u_viewProj;
uniform float u_time;
out vec3 v_wp;
out vec3 v_n;
out float v_along;
out vec4 v_tint;
void main() {
	mat4 model = mat4(a_m0, a_m1, a_m2, a_m3);
	vec4 wp = model * vec4(a_pos, 1.0);
	v_wp = wp.xyz;
	v_n = mat3(model) * a_nrm;
	v_along = a_pos.y;
	v_tint = a_tint;
	gl_Position = u_viewProj * wp;
}
`;

export const BEAM_FS = /* glsl */ `${HEADER}
uniform vec3 u_camPos;
uniform sampler2D u_depth;
uniform vec2 u_nearFar;
uniform mat4 u_view;
in vec3 v_wp;
in vec3 v_n;
in float v_along;
in vec4 v_tint;
out vec4 o_color;
float linearDepth(float d) {
	float z = d * 2.0 - 1.0;
	return 2.0 * u_nearFar.x * u_nearFar.y / (u_nearFar.y + u_nearFar.x - z * (u_nearFar.y - u_nearFar.x));
}
void main() {
	vec3 V = normalize(u_camPos - v_wp);
	float facing = abs(dot(normalize(v_n), V));
	float core = pow(facing, 2.0);
	float fade = pow(clamp(1.0 - v_along, 0.0, 1.0), 1.6);
	float sceneZ = linearDepth(texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r);
	float myZ = -(u_view * vec4(v_wp, 1.0)).z;
	float soft = clamp((sceneZ - myZ) / 6.0, 0.0, 1.0);
	vec3 c = v_tint.rgb * core * fade * soft;
	o_color = vec4(c, 0.0);
}
`;
