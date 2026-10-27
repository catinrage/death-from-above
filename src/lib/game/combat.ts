import type { BlastSpec } from './defs-bombs';
import { killUnit } from './deaths';
import type { Owner, Unit } from './types';
import type { World } from './world';

export type DamageCause = 'bullet' | 'blast' | 'fire';

/**
 * Whether a unit reaches the battle line, where bombs and bullets fly. Things
 * far off it (the cruiser still coming down the river) are out of reach. The
 * railway runs well behind the road but combat treats it side-on: trains count.
 */
export function inBattlePlane(u: Unit): boolean {
	return !!u.def.rail || Math.abs(u.z) - u.def.half[2] < 20;
}

/**
 * Distance from a point to a unit's hitbox. Depth (z) is de-emphasised:
 * combat is side-on. Trains run on their own line behind the road, where
 * depth is ignored altogether so a bomb on top of a wagon counts as a hit.
 */
export function distToUnit(u: Unit, x: number, y: number, z: number): number {
	const [hx, hy, hz] = u.def.half;
	const dx = Math.max(Math.abs(x - u.x) - hx, 0);
	const dy = Math.max(Math.abs(y - (u.y + hy)) - hy, 0);
	const dz = u.def.rail ? 0 : Math.max(Math.abs(z - u.z) - hz, 0) * 0.35;
	return Math.hypot(dx, dy, dz);
}

/** Segment vs the unit's side-on (XY) box. Returns the hit fraction in [0, 1] or -1. */
export function segmentVsUnit(
	u: Unit,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	pad = 0
): number {
	const [hx, hy] = u.def.half;
	return segmentVsBox(
		x0,
		y0,
		x1,
		y1,
		u.x - hx - pad,
		u.y - pad * 0.3,
		u.x + hx + pad,
		u.y + hy * 2 + pad
	);
}

export function segmentVsBox(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	minX: number,
	minY: number,
	maxX: number,
	maxY: number
): number {
	let t0 = 0,
		t1 = 1;
	const dx = x1 - x0,
		dy = y1 - y0;
	if (Math.abs(dx) < 1e-9) {
		if (x0 < minX || x0 > maxX) return -1;
	} else {
		let a = (minX - x0) / dx,
			b = (maxX - x0) / dx;
		if (a > b) [a, b] = [b, a];
		t0 = Math.max(t0, a);
		t1 = Math.min(t1, b);
		if (t0 > t1) return -1;
	}
	if (Math.abs(dy) < 1e-9) {
		if (y0 < minY || y0 > maxY) return -1;
	} else {
		let a = (minY - y0) / dy,
			b = (maxY - y0) / dy;
		if (a > b) [a, b] = [b, a];
		t0 = Math.max(t0, a);
		t1 = Math.min(t1, b);
		if (t0 > t1) return -1;
	}
	return t0;
}

/** Closest approach of a segment to a point, as a fraction along the segment. */
export function segmentVsCircle(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	cx: number,
	cy: number,
	r: number
): number {
	const dx = x1 - x0,
		dy = y1 - y0;
	const len2 = dx * dx + dy * dy;
	const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2)) : 0;
	const px = x0 + dx * t - cx,
		py = y0 + dy * t - cy;
	return px * px + py * py <= r * r ? t : -1;
}

export function damageUnit(
	w: World,
	u: Unit,
	amount: number,
	pierce: number,
	by: Owner,
	fromX: number,
	cause: DamageCause
): void {
	if (!u.alive || amount <= 0) return;
	const armorK = 1 - u.def.armor * (1 - Math.min(pierce, 1));
	u.hp -= amount * armorK;
	u.flash = Math.min(1, u.flash + 0.6);
	u.lastHitBy = by;
	if (u.def.category === 'infantry' && cause !== 'bullet') u.panic = 2.5;
	if (u.hp <= 0) {
		killUnit(w, u, fromX, cause, by);
	} else if (u.def.kind === 'apc' && u.hp < u.def.hp * 0.55 && u.state !== 'deploy') {
		u.state = 'deploy';
		u.stateTime = 0;
	}
}

export interface ExplodeOptions {
	/** Visual style; 'auto' picks ground or air burst from height. */
	visual?: 'auto' | 'none';
	/** Multiplier for damage dealt to the player's aircraft. */
	playerScale?: number;
	/** Extra camera shake. */
	shake?: number;
}

/** Applies a blast: damage, impulses, craters, scenery destruction and effects. */
export function explode(
	w: World,
	x: number,
	y: number,
	z: number,
	b: BlastSpec,
	by: Owner,
	o: ExplodeOptions = {}
): void {
	const g = w.surface.under(x, y, z);
	const kind = w.surface.kind;
	const onGround = y - g < Math.max(3.5, b.radius * 0.3);
	const wet = onGround && kind === 'water';
	const r = b.radius;
	if (o.visual !== 'none' || b.size >= 1) w.sound.boom(b.size, x, y, !onGround);

	for (const u of w.units) {
		if (Math.abs(u.x - x) > r + u.def.half[0] + 2) continue;
		const d = distToUnit(u, x, y, z);
		if (d >= r) continue;
		const k = 1 - d / r;
		if (u.alive) {
			damageUnit(w, u, b.damage * (0.15 + 0.85 * k * k), b.pierce, by, x, 'blast');
		} else {
			u.char = Math.min(1, u.char + k);
		}
	}
	for (const a of w.air) {
		if (!a.alive) continue;
		const d = Math.hypot(a.x - x, a.y - y) - a.radius;
		if (d < r) a.damage(w, b.damage * (1 - Math.max(d, 0) / r) * 0.8, by);
	}
	const p = w.player;
	if (p && p.alive) {
		const d = Math.max(0, Math.hypot(p.x - x, p.y - y) - p.def.radius * 0.5);
		if (d < r) {
			const k = 1 - d / r;
			const scale = o.playerScale ?? (by === 'player' ? 0.3 : 1);
			p.hit(
				b.damage * k * k * scale * 0.5,
				w,
				x,
				y,
				false,
				by === 'player' ? 'own-blast' : 'blast'
			);
		}
	}
	for (const m of w.missiles) {
		if (Math.hypot(m.x - x, m.y - y) < r * 0.6) m.age = m.life;
	}

	const collapsed = w.props.blast(x, y, z, r * 1.15, b.damage);
	for (const h of collapsed) {
		w.fx.explosion(h.x, h.y + 2, h.z, 0.5, true);
		for (let i = 0; i < 8; i++) {
			w.debris.spawn({
				x: h.x + w.rng.range(-3, 3),
				y: h.y + w.rng.range(1, 4),
				z: h.z + w.rng.range(-2, 2),
				vx: w.rng.gauss(7),
				vy: w.rng.range(6, 14),
				vz: w.rng.gauss(3),
				half: [0.45, 0.32, 0.4],
				parts: [{ mesh: w.rng.pick(['chunk0', 'chunk1', 'chunk2'] as const), local: IDENTITY }],
				mass: 1,
				tint: [1.3, 1.15, 0.95],
				life: w.rng.range(6, 12)
			});
		}
		w.fires.add(h.x, h.y + 1, h.z, 1.2, w.rng.range(15, 30), { radius: 2 });
		w.civilians.houseCollapsed(w, h, by);
	}
	w.civilians.blast(w, x, y, z, r, b.damage, by);

	w.bridge?.blast(w, x, y, z, r, b.damage, b.pierce, by);
	w.railBridge?.blast(w, x, y, z, r, b.damage, b.pierce, by);
	w.railway?.blast(w, x, y, r, b.damage, b.pierce, by);
	w.troops.blast(x, y, r, b.damage * 0.6);
	w.allies.blast(x, y, r, b.damage, b.pierce);
	w.debris.impulse(x, y, z, r * 1.5, 16 * Math.sqrt(b.size));
	if (wet) {
		// The river swallows the blast: a towering column of water, no crater.
		if (o.visual !== 'none') {
			w.fx.water.column(x, g, z, b.size);
			w.fx.flash(0.15 * b.size);
		}
		w.sound.play('splash', x, g, Math.min(2, 0.6 + b.size * 0.4));
	} else {
		// Bomb-class ground bursts (not napalm splashes or shell hits) hurl rocks.
		if (onGround && b.size >= 1 && kind === 'ground') throwRocks(w, x, Math.max(y, g), z, b.size);
		if (onGround && b.crater[0] > 0 && kind === 'ground') {
			w.terrain.crater(x, z, b.crater[0], b.crater[1], 1, Math.min(1, 0.5 + b.size * 0.3));
		}
		if (o.visual !== 'none') {
			w.fx.explosion(x, onGround ? Math.max(y, g) : y, z, b.size, onGround);
		}
	}
	if (o.shake) w.fx.shake(x, y, o.shake);
}

export const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const ROCKS = ['chunk0', 'chunk1', 'chunk2'] as const;

/** Clods of earth and rock thrown out of a ground burst as tumbling rigid bodies. */
function throwRocks(w: World, x: number, y: number, z: number, size: number): void {
	const q = Math.sqrt(size);
	const n = Math.min(12, Math.round(3 + 3 * size));
	for (let i = 0; i < n; i++) {
		const a = w.rng.range(0.3, Math.PI - 0.3);
		const sp = w.rng.range(10, 24) * q;
		w.debris.spawn({
			x: x + w.rng.gauss(1.5),
			y: y + 1,
			z: z + w.rng.gauss(1),
			vx: Math.cos(a) * sp,
			vy: Math.sin(a) * sp,
			vz: w.rng.gauss(4),
			half: [0.45, 0.32, 0.4],
			parts: [{ mesh: w.rng.pick(ROCKS), local: IDENTITY }],
			mass: 0.7,
			spin: 10,
			tint: [0.62, 0.5, 0.38],
			char: 0.3,
			burn: w.rng.chance(0.25) ? w.rng.range(0.8, 2) : 0,
			life: w.rng.range(5, 9),
			scale: w.rng.range(0.35, 0.85)
		});
	}
}
