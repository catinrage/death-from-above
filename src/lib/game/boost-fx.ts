import { fx as rnd } from '../engine/rng';
import type { Player } from './player';
import type { World } from './world';

const out: [number, number, number] = [0, 0, 0];

/**
 * Engine glow every frame, and each airframe's own boost signature:
 * afterburner plumes with shock diamonds, a stealth jet's cold plasma, rocket
 * bottles, or a piston bomber's black water-injection smoke.
 */
export function engineFx(w: World, p: Player, time: number, emit: boolean): void {
	const d = p.def;
	const ca = Math.cos(p.angle),
		sa = Math.sin(p.angle);
	// Eased burner level: the flame grows out of the nozzle and dies back instead of popping.
	const lv = p.boostLevel;
	const k = (0.35 + p.throttle * 0.3 + lv * (0.65 - p.throttle * 0.3)) * (1 - p.brakeLevel * 0.45);
	for (const e of d.exhaust) {
		p.localToWorld(e, out);
		const [x, y, z] = out;
		w.fx.immediateGlow(x, y, z, 1.1 + k * 1.4, 10 * k, 5 * k, 2.5 * k + lv * 3);
		if (p.ignition > 0 && d.boostFx !== 'smoke') {
			// Light-off: a hot flash in the nozzle as the burner catches.
			const f = p.ignition * p.ignition;
			w.fx.immediateGlow(x - ca * 0.6, y - sa * 0.6, z, 2.2 + 2.6 * f, 18 * f, 12 * f, 8 * f);
		}
		if (lv < 0.03) continue;
		switch (d.boostFx) {
			case 'afterburner':
				plume(w, x, y, z, ca, sa, time, lv, false);
				break;
			case 'smokyBurner':
				plume(w, x, y, z, ca, sa, time, 0.85 * lv, true);
				if (emit && lv > 0.5 && rnd.chance(0.7))
					w.fx.trail(x - ca * 4, y - sa * 4, z, 1.3, 0.05, 0.6, 2.6, 0.15);
				break;
			case 'plasma':
				for (let i = 0; i < 4; i++) {
					const s = i * 1.4;
					const s2 = s * lv;
					const f = (0.75 + 0.25 * Math.sin(time * 40 + i)) * lv;
					w.fx.immediateGlow(x - ca * s2, y - sa * s2, z, (1.8 - i * 0.3) * f, 1.5, 4, 14);
				}
				break;
			case 'rocket':
				for (let i = 0; i < 4; i++) {
					const s = i * 1.2 * lv;
					w.fx.immediateGlow(x - ca * s, y - sa * s - 0.6, z, (2.4 - i * 0.4) * lv, 16, 7, 1.6);
				}
				if (emit && lv > 0.4)
					w.fx.trail(x - ca * 3, y - sa * 3 - 0.6, z, 1.6, 0.85, 0.55, 3.2, 0.1);
				break;
			case 'smoke':
				if (emit && rnd.chance(0.8))
					w.fx.trail(x - ca * 2, y - sa * 2, z, 1.4, 0.03, 0.75, 2.4, 0.2);
				break;
		}
		if (emit && lv > 0.6 && d.boostFx !== 'smoke' && d.boostFx !== 'plasma')
			w.fx.exhaust(x, y, z, ca, sa, 1, p.vx, p.vy);
	}
	if (p.boosting && d.boostFx === 'smoke') {
		// Water-methanol injection: the radials cough smoke from every stack.
		for (const pr of d.props) {
			p.localToWorld([pr[0] - 1.2, pr[1], pr[2]], out);
			if (emit && rnd.chance(0.5)) w.fx.trail(out[0], out[1], out[2], 1, 0.04, 0.7, 2.2, 0.2);
			w.fx.immediateGlow(out[0], out[1], out[2], 0.9, 9, 3.5, 1);
		}
	}
}

/** Airbrake: vapour streaming off the wingtips and a light buffet while it bites. */
export function brakeFx(w: World, p: Player, emit: boolean): void {
	const b = p.brakeLevel;
	if (b < 0.1 || p.speed < 45) return;
	const [tx, ty, span] = p.def.tip;
	if (emit) {
		for (const s of [1, -1]) {
			if (!rnd.chance(0.75 * b)) continue;
			p.localToWorld([tx - 0.5, ty, span * s], out);
			w.fx.trail(out[0], out[1], out[2], 0.35, 0.95, 0.4 * b, 0.6, 0);
		}
		if (rnd.chance(0.25 * b)) w.fx.addTrauma(0.02 * b);
	}
}

/** Afterburner: blue-white core, orange plume, flickering shock diamonds. */
function plume(
	w: World,
	x: number,
	y: number,
	z: number,
	ca: number,
	sa: number,
	time: number,
	scale: number,
	warm: boolean
): void {
	const flick = 0.85 + 0.15 * Math.sin(time * 61) * Math.sin(time * 37);
	// `scale` is the spooled level: the jet lengthens and brightens as it builds.
	const len = 0.25 + 0.75 * scale;
	for (let i = 0; i < 7; i++) {
		const s = i * 0.95 * len;
		const t = i / 6;
		// A pressure pulse rolling down the plume keeps it alive rather than static.
		const pulse = 0.85 + 0.15 * Math.sin(time * 34 - i * 1.3);
		const size = (1.25 - t * 0.75) * (0.4 + 0.6 * scale) * flick * pulse;
		const r = warm ? 7 : 4 + t * 4,
			g = warm ? 3 + (1 - t) * 2 : 4 - t * 2.2,
			b = warm ? 0.8 : 9 * (1 - t) + 0.6;
		const fade = scale * (1 - t * (1 - scale));
		w.fx.immediateGlow(x - ca * s, y - sa * s, z, size, r * fade, g * fade, b * fade);
	}
	if (scale < 0.6) return;
	for (let i = 1; i <= 3; i++) {
		// Shock diamonds appear once the jet is at full chat, shimmering in place.
		const s = (i * 1.7 + 0.6) * len + Math.sin(time * 23 + i) * 0.12;
		const on = (scale - 0.6) / 0.4;
		w.fx.immediateGlow(x - ca * s, y - sa * s, z, 0.45 * flick * on, 12 * on, 10 * on, 8 * on);
	}
}
