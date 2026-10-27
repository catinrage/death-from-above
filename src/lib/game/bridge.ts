import { clamp } from '../engine/math';
import { WORLD } from './constants';
import type { Debris } from './debris';
import { dropUnit } from './deaths';
import type { River } from './river';
import type { Owner } from './types';
import type { World } from './world';

/** Deck half-width across the road (z). */
export const DECK_HALF_Z = 4.8;
/** Deck slab and girders hang this far below the road surface. */
export const DECK_THICK = 0.9;
/** Height of the through-truss above the road. */
export const TRUSS_H = 6.4;
export const SPAN_HP = 260;
const SPANS = 4;
const SPAN_SCORE = 250;

export const PONTOON_HP = 90;
/** Seconds of work to lay a pontoon across one fallen span. */
export const PONTOON_BUILD = 14;
/** Treadway sections per span, laid one after another from the engineers' bank. */
export const PONTOON_SECTIONS = 6;
/** Rope rails over the treadway: what an aircraft must clear above a pontoon. */
const PONTOON_TOP = 1.2;
const PONTOON_SCORE = 120;
/** A column has to sit at the gap this long before engineers are sent for. */
const CALL_DELAY = 4;
/** After sending a crew, the wait before another can be called. */
const CALL_COOLDOWN = 25;
/** Engineers start work once parked this close behind the broken edge. */
const WORK_REACH = 4;

/** An engineers' floating bridge laid across a fallen span. */
export interface Pontoon {
	/** 0..1 of the span laid so far. */
	progress: number;
	hp: number;
	flash: number;
	/** Finished: traffic crosses on it. */
	up: boolean;
	/** Bank the crew builds out from: +1 east, -1 west. */
	from: 1 | -1;
}

export interface Span {
	readonly index: number;
	/** West and east ends. */
	readonly x0: number;
	readonly x1: number;
	hp: number;
	down: boolean;
	/** Hit flash for the renderer. */
	flash: number;
	/** Wreckage it fell into, so a rebuild can clear it. */
	wreck: Debris[];
	/** Engineers' crossing over the gap once the span is down. */
	pontoon: Pontoon | null;
}

/**
 * A steel through-truss bridge carrying the road over the river. Each span
 * takes damage separately; a fallen span drops its traffic into the water
 * and blocks the crossing until engineers rebuild it for the next wave.
 * Mid-wave, a stranded column calls up a bridging crew that lays a pontoon
 * across the gap, which has to be sunk in turn.
 */
export class Bridge {
	readonly spans: Span[] = [];
	/** Pier positions between spans. */
	readonly piers: number[] = [];
	readonly west: number;
	readonly east: number;
	readonly deckY: number;
	readonly level: number;
	/** Seconds a column has sat at a gap with no crew on the way. */
	private stall = 0;
	private callCooldown = 0;

	constructor(river: River) {
		this.deckY = river.deckY;
		this.level = river.level;
		this.west = river.x0 - river.bridgeHalf;
		this.east = river.x0 + river.bridgeHalf;
		const len = (this.east - this.west) / SPANS;
		for (let i = 0; i < SPANS; i++) {
			const x0 = this.west + i * len;
			this.spans.push({
				index: i,
				x0,
				x1: x0 + len,
				hp: SPAN_HP,
				down: false,
				flash: 0,
				wreck: [],
				pontoon: null
			});
			if (i > 0) this.piers.push(x0);
		}
	}

	spanAt(x: number): Span | null {
		if (x < this.west || x > this.east) return null;
		const i = Math.min(SPANS - 1, Math.floor(((x - this.west) / (this.east - this.west)) * SPANS));
		return this.spans[i];
	}

	/** Traffic can cross: the span stands, or a finished pontoon spans the gap. */
	passable(s: Span): boolean {
		return !s.down || !!s.pontoon?.up;
	}

	/** Road height on an intact span or finished pontoon at (x, z), or null. */
	deckAt(x: number, z: number): number | null {
		if (Math.abs(z) > DECK_HALF_Z) return null;
		const s = this.spanAt(x);
		return s && this.passable(s) ? this.deckY : null;
	}

	/** Top of the steelwork over x (what an aircraft must clear), or null. */
	topAt(x: number): number | null {
		const s = this.spanAt(x);
		if (!s) return null;
		if (!s.down) return this.deckY + TRUSS_H;
		return s.pontoon?.up ? this.deckY + PONTOON_TOP : null;
	}

	/** West and east ends of the treadway laid so far over a span. */
	laid(s: Span): [number, number] {
		const p = s.pontoon;
		if (!p) return [s.x0, s.x0];
		const len = (s.x1 - s.x0) * p.progress;
		return p.from > 0 ? [s.x1 - len, s.x1] : [s.x0, s.x0 + len];
	}

	get downCount(): number {
		return this.spans.reduce((n, s) => n + (s.down ? 1 : 0), 0);
	}

	/**
	 * Furthest x a unit `half` long heading `dir` may reach before a fallen
	 * span, or null when the way is clear.
	 */
	stopLine(x: number, dir: number, half: number): number | null {
		const s = this.gapAhead(x, dir);
		if (!s) return null;
		return dir < 0 ? s.x1 + half + 1.5 : s.x0 - half - 1.5;
	}

	/** First span ahead of x, heading `dir`, that traffic cannot cross. */
	gapAhead(x: number, dir: number): Span | null {
		const order = dir < 0 ? [...this.spans].reverse() : this.spans;
		for (const s of order) {
			if (this.passable(s)) continue;
			if (dir < 0 && x > s.x1 - 0.5) return s;
			if (dir > 0 && x < s.x0 + 0.5) return s;
		}
		return null;
	}

	/** Blast damage to the steelwork; spans that run out of strength fall. */
	blast(
		w: World,
		x: number,
		y: number,
		z: number,
		radius: number,
		damage: number,
		pierce: number,
		by: Owner
	): void {
		for (const s of this.spans) {
			if (s.down) {
				if (s.pontoon) this.blastPontoon(w, s, x, y, z, radius, damage, by);
				continue;
			}
			this.damage(w, s, this.blastDamage(s, x, y, z, radius, damage, pierce), by);
		}
	}

	/** What a blast at (x, y, z) would take off a span's strength (0 when out of reach). */
	blastDamage(
		s: Span,
		x: number,
		y: number,
		z: number,
		radius: number,
		damage: number,
		pierce: number
	): number {
		const dx = Math.max(s.x0 - x, 0, x - s.x1);
		const dy = Math.max(this.deckY - DECK_THICK - y, 0, y - this.deckY - TRUSS_H);
		const dz = Math.max(Math.abs(z) - DECK_HALF_Z, 0);
		const d = Math.hypot(dx, dy, dz);
		if (d >= radius) return 0;
		const k = 1 - d / radius;
		// Steel and concrete shrug off fragments; heavy and penetrating charges do the work.
		return damage * (0.1 + 0.9 * k * k) * (0.35 + 0.65 * pierce);
	}

	/** The pontoon is pontoon boats and planking: any decent hit near it does the work. */
	private blastPontoon(
		w: World,
		s: Span,
		x: number,
		y: number,
		z: number,
		radius: number,
		damage: number,
		by: Owner
	): void {
		const [a, b] = this.laid(s);
		const dx = Math.max(a - x, 0, x - b);
		const dy = Math.max(this.level - y, 0, y - this.deckY - PONTOON_TOP);
		const dz = Math.max(Math.abs(z) - DECK_HALF_Z, 0);
		const d = Math.hypot(dx, dy, dz);
		if (d >= radius) return;
		const k = 1 - d / radius;
		this.damage(w, s, damage * (0.25 + 0.75 * k * k), by);
	}

	/** Direct damage, e.g. cannon shells striking the deck (or the pontoon over a gap). */
	damage(w: World, s: Span, amount: number, by: Owner): void {
		if (amount <= 0) return;
		if (s.down) {
			const p = s.pontoon;
			if (!p) return;
			p.hp -= amount;
			p.flash = Math.min(1, p.flash + 0.5);
			if (p.hp <= 0) this.sink(w, s, by);
			return;
		}
		s.hp -= amount;
		s.flash = Math.min(1, s.flash + 0.5);
		if (s.hp <= 0) this.collapse(w, s, by);
	}

	collapse(w: World, s: Span, by: Owner): void {
		s.down = true;
		s.hp = 0;
		s.pontoon = null;
		const mid = (s.x0 + s.x1) / 2;
		const half = (s.x1 - s.x0) / 4;
		const y = this.deckY;
		for (const u of w.units) {
			if (!u.alive || u.x < s.x0 - 1 || u.x > s.x1 + 1 || Math.abs(u.y - y) > 2.5) continue;
			dropUnit(w, u, by);
		}
		for (const side of [-1, 1]) {
			const cx = mid + side * half;
			// Each half hinges on its pier and folds into the river, inner end first.
			const deck = w.debris.spawn({
				x: cx,
				y: y - DECK_THICK * 0.5,
				z: 0,
				vx: -side * 0.6,
				vy: -1,
				vz: 0,
				half: [half, DECK_THICK * 0.5, DECK_HALF_Z],
				parts: [{ mesh: 'bridgeDeckHalf', local: IDENTITY }],
				mass: 60,
				spin: 0,
				life: 1e6,
				char: 0.25,
				q: new Float32Array([0, 0, 0, 1])
			});
			deck.wz = side * 0.55;
			deck.persistent = true;
			s.wreck.push(deck);
			for (const zs of [-1, 1]) {
				const truss = w.debris.spawn({
					x: cx,
					y: y + TRUSS_H * 0.5,
					z: zs * DECK_HALF_Z,
					vx: -side * 0.8,
					vy: -0.5,
					vz: zs * 1.2,
					half: [half, TRUSS_H * 0.5, 0.35],
					parts: [{ mesh: 'bridgeTrussHalf', local: IDENTITY }],
					mass: 25,
					spin: 0,
					life: 1e6,
					char: 0.2,
					q: new Float32Array([0, 0, 0, 1])
				});
				truss.wz = side * 0.65;
				truss.wx = zs * 0.25;
				truss.persistent = true;
				s.wreck.push(truss);
			}
		}
		for (const ex of [s.x0, s.x1, mid]) {
			w.fx.explosion(ex, y, 0, 0.7, true);
			w.fx.impact(ex, y, 0, 'metal', true);
		}
		w.fx.shake(mid, y, 0.5);
		w.sound.play('collapse', mid, y, 1.2);
		w.sound.boom(1.4, mid, y);
		w.events.kill('BRIDGE SPAN', SPAN_SCORE, mid, y + TRUSS_H + 4, by);
		if (this.downCount === 1)
			w.events.message('BRIDGE DOWN', 'The convoy is stranded on the far bank', 'good');
	}

	/** The pontoon breaks up: traffic on it goes into the river, the pieces drift and sink. */
	sink(w: World, s: Span, by: Owner): void {
		const p = s.pontoon;
		if (!p) return;
		const [a, b] = this.laid(s);
		s.pontoon = null;
		const y = this.deckY;
		for (const u of w.units) {
			if (!u.alive || u.x < a - 1 || u.x > b + 1 || Math.abs(u.y - y) > 2.5) continue;
			dropUnit(w, u, by);
		}
		const n = Math.max(1, Math.round(((b - a) / (s.x1 - s.x0)) * PONTOON_SECTIONS));
		const len = (b - a) / n;
		for (let k = 0; k < n; k++) {
			const x = a + (k + 0.5) * len;
			const piece = w.debris.spawn({
				x,
				y: y - 0.3,
				z: w.rng.range(-1, 1),
				vx: w.rng.gauss(2),
				vy: w.rng.range(1, 4),
				vz: w.rng.gauss(1.5),
				half: [len / 2, 0.5, DECK_HALF_Z * 0.8],
				parts: [{ mesh: 'pontoonSection', local: IDENTITY }],
				mass: 8,
				spin: 1.2,
				life: 30,
				char: 0.3
			});
			piece.wz = w.rng.gauss(0.6);
			const wl = w.surface.water(x, 0);
			if (wl > w.terrain.heightAt(x)) w.fx.water.splash(x, wl, 0, 1.3);
			else w.fx.impact(x, w.terrain.heightAt(x), 0, 'ground', true);
		}
		const mid = (a + b) / 2;
		w.fx.explosion(mid, y, 0, 0.5, true);
		w.fx.impact(mid, y, 0, 'metal', true);
		w.fx.shake(mid, y, 0.3);
		w.sound.play('collapse', mid, y, 0.8);
		w.sound.play('splash', mid, this.level, 1.4);
		w.events.kill(
			p.up ? 'PONTOON BRIDGE' : 'PONTOON',
			p.up ? PONTOON_SCORE : PONTOON_SCORE / 2,
			mid,
			y + 5,
			by
		);
	}

	update(w: World, dt: number): void {
		this.engineers(w, dt);
		for (const s of this.spans) {
			s.flash = Math.max(0, s.flash - dt * 3);
			if (s.pontoon) s.pontoon.flash = Math.max(0, s.pontoon.flash - dt * 3);
			if (s.down || s.hp > SPAN_HP * 0.5) continue;
			// A badly hurt span smokes from its broken members.
			const hurt = 1 - s.hp / SPAN_HP;
			if (w.rng.chance(dt * 3 * hurt)) {
				const x = w.rng.range(s.x0 + 2, s.x1 - 2);
				w.fx.trail(x, this.deckY + w.rng.range(0, TRUSS_H), 0, 2.2, 0.05, 0.7, 4, 2);
			}
		}
	}

	/**
	 * A column stranded at a gap sends for a bridging crew; a crew parked at
	 * the broken edge lays its pontoon across, section by section.
	 */
	private engineers(w: World, dt: number): void {
		this.callCooldown = Math.max(0, this.callCooldown - dt);
		let crew = false,
			stranded = false;
		for (const u of w.units) {
			if (!u.alive || u.def.isStatic) continue;
			const gap = this.gapAhead(u.x, u.dir);
			if (!gap) continue;
			const room = ((u.dir < 0 ? gap.x1 : gap.x0) - u.x) * u.dir - u.def.half[0];
			if (u.def.kind === 'engineer') {
				crew = true;
				if (room < 1.5 + WORK_REACH && u.stun <= 0) this.lay(w, gap, u.dir, dt);
			} else if (u.dir < 0 && room < 8) stranded = true;
		}
		if (!stranded || crew) {
			this.stall = 0;
			return;
		}
		this.stall += dt;
		if (this.stall < CALL_DELAY || this.callCooldown > 0) return;
		this.stall = 0;
		this.callCooldown = CALL_COOLDOWN;
		w.spawnUnit('engineer', WORLD.enemySpawnX, w.rng.range(2, 3.5), -1);
		w.events.message('ENGINEERS', 'A bridging crew is on its way to the gap', 'warn');
	}

	private lay(w: World, s: Span, dir: number, dt: number): void {
		let p = s.pontoon;
		if (!p)
			p = s.pontoon = { progress: 0, hp: PONTOON_HP, flash: 0, up: false, from: dir < 0 ? 1 : -1 };
		if (p.up) return;
		p.progress = Math.min(1, p.progress + dt / PONTOON_BUILD);
		if (w.rng.chance(dt * 3)) {
			// Sparks and clanks where the next section goes on.
			const [a, b] = this.laid(s);
			w.fx.impact(p.from > 0 ? a : b, this.deckY, w.rng.range(-3, 3), 'metal');
		}
		if (p.progress >= 1) {
			p.up = true;
			w.events.message('PONTOON BRIDGE', 'Enemy engineers bridged the gap. Sink it', 'warn');
		}
	}

	/** Engineers restore every span and the wreckage is cleared away. */
	rebuild(w: World): void {
		const fallen = this.downCount;
		this.stall = 0;
		this.callCooldown = 0;
		for (const s of this.spans) {
			for (const d of s.wreck) w.debris.remove(d);
			s.wreck = [];
			s.pontoon = null;
			s.down = false;
			s.hp = SPAN_HP;
			s.flash = 0;
		}
		if (fallen > 0)
			w.events.message('BRIDGE REBUILT', 'Enemy engineers repaired the crossing', 'warn');
	}

	/** Damage fraction 0..1 of a span, for scorch marks. */
	wear(s: Span): number {
		return clamp(1 - s.hp / SPAN_HP, 0, 1);
	}
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
