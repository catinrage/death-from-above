import { DEFAULT_STYLE, type InstanceStyle, type Mesh } from '../engine/gl/mesh';
import { mat4, type Mat4 } from '../engine/math';
import type { MeshName, Models } from '../models';
import { PONTOON_SECTIONS, type Span } from './bridge';
import { WORLD } from './constants';
import { AIRCRAFT } from './defs-aircraft';
import { BOMBS } from './defs-bombs';
import { brakeFx, engineFx } from './boost-fx';
import { flareGlow, flareHeat } from './flare-fx';
import { GEAR_HEIGHT, gearLayout } from './gear';
import { debrisMatrix } from './debris';
import { Props, type Prop } from './props';
import { poseParts, poseScratch, rootMatrix } from './unit-pose';
import type { Player } from './player';
import type { Unit } from './types';
import type { World } from './world';

const IDENTITY = mat4.create();
/** Radius the shared `wheel` mesh is built at. */
const WHEEL_MESH_RADIUS = 0.5;
/** Tracer colours are authored hot; this keeps them gold/red instead of clipping to white. */
const TRACER_K = 0.5;

/** Keeps sight dots readable when the camera pulls back to frame a long bomb throw. */
function sightScale(w: World): number {
	return Math.min(2.2, Math.max(1, w.camera.dist / 140));
}

/** Turns the simulation state into per-mesh instance lists every frame. */
/** Checkpoint masts stand just behind the road. */
const CHECKPOINT_Z = -9;
const FLAG_OURS = [0.45, 0.75, 1.6];
const FLAG_THEIRS = [1.7, 0.42, 0.35];
const FLAG_NEUTRAL = [0.8, 0.8, 0.8];

export class SceneView {
	private readonly m: Mat4 = mat4.create();
	private readonly m2: Mat4 = mat4.create();
	private readonly m3: Mat4 = mat4.create();
	private readonly root: Mat4 = mat4.create();
	private readonly s: InstanceStyle = { ...DEFAULT_STYLE };
	private readonly skip = new Set<number>();
	private readonly outdoors: Unit[] = [];
	showSight = true;
	/** Paused: draw the scene but don't add per-frame lights that would never age out. */
	frozen = false;

	constructor(private readonly models: Models) {}

	private style(char = 0, flash = 0, sway = 0, tint = 1, emissive = 1, embers = 0): InstanceStyle {
		const s = this.s;
		s.r = s.g = s.b = tint;
		s.char = char;
		s.flash = flash;
		s.sway = sway;
		s.emissive = emissive;
		s.embers = embers;
		return s;
	}

	/** Multiplies a colour into the current style's tint. */
	private tinted(s: InstanceStyle, c: readonly number[]): InstanceStyle {
		s.r *= c[0];
		s.g *= c[1];
		s.b *= c[2];
		return s;
	}

	private mesh(name: MeshName): Mesh {
		return this.models[name];
	}

	collect(w: World, time: number): void {
		const cam = w.camera;
		const { halfW } = cam.viewExtents();
		const nearMin = cam.x - halfW - 50,
			nearMax = cam.x + halfW + 50;
		const hills = w.biome.mountains;
		for (const mesh of this.models.mountains) mesh.push(IDENTITY, this.tinted(this.style(), hills));
		this.props(w, nearMin, nearMax);
		this.base(w, time);
		this.war(w, time);
		this.bridge(w, nearMin, nearMax);
		this.railway(w, nearMin, nearMax);
		this.units(w, nearMin - 30, nearMax + 30);
		this.units(w, nearMin - 30, nearMax + 30, w.allies.list, true);
		this.troops(w);
		this.civilians(w, nearMin, nearMax);
		this.strikes(w);
		this.debris(w);
		this.ordnance(w);
		this.air(w);
		this.wingman(w, time);
		for (const p of w.pilots()) this.player(w, p, time);
		this.bullets(w);
		this.flares(w);
	}

	private pushProp(p: Prop, night: number, foliage: readonly number[]): void {
		const m = this.m;
		mat4.fromTranslation(m, p.x, p.y, p.z);
		if (p.fall > 0) mat4.rotateZ(m, m, -p.fall * p.fallDir);
		mat4.rotateY(m, m, p.yaw);
		mat4.scale(m, m, p.scale, p.scale, p.scale);
		const sway = p.fall > 0 ? 0 : p.sway;
		const s = this.style(p.char, 0, sway, p.tint, 1, p.char > 0.6 ? 0.3 : 0);
		this.mesh(p.mesh).push(m, p.kind === 'tree' || p.kind === 'bush' ? this.tinted(s, foliage) : s);
		if (p.glow && night > 0.15 && !p.ruined)
			this.mesh(p.glow).push(m, this.style(0, 0, 0, 1, night * 1.3));
	}

	private props(w: World, nearMin: number, nearMax: number): void {
		const f = w.camera.frame;
		const night = w.night;
		const foliage = w.biome.flora.foliage;
		const far = w.props.far;
		for (let i = Props.lowerBound(far, f.cullMinX); i < far.length && far[i].x <= f.cullMaxX; i++)
			this.pushProp(far[i], night, foliage);
		const near = w.props.near;
		const span = (nearMax - nearMin) * 0.35;
		for (
			let i = Props.lowerBound(near, nearMin - span);
			i < near.length && near[i].x <= nearMax + span;
			i++
		) {
			this.pushProp(near[i], night, foliage);
		}
		const grass = w.props.grass;
		const m = this.m;
		for (let i = Props.lowerBound(grass, nearMin); i < grass.length && grass[i].x <= nearMax; i++) {
			const g = grass[i];
			const burnt = w.terrain.scorchAt(g.x, g.z);
			const sy = g.scale * (1 - burnt * 0.65);
			mat4.fromTranslation(m, g.x, g.y, g.z);
			mat4.rotateY(m, m, g.yaw);
			mat4.scale(m, m, g.scale, sy, g.scale);
			this.mesh(g.mesh).push(m, this.tinted(this.style(burnt, 0, 1 - burnt, g.tint), foliage));
		}
	}

	private base(w: World, time: number): void {
		const m = this.m;
		const damage = 1 - w.base.hp / w.base.maxHp;
		for (const s of w.base.structures) {
			const y =
				s.mesh === 'runway'
					? 2.06
					: w.terrain.heightAtXZ(s.x, s.z) +
						(s.mesh === 'kestrel' || s.mesh === 'grizzly' ? 1.4 : 0);
			mat4.fromTranslation(m, s.x, y, s.z);
			mat4.rotateY(m, m, s.yaw);
			const char = s.fire ? 0.55 : s.mesh === 'runway' ? 0 : damage * 0.25;
			this.mesh(s.mesh).push(m, this.style(char, 0, 0, 1, 1, s.fire ? 0.5 : 0));
			if (s.glow && w.night > 0.15)
				this.mesh(s.glow).push(m, this.style(0, 0, 0, 1, w.night * 1.4));
		}
		for (const g of w.base.guns) {
			const y = w.terrain.heightAtXZ(g.x, g.z);
			mat4.fromTranslation(m, g.x, y, g.z);
			this.models.flakBase.push(m, this.style());
			mat4.translate(m, m, 0, 1.2, 0);
			mat4.rotateY(m, m, g.yaw);
			this.models.flakMount.push(m, this.style());
			mat4.translate(m, m, 0, 1.0, 0);
			mat4.rotateZ(m, m, g.pitch);
			this.models.flakBarrel.push(m, this.style());
		}
		// Runway edge lights and the tower beacon.
		if (w.night > 0.2) {
			for (let x = WORLD.runwayMinX + 6; x < WORLD.runwayMaxX; x += 24) {
				for (const z of [-12.5, 12.5]) w.fx.immediateGlow(x, 2.4, z, 0.7, 2.5, 2.0, 1.0);
			}
		}
		if (Math.sin(time * 3) > 0.6)
			w.fx.immediateGlow(309.1, w.ground(307.5) + 15.3, -32.4, 1.5, 9, 1, 0.6);
	}

	/** The enemy HQ compound (rubble once it falls) and the checkpoint flags. */
	private war(w: World, time: number): void {
		const war = w.war;
		if (!war.active) return;
		const m = this.m;
		const hq = war.hq;
		const damage = 1 - hq.hp / hq.maxHp;
		for (const s of hq.structures) {
			mat4.fromTranslation(m, s.x, w.terrain.heightAtXZ(s.x, s.z), s.z);
			mat4.rotateY(m, m, s.yaw);
			if (hq.destroyed) {
				const embers = Math.max(0, 1 - hq.fallen / 40);
				if (s.ruin) this.models.rubble.push(m, this.style(0.7, 0, 0, 1, 1, embers));
				continue;
			}
			const char = s.fire ? 0.55 : damage * 0.3;
			this.mesh(s.mesh).push(m, this.style(char, 0, 0, 1, 1, s.fire ? 0.5 : 0));
		}
		for (const c of war.checkpoints) {
			const y = w.terrain.heightAtXZ(c.x, CHECKPOINT_Z);
			mat4.fromTranslation(m, c.x, y, CHECKPOINT_Z);
			this.models.checkpointMast.push(m, this.style());
			// The flag climbs the mast as a side takes the point, in that side's colour.
			mat4.fromTranslation(m, c.x + 0.1, y + 1.2 + Math.abs(c.hold) * 10.6, CHECKPOINT_Z);
			mat4.rotateY(m, m, Math.sin(time * 2.1 + c.x) * 0.18);
			const tint = c.hold > 0.01 ? FLAG_OURS : c.hold < -0.01 ? FLAG_THEIRS : FLAG_NEUTRAL;
			this.models.checkpointFlag.push(m, this.tinted(this.style(), tint));
		}
	}

	private bridge(w: World, minX: number, maxX: number): void {
		const b = w.bridge;
		if (!b || b.east < minX - 200 || b.west > maxX + 200) return;
		const m = this.m;
		for (const s of b.spans) {
			if (s.down) continue;
			mat4.fromTranslation(m, (s.x0 + s.x1) / 2, b.deckY, 0);
			const wear = b.wear(s);
			this.models.bridgeSpan.push(
				m,
				this.style(wear * 0.7, s.flash * 0.25, 0, 1, 1, wear > 0.6 ? 0.3 : 0)
			);
		}
		for (const s of b.spans) if (s.down && s.pontoon) this.pontoon(w, s);
		for (const x of b.piers) {
			mat4.fromTranslation(m, x, b.deckY - 0.9, 0);
			this.models.bridgePier.push(m, this.style());
		}
		for (const [x, dir] of [
			[b.west, -1],
			[b.east, 1]
		] as const) {
			mat4.fromTranslation(m, x + dir * 2.4, b.deckY, 0);
			this.models.bridgeAbutment.push(m, this.style());
		}
	}

	/** Treadway sections laid so far, each on a pontoon boat or a trestle down to the bank. */
	private pontoon(w: World, s: Span): void {
		const b = w.bridge;
		const p = s.pontoon;
		if (!b || !p) return;
		const m = this.m;
		const len = (s.x1 - s.x0) / PONTOON_SECTIONS;
		const n = p.up ? PONTOON_SECTIONS : Math.floor(p.progress * PONTOON_SECTIONS + 1e-6);
		const style = this.style(0, p.flash * 0.3);
		for (let k = 0; k < n; k++) {
			const x = p.from > 0 ? s.x1 - (k + 0.5) * len : s.x0 + (k + 0.5) * len;
			mat4.fromTranslation(m, x, b.deckY, 0);
			this.models.pontoonSection.push(m, style);
			const g = w.terrain.heightAt(x);
			const wl = w.surface.water(x, 0);
			const afloat = wl > g;
			const foot = afloat ? wl + 0.7 : g;
			const drop = b.deckY - 0.6 - foot;
			if (afloat) {
				// Bob gently on the current.
				mat4.fromTranslation(m, x, wl + Math.sin(w.time * 1.4 + k) * 0.06, 0);
				this.models.pontoonBoat.push(m, style);
			}
			if (drop > 0.2) {
				mat4.fromTranslation(m, x, b.deckY - 0.6, 0);
				mat4.scale(m, m, 1, drop, 1);
				this.models.pontoonTrestle.push(m, style);
			}
		}
	}

	private railway(w: World, minX: number, maxX: number): void {
		const r = w.railway;
		if (!r) return;
		const line = r.line;
		const m = this.m;
		const x0 = Math.max(minX - 40, line.start);
		// Plain track in 4 m lengths, skipping torn-up stretches and the viaduct (its spans carry their own).
		for (let x = Math.floor(x0 / 4) * 4 + 2; x < maxX + 40; x += 4) {
			if (x < line.start + 2 || line.onViaduct(x - 2) || line.onViaduct(x + 2)) continue;
			if (r.cuts.some((c) => x + 2 > c.x0 && x - 2 < c.x1)) continue;
			mat4.fromTranslation(m, x, line.formation(x), line.z);
			mat4.rotateZ(m, m, line.slope(x));
			this.models.railTrack.push(m, this.style());
		}
		if (line.start > minX - 60 && line.start < maxX + 60) {
			mat4.fromTranslation(m, line.start, line.formation(line.start), line.z);
			this.models.bufferStop.push(m, this.style());
		}
		const b = w.railBridge;
		if (!b || b.east < minX - 200 || b.west > maxX + 200) return;
		for (const s of b.spans) {
			if (s.down) continue;
			mat4.fromTranslation(m, (s.x0 + s.x1) / 2, b.deckY, b.z);
			const wear = b.wear(s);
			this.models.railSpan.push(
				m,
				this.style(wear * 0.7, s.flash * 0.25, 0, 1, 1, wear > 0.6 ? 0.3 : 0)
			);
		}
		for (const x of b.piers) {
			mat4.fromTranslation(m, x, b.deckY - 2.6, b.z);
			this.models.railPier.push(m, this.style());
		}
		for (const [x, dir] of [
			[b.west, -1],
			[b.east, 1]
		] as const) {
			mat4.fromTranslation(m, x + dir * 2.9, b.deckY, b.z);
			this.models.railAbutment.push(m, this.style());
		}
	}

	private units(
		w: World,
		minX: number,
		maxX: number,
		list: readonly Unit[] = w.units,
		friend = false
	): void {
		const root = this.root;
		for (const u of list) {
			if (u.x < minX || u.x > maxX) continue;
			rootMatrix(root, u);
			if (!u.alive && u.def.death === 'collapse') mat4.scale(root, root, 1, 0.45, 1);
			const mats = poseParts(u, root, poseScratch);
			const embers = u.alive ? 0 : Math.max(0, 1 - u.deadTime / 35);
			const style = this.style(u.char, u.flash * 0.7, 0, 1, u.alive ? 1 : 0, embers);
			if (friend) {
				// Friendly paratroopers and armour wear lighter, bluer paint.
				style.r = 0.95;
				style.g = 1.05;
				style.b = 1.35;
			} else if (u.alive && u.frost) {
				// Frozen by a cryo bomb: rimed in ice-white until it thaws.
				const f = Math.min(1, u.frost / 2);
				style.r = 1 + f * 0.6;
				style.g = 1 + f * 0.9;
				style.b = 1 + f * 1.3;
			}
			this.skip.clear();
			const parts = u.def.parts;
			for (let i = 0; i < parts.length; i++) {
				const p = parts[i];
				if (u.turretGone && (p.detach || (p.parent !== undefined && this.skip.has(p.parent)))) {
					this.skip.add(i);
					continue;
				}
				this.mesh(p.mesh).push(mats[i], style);
			}
			if (u.def.kind === 'searchlight' && u.alive && u.lamp) this.beam(w, u, mats[1]);
		}
	}

	private troops(w: World): void {
		const list = w.troops.list;
		if (list.length === 0) return;
		this.units(w, -1e9, 1e9, list, true);
		const m = this.m;
		for (const t of list) {
			if (t.chute <= 0.02) continue;
			mat4.fromTranslation(m, t.x, t.y + 1.7, t.z);
			mat4.rotateZ(m, m, Math.sin(w.time * 1.3 + t.id) * 0.06 - t.vx * 0.01);
			mat4.scale(m, m, t.chute, 0.3 + 0.7 * t.chute, t.chute);
			this.models.parachute.push(m, this.style());
		}
	}

	/** Villagers out in the open; those sheltering indoors aren't drawn. */
	private civilians(w: World, minX: number, maxX: number): void {
		const list = this.outdoors;
		list.length = 0;
		for (const c of w.civilians.list) if (c.alive && !c.sheltered) list.push(c);
		if (list.length > 0) this.units(w, minX, maxX, list);
	}

	private strikes(w: World): void {
		const m = this.m;
		for (const s of w.strikes) {
			mat4.fromTranslation(m, s.x, s.y, s.z);
			mat4.rotateZ(m, m, s.angle);
			this.mesh(s.kind === 'cruise' ? 'cruiseMissile' : 'warhead').push(m, this.style());
			if (s.kind === 'cruise') {
				const ex = s.x - Math.cos(s.angle) * 2.8,
					ey = s.y - Math.sin(s.angle) * 2.8;
				w.fx.immediateGlow(ex, ey, s.z, 1.4, 12, 6, 2.5);
			}
		}
	}

	private beam(w: World, u: Unit, lamp: Mat4): void {
		const m = this.m2;
		mat4.translate(m, lamp, 0.5, 0, 0);
		mat4.rotateZ(m, m, -Math.PI / 2);
		mat4.scale(m, m, 16, 300, 16);
		const k = Math.min(1, (w.night - 0.35) * 3) * (u.spotting ? 0.11 : 0.07);
		const s = this.style();
		s.r = 1.0 * k;
		s.g = 0.95 * k;
		s.b = 0.82 * k;
		this.models.beamCone.push(m, s);
		w.fx.immediateGlow(
			lamp[12] + lamp[0] * 0.6,
			lamp[13] + lamp[1] * 0.6,
			lamp[14] + lamp[2] * 0.6,
			2.2,
			14,
			13,
			11
		);
		if (u.lamp) {
			u.lamp.x = lamp[12] + lamp[0] * 12;
			u.lamp.y = lamp[13] + lamp[1] * 12;
			u.lamp.z = lamp[14];
		}
	}

	private debris(w: World): void {
		const m = this.m,
			m2 = this.m2;
		for (const d of w.debris.list) {
			debrisMatrix(m, d);
			const s = this.style(d.char, 0, 0, 1, 0, d.burn > 0 ? 1 : d.char > 0.5 ? 0.3 : 0);
			s.r = d.tint[0];
			s.g = d.tint[1];
			s.b = d.tint[2];
			for (const p of d.parts) {
				mat4.multiply(m2, m, p.local);
				this.mesh(p.mesh).push(m2, s);
			}
		}
	}

	private ordnance(w: World): void {
		const m = this.m;
		for (const b of w.bombs) {
			if (!b.alive || b.dig >= 0) continue;
			mat4.fromTranslation(m, b.x, b.y, b.z);
			mat4.rotateZ(m, m, b.angle);
			if (b.spin) mat4.rotateX(m, m, b.spin);
			this.mesh(b.def.mesh).push(m, this.style());
		}
		for (const s of w.missiles) {
			mat4.fromTranslation(m, s.x, s.y, s.z);
			mat4.rotateZ(m, m, s.angle);
			this.models.missile.push(m, this.style());
			if (s.age < s.burn) {
				const ex = s.x - Math.cos(s.angle) * 1.7,
					ey = s.y - Math.sin(s.angle) * 1.7;
				w.fx.immediateGlow(ex, ey, s.z, 2.4, 16, 9, 4);
				if (!this.frozen) w.lights.add(ex, ey, s.z, [1, 0.6, 0.3], 14, 22, { life: 0.04 });
			}
		}
	}

	private air(w: World): void {
		const m = this.m;
		for (const a of w.air) {
			mat4.fromTranslation(m, a.x, a.y, a.z);
			const st = this.style(a.dying ? 0.6 : 0, a.flash * 0.7, 0, 1, 1, a.dying ? 1 : 0);
			if (a.kind === 'fighter') {
				mat4.rotateZ(m, m, a.angle);
				mat4.rotateX(m, m, a.roll);
				this.models.enemyFighter.push(m, st);
				const ca = Math.cos(a.angle),
					sa = Math.sin(a.angle);
				w.fx.immediateGlow(a.x - ca * 6.1, a.y - sa * 6.1, a.z, 1.4, 9, 4, 1.5);
			} else {
				mat4.rotateY(m, m, Math.PI + (a.dying ? a.rotor * 0.12 : 0));
				mat4.rotateZ(m, m, a.tilt);
				this.models.heliBody.push(m, st);
				mat4.copy(this.m2, m);
				mat4.translate(m, m, 0, 3.75, 0);
				mat4.rotateY(m, m, a.rotor);
				this.models.heliRotor.push(m, st);
				mat4.translate(this.m2, this.m2, -7.9, 2.9, 0.15);
				mat4.rotateZ(this.m2, this.m2, a.rotor * 1.7);
				this.models.heliTailRotor.push(this.m2, st);
			}
		}
	}

	/** The AI wingman flies an F-16, with blue nav strobes to tell it from the enemy. */
	private wingman(w: World, time: number): void {
		const a = w.wingman;
		if (!a || !a.alive) return;
		const m = this.m;
		const def = AIRCRAFT.f16;
		const sc = def.scale;
		mat4.fromTranslation(m, a.x, a.y, a.z);
		mat4.rotateZ(m, m, a.angle);
		mat4.rotateX(m, m, a.roll);
		mat4.scale(m, m, sc, sc, sc);
		const st = this.style(a.dying ? 0.5 : 0, a.flash * 0.5, 0, 1, 1, a.dying ? 1 : 0);
		this.mesh(def.mesh).push(m, st);
		if (a.dying) return;
		const ca = Math.cos(a.angle),
			sa = Math.sin(a.angle);
		w.fx.immediateGlow(a.x - ca * 6, a.y - sa * 6, a.z, 1.2, 9, 5, 2);
		if (Math.sin(time * 7 + 1.3) > 0.9) w.fx.immediateGlow(a.x, a.y + 1.4, a.z, 1.3, 2, 5, 12);
	}

	private player(w: World, p: Player, time: number): void {
		if (p.crashed) return;
		const m = this.m;
		const sc = p.def.scale;
		mat4.fromTranslation(m, p.x, p.y, p.z);
		if (p.yaw !== 0) mat4.rotateY(m, m, p.yaw);
		mat4.rotateZ(m, m, p.angle);
		mat4.rotateX(m, m, p.roll + p.bank);
		mat4.scale(m, m, sc, sc, sc);
		const blink = p.invuln > 0 && Math.sin(time * 28) > 0 ? 0.25 : 0;
		const st = this.style(
			p.dying ? 0.5 : 0,
			Math.max(p.hitFlash * 0.5, blink),
			0,
			1,
			1,
			p.dying ? 1 : 0
		);
		this.mesh(p.def.mesh).push(m, st);
		p.def.props.forEach((prop, i) => {
			mat4.translate(this.m2, m, prop[0], prop[1], prop[2]);
			// Contra-rotating hubs: every second propeller turns the other way.
			mat4.rotateX(this.m2, this.m2, p.def.contra && i % 2 === 1 ? -p.propSpin : p.propSpin);
			this.models.propeller.push(this.m2, st);
		});
		const rotor = p.def.rotor;
		if (rotor) {
			const k = rotor.size;
			mat4.translate(this.m2, m, rotor.main[0], rotor.main[1], rotor.main[2]);
			mat4.rotateY(this.m2, this.m2, p.propSpin * 0.9);
			mat4.scale(this.m2, this.m2, k, 1, k);
			this.models.heliRotor.push(this.m2, st);
			mat4.translate(this.m2, m, rotor.tail[0], rotor.tail[1], rotor.tail[2]);
			mat4.rotateZ(this.m2, this.m2, p.propSpin * 1.6);
			this.models.heliTailRotor.push(this.m2, st);
		}
		if (p.flight === 'fixed') this.gear(p, m, st);
		const sel = p.ammo[p.selected] > 0 ? p.selected : 'gp';
		const shown = Math.min(p.ammo[sel], p.def.hardpoints.length);
		for (let i = 0; i < shown; i++) {
			const h = p.def.hardpoints[i];
			mat4.translate(this.m2, m, h[0], h[1], h[2]);
			mat4.scale(this.m2, this.m2, 0.8, 0.8, 0.8);
			this.mesh(BOMBS[sel].mesh).push(this.m2, st);
		}
		if (!p.alive) return;
		const out: [number, number, number] = [0, 0, 0];
		engineFx(w, p, time, !this.frozen);
		brakeFx(w, p, !this.frozen);
		const [tipX, tipY, span] = p.def.tip;
		p.localToWorld([tipX, tipY, span], out);
		w.fx.immediateGlow(out[0], out[1], out[2], 0.7, 0.4, 3, 0.8);
		p.localToWorld([tipX, tipY, -span], out);
		w.fx.immediateGlow(out[0], out[1], out[2], 0.7, 3, 0.3, 0.2);
		// Player two's beacon flashes green, and faster, so the two pilots can tell their aircraft apart.
		const wing = p === w.player2;
		if (Math.sin(time * (wing ? 14 : 9)) > 0.92) {
			p.localToWorld([-6, 2.8, 0], out);
			if (wing) w.fx.immediateGlow(out[0], out[1], out[2], 1.8, 2, 12, 5);
			else w.fx.immediateGlow(out[0], out[1], out[2], 1.6, 8, 8, 8);
		}
	}

	/**
	 * Nose and main legs, in the aircraft's own frame: each swings back about
	 * its pivot as the gear comes up, and is gone once stowed.
	 */
	private gear(p: Player, m: Mat4, st: InstanceStyle): void {
		const e = p.gear.extension;
		if (e <= 0.001) return;
		const g = gearLayout(p.def);
		// Wheels sit on the runway when the aircraft rests at GEAR_HEIGHT.
		const axle = -GEAR_HEIGHT / p.def.scale + g.wheel;
		const fold = -(1 - e) * Math.PI * 0.5;
		const k = g.wheel / WHEEL_MESH_RADIUS;
		for (const [at, side] of [
			[g.nose, 1],
			[g.main, 1],
			[g.main, -1]
		] as const) {
			const len = Math.max(0.3, at[1] - axle);
			mat4.translate(this.m2, m, at[0], at[1], at[2] * side);
			mat4.rotateZ(this.m2, this.m2, fold);
			mat4.translate(this.m3, this.m2, 0, -len, 0);
			mat4.scale(this.m3, this.m3, k, k, k);
			this.models.wheel.push(this.m3, st);
			mat4.scale(this.m2, this.m2, 1, len, 1);
			this.models.gearStrut.push(this.m2, st);
		}
	}

	private bullets(w: World): void {
		for (const b of w.bullets) {
			if (!b.tracer) continue;
			w.fx.immediateStreak(
				b.x,
				b.y,
				b.z,
				b.vx,
				b.vy,
				b.size,
				0.011,
				b.color[0] * TRACER_K,
				b.color[1] * TRACER_K,
				b.color[2] * TRACER_K
			);
		}
		for (const s of w.shells) {
			if (s.kind === 'flak')
				w.fx.immediateStreak(s.x, s.y, s.z, s.vx, s.vy, 0.12, 0.006, 3, 2.4, 1.6);
			else
				w.fx.immediateGlow(
					s.x,
					s.y,
					s.z,
					s.kind === 'rocket' || s.kind === 'ffar' ? 1.4 : 0.6,
					10,
					5,
					2
				);
		}
	}

	private flares(w: World): void {
		for (const f of w.flares) {
			const heat = flareHeat(f);
			flareGlow(w.fx, f);
			if (!this.frozen && heat > 0)
				w.lights.add(f.x, f.y, f.z, [1, 0.9, 0.75], 30 * heat, 40, { life: 0.03 });
		}
	}

	/** Dotted bomb trajectory and impact marker. */
	sight(w: World, pts: readonly number[], color: [number, number, number]): void {
		if (!this.showSight) return;
		const size = 0.42 * sightScale(w);
		for (let i = 0; i + 1 < pts.length; i += 2) {
			const fade = 1 - i / pts.length;
			w.fx.immediateGlow(
				pts[i],
				pts[i + 1],
				0,
				size,
				color[0] * fade,
				color[1] * fade,
				color[2] * fade
			);
		}
	}

	/**
	 * Target reticle where the bomb will land: a ring standing on the ground
	 * facing the camera, with a pulsing core. Grows when the camera pulls back.
	 */
	marker(w: World, x: number, y: number, time: number, color: [number, number, number]): void {
		if (!this.showSight) return;
		const k = sightScale(w);
		const r = 5.5 * k;
		const pulse = (1.8 + Math.sin(time * 8) * 0.5) * k;
		w.fx.immediateGlow(x, y + 0.8, 0, pulse, color[0] * 1.6, color[1] * 1.6, color[2] * 1.6);
		const n = 12;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + time * 0.8;
			const bright = i % 3 === 0 ? 1.4 : 0.8;
			w.fx.immediateGlow(
				x + Math.cos(a) * r,
				y + r + Math.sin(a) * r,
				0,
				0.45 * k,
				color[0] * bright,
				color[1] * bright,
				color[2] * bright
			);
		}
	}
}
