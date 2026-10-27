import type { World } from './world';

/** What an edge marker points at: armour and emplacements, enemy aircraft, or a boss. */
export type EdgeKind = 'ground' | 'air' | 'boss';

/** An enemy projected to screen space (CSS px; may lie far outside the viewport). */
export interface EdgeContact {
	kind: EdgeKind;
	sx: number;
	sy: number;
}

/** Margins (CSS px) keeping the markers clear of the HUD panels. */
export interface EdgeInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** A small chevron held on the screen edge, pointing at one or more off-screen enemies. */
export interface EdgeMarker {
	kind: EdgeKind;
	/** Position in CSS px. */
	x: number;
	y: number;
	/** Screen bearing toward the enemy (radians, 0 = right, clockwise). */
	angle: number;
	/** 0..1, larger for enemies just beyond the edge of the screen. */
	near: number;
	/** Enemies merged into this marker. */
	count: number;
}

export interface EdgeOptions {
	insets: EdgeInsets;
	/** Markers closer than this (CSS px) merge into one. */
	merge: number;
	/** Most markers drawn at once. */
	max: number;
}

/** Clear of the top bar, the status panel and weapon rack (the bottom ~210 px), and the sides. */
export const EDGE_DEFAULTS: EdgeOptions = {
	insets: { top: 64, right: 24, bottom: 230, left: 24 },
	merge: 24,
	max: 20
};

/** World point to CSS px, or null when the camera cannot see it. */
type Project = (x: number, y: number, z: number) => [number, number] | null;

/**
 * Where on the inset frame a chevron for an enemy at (sx, sy) sits: along the
 * ray from the frame's centre toward it. Null when the enemy is on screen.
 */
export function edgePoint(
	sx: number,
	sy: number,
	cssW: number,
	cssH: number,
	insets: EdgeInsets
): { x: number; y: number; angle: number; overshoot: number } | null {
	const ox = sx < 0 ? -sx : sx > cssW ? sx - cssW : 0;
	const oy = sy < 0 ? -sy : sy > cssH ? sy - cssH : 0;
	if (ox === 0 && oy === 0) return null;
	const l = insets.left;
	const r = Math.max(l, cssW - insets.right);
	const t = insets.top;
	const b = Math.max(t, cssH - insets.bottom);
	const cx = (l + r) / 2;
	const cy = (t + b) / 2;
	const dx = sx - cx;
	const dy = sy - cy;
	const hx = (r - l) / 2;
	const hy = (b - t) / 2;
	// Scale the ray so it just touches the nearer side of the frame.
	const k = Math.min(
		dx !== 0 ? hx / Math.abs(dx) : Infinity,
		dy !== 0 ? hy / Math.abs(dy) : Infinity
	);
	return {
		x: cx + dx * k,
		y: cy + dy * k,
		angle: Math.atan2(dy, dx),
		overshoot: Math.hypot(ox, oy)
	};
}

const RANK: Record<EdgeKind, number> = { boss: 0, air: 1, ground: 2 };

/**
 * Chevrons for the off-screen contacts: bosses first, then nearest first;
 * markers that would overlap merge, and at most `max` are kept.
 */
export function edgeMarkers(
	contacts: readonly EdgeContact[],
	cssW: number,
	cssH: number,
	opts: EdgeOptions = EDGE_DEFAULTS
): EdgeMarker[] {
	const far = Math.max(cssW, cssH) * 1.5;
	const cands: { kind: EdgeKind; x: number; y: number; angle: number; overshoot: number }[] = [];
	for (const c of contacts) {
		const e = edgePoint(c.sx, c.sy, cssW, cssH, opts.insets);
		if (e) cands.push({ kind: c.kind, ...e });
	}
	cands.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.overshoot - b.overshoot);
	const out: EdgeMarker[] = [];
	const r2 = opts.merge * opts.merge;
	for (const c of cands) {
		const near = Math.max(0, Math.min(1, 1 - c.overshoot / far));
		const hit = out.find((m) => (m.x - c.x) ** 2 + (m.y - c.y) ** 2 < r2);
		if (hit) {
			// A group reads as strong as its nearest member.
			hit.count++;
			hit.near = Math.max(hit.near, near);
			continue;
		}
		if (out.length >= opts.max) continue;
		out.push({ kind: c.kind, x: c.x, y: c.y, angle: c.angle, near, count: 1 });
	}
	return out;
}

/**
 * Every living enemy projected to the screen. Launchers locking a pilot are
 * left out: the threat ring around the aircraft already points at them.
 */
export function enemyContacts(w: World, project: Project): EdgeContact[] {
	const out: EdgeContact[] = [];
	const pilots = w.pilots();
	for (const u of w.units) {
		if (!u.alive) continue;
		const y = u.y + u.def.half[1];
		if (pilots.some((p) => p.lockers.some((l) => l.x === u.x && l.y === y))) continue;
		const s = project(u.x, y, u.z);
		if (s) out.push({ kind: u.def.boss ? 'boss' : 'ground', sx: s[0], sy: s[1] });
	}
	for (const a of w.air) {
		if (!a.alive || a.dying) continue;
		const s = project(a.x, a.y, a.z);
		if (s) out.push({ kind: 'air', sx: s[0], sy: s[1] });
	}
	return out;
}
