import { clamp } from '../engine/math';
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
}

/**
 * A steel through-truss bridge carrying the road over the river. Each span
 * takes damage separately; a fallen span drops its traffic into the water
 * and blocks the crossing until engineers rebuild it for the next wave.
 */
export class Bridge {
	readonly spans: Span[] = [];
	/** Pier positions between spans. */
	readonly piers: number[] = [];
	readonly west: number;
	readonly east: number;
	readonly deckY: number;
	readonly level: number;

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
				wreck: []
			});
			if (i > 0) this.piers.push(x0);
		}
	}

	spanAt(x: number): Span | null {
		if (x < this.west || x > this.east) return null;
		const i = Math.min(SPANS - 1, Math.floor(((x - this.west) / (this.east - this.west)) * SPANS));
		return this.spans[i];
	}

	/** Road height on an intact span at (x, z), or null. */
	deckAt(x: number, z: number): number | null {
		if (Math.abs(z) > DECK_HALF_Z) return null;
		const s = this.spanAt(x);
		return s && !s.down ? this.deckY : null;
	}

	/** Top of the steelwork over x (what an aircraft must clear), or null. */
	topAt(x: number): number | null {
		const s = this.spanAt(x);
		return s && !s.down ? this.deckY + TRUSS_H : null;
	}

	get downCount(): number {
		return this.spans.reduce((n, s) => n + (s.down ? 1 : 0), 0);
	}

	/**
	 * Furthest x a unit `half` long heading `dir` may reach before a fallen
	 * span, or null when the way is clear.
	 */
	stopLine(x: number, dir: number, half: number): number | null {
		const order = dir < 0 ? [...this.spans].reverse() : this.spans;
		for (const s of order) {
			if (!s.down) continue;
			if (dir < 0 && x > s.x1 - 0.5) return s.x1 + half + 1.5;
			if (dir > 0 && x < s.x0 + 0.5) return s.x0 - half - 1.5;
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
			if (s.down) continue;
			const dx = Math.max(s.x0 - x, 0, x - s.x1);
			const dy = Math.max(this.deckY - DECK_THICK - y, 0, y - this.deckY - TRUSS_H);
			const dz = Math.max(Math.abs(z) - DECK_HALF_Z, 0);
			const d = Math.hypot(dx, dy, dz);
			if (d >= radius) continue;
			const k = 1 - d / radius;
			// Steel and concrete shrug off fragments; heavy and penetrating charges do the work.
			this.damage(w, s, damage * (0.1 + 0.9 * k * k) * (0.35 + 0.65 * pierce), by);
		}
	}

	/** Direct damage, e.g. cannon shells striking the deck. */
	damage(w: World, s: Span, amount: number, by: Owner): void {
		if (s.down || amount <= 0) return;
		s.hp -= amount;
		s.flash = Math.min(1, s.flash + 0.5);
		if (s.hp <= 0) this.collapse(w, s, by);
	}

	collapse(w: World, s: Span, by: Owner): void {
		s.down = true;
		s.hp = 0;
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

	update(w: World, dt: number): void {
		for (const s of this.spans) {
			s.flash = Math.max(0, s.flash - dt * 3);
			if (s.down || s.hp > SPAN_HP * 0.5) continue;
			// A badly hurt span smokes from its broken members.
			const hurt = 1 - s.hp / SPAN_HP;
			if (w.rng.chance(dt * 3 * hurt)) {
				const x = w.rng.range(s.x0 + 2, s.x1 - 2);
				w.fx.trail(x, this.deckY + w.rng.range(0, TRUSS_H), 0, 2.2, 0.05, 0.7, 4, 2);
			}
		}
	}

	/** Engineers restore every span and the wreckage is cleared away. */
	rebuild(w: World): void {
		const fallen = this.downCount;
		for (const s of this.spans) {
			for (const d of s.wreck) w.debris.remove(d);
			s.wreck = [];
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
