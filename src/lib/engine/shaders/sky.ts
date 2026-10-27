import { HEADER } from './common';

export const SKY_VS = /* glsl */ `${HEADER}
out vec2 v_uv;
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	v_uv = p;
	gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}
`;

export const SKY_FS = /* glsl */ `${HEADER}
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunDisk;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_cloudLit;
uniform vec3 u_cloudShadow;
uniform vec4 u_cloud; // coverage, softness, opacity, drift speed
uniform float u_stars;
uniform float u_time;
uniform sampler2D u_noise;
uniform vec4 u_flashes; // distant artillery flash: xy dir.xz, z intensity, w unused
in vec2 v_uv;
out vec4 o_color;

float cloudField(vec2 uv) {
	return texture(u_noise, uv * 0.11).r * 0.5 + texture(u_noise, uv * 0.27).g * 0.3 +
		texture(u_noise, uv * 0.73).b * 0.14 + texture(u_noise, uv * 1.9).a * 0.06;
}

void main() {
	vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
	vec3 dir = normalize(wp.xyz / wp.w - u_camPos);
	float y = dir.y;
	float h = max(y, 0.0);
	float mu = dot(dir, u_sunDir);
	float muc = max(mu, 0.0);

	vec3 sky = mix(u_horizon, u_zenith, pow(h, 0.33));
	// Warm band hugging the horizon, strongest toward the sun.
	sky += u_sunColor * 0.06 * exp(-h * 9.0) * (0.4 + 0.6 * pow(muc, 2.0));
	sky = mix(sky, u_horizon * 0.55, smoothstep(0.0, -0.2, y));

	float glow = pow(muc, 5.0) * 0.16 + pow(muc, 40.0) * 0.32 + pow(muc, 420.0) * 1.2;
	sky += u_sunColor * glow * (0.45 + 0.55 * (1.0 - h));
	float disk = smoothstep(0.99955, 0.99975, mu);
	sky += u_sunColor * disk * u_sunDisk;

	// Distant artillery flashes light up the horizon.
	if (u_flashes.z > 0.0) {
		vec2 fd = normalize(dir.xz + 1e-4);
		float k = max(dot(fd, u_flashes.xy), 0.0);
		sky += vec3(1.0, 0.55, 0.25) * u_flashes.z * pow(k, 40.0) * exp(-h * 14.0);
	}

	if (y > 0.0) {
		// High cumulus layer projected onto a plane.
		vec2 cuv = dir.xz / (y + 0.05) * 1.1 + vec2(u_time * u_cloud.w, u_time * u_cloud.w * 0.3);
		cuv += u_camPos.xz * 0.0004;
		float n = cloudField(cuv);
		float cov = smoothstep(1.0 - u_cloud.x, 1.0 - u_cloud.x + u_cloud.y, n);
		vec2 toSun = normalize(u_sunDir.xz + vec2(1e-4)) * 0.35;
		float n2 = cloudField(cuv + toSun);
		float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
		vec3 cc = mix(u_cloudShadow, u_cloudLit, lit);
		cc += u_sunColor * pow(muc, 6.0) * 0.9 * (1.0 - cov) * lit;
		float fade = smoothstep(0.0, 0.07, y);
		sky = mix(sky, cc, cov * fade * u_cloud.z);

		// Thin strata near the horizon, lit from below by the low sun.
		float band = smoothstep(0.004, 0.035, y) * (1.0 - smoothstep(0.07, 0.2, y));
		float ang = atan(dir.x, -dir.z);
		vec2 suv = vec2(ang * 1.1 + u_camPos.x * 0.00002 + u_time * 0.002, y * 9.0);
		float s = texture(u_noise, suv * vec2(0.6, 1.0)).g * 0.7 + texture(u_noise, suv * vec2(1.7, 2.3)).b * 0.3;
		float streak = smoothstep(0.52, 0.78, s) * band;
		vec3 sc = mix(u_cloudShadow * 0.9, u_sunColor * 0.55 + u_cloudLit * 0.35, 0.25 + 0.75 * pow(muc, 1.5));
		sky = mix(sky, sc, streak * 0.85);
	}

	if (u_stars > 0.0 && y > 0.0) {
		vec3 sd = dir * 260.0;
		vec3 cell = floor(sd);
		float hsh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
		vec3 f = fract(sd) - 0.5;
		float star = step(0.9965, hsh) * smoothstep(0.32, 0.0, length(f));
		float tw = 0.6 + 0.4 * sin(u_time * (2.0 + hsh * 6.0) + hsh * 100.0);
		sky += vec3(0.9, 0.95, 1.0) * star * tw * u_stars * smoothstep(0.02, 0.25, y) * 2.5;
	}
	o_color = vec4(sky, 1.0);
}
`;
