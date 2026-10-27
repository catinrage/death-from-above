import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import {
	EDGE_DEFAULTS,
	edgeMarkers,
	edgePoint,
	enemyContacts,
	type EdgeContact
} from './edge-markers';
import { Player } from './player';
import { testWorld } from './test-world';

const W = 1000;
const H = 600;
const INSETS = { top: 50, right: 20, bottom: 100, left: 20 };
const OPTS = { ...EDGE_DEFAULTS, insets: INSETS };

describe('edgePoint', () => {
	it('is null for anything on screen', () => {
		expect(edgePoint(500, 300, W, H, INSETS)).toBeNull();
		expect(edgePoint(0, 0, W, H, INSETS)).toBeNull();
		expect(edgePoint(W, H, W, H, INSETS)).toBeNull();
	});

	it('pins an enemy off to the right onto the right side of the inset frame', () => {
		// The frame's centre is (500, 275): straight right of it.
		const e = edgePoint(3000, 275, W, H, INSETS)!;
		expect(e.x).toBeCloseTo(W - INSETS.right);
		expect(e.y).toBeCloseTo(275);
		expect(e.angle).toBeCloseTo(0);
		expect(e.overshoot).toBeCloseTo(2000);
	});

	it('points along the ray from the frame centre and stays inside the insets', () => {
		const e = edgePoint(-400, 900, W, H, INSETS)!;
		expect(e.angle).toBeCloseTo(Math.atan2(900 - 275, -400 - 500));
		expect(e.x).toBeGreaterThanOrEqual(INSETS.left - 1e-9);
		expect(e.y).toBeLessThanOrEqual(H - INSETS.bottom + 1e-9);
		// It touches the frame on one side or the other.
		const onSide = Math.abs(e.x - INSETS.left) < 1e-6 || Math.abs(e.y - (H - INSETS.bottom)) < 1e-6;
		expect(onSide).toBe(true);
	});

	it('handles an enemy straight above the centre', () => {
		const e = edgePoint(500, -200, W, H, INSETS)!;
		expect(e.x).toBeCloseTo(500);
		expect(e.y).toBeCloseTo(INSETS.top);
		expect(e.angle).toBeCloseTo(-Math.PI / 2);
	});
});

describe('edgeMarkers', () => {
	it('ignores on-screen enemies', () => {
		expect(edgeMarkers([{ kind: 'ground', sx: 400, sy: 300 }], W, H, OPTS)).toEqual([]);
	});

	it('merges a convoy into one marker, keeping the nearest as its strength', () => {
		const convoy: EdgeContact[] = [0, 1, 2, 3, 4].map((i) => ({
			kind: 'ground',
			sx: 1200 + i * 40,
			sy: 250 + i
		}));
		const m = edgeMarkers(convoy, W, H, OPTS);
		expect(m).toHaveLength(1);
		expect(m[0].count).toBe(5);
		expect(m[0].near).toBeCloseTo(1 - 200 / (W * 1.5));
	});

	it('makes nearer enemies stronger', () => {
		const m = edgeMarkers(
			[
				{ kind: 'ground', sx: 4000, sy: 250 },
				{ kind: 'ground', sx: -100, sy: 250 }
			],
			W,
			H,
			OPTS
		);
		expect(m).toHaveLength(2);
		expect(m[0].x).toBeCloseTo(INSETS.left);
		expect(m[0].near).toBeGreaterThan(m[1].near);
	});

	it('caps the count, putting bosses first', () => {
		const many: EdgeContact[] = [];
		for (let i = 0; i < 40; i++) many.push({ kind: 'air', sx: 500 + i * 300, sy: -5000 });
		many.push({ kind: 'boss', sx: 99999, sy: 250 });
		const m = edgeMarkers(many, W, H, { ...OPTS, max: 5 });
		expect(m).toHaveLength(5);
		expect(m[0].kind).toBe('boss');
	});

	it('lets a near enemy strengthen a farther one it merges into', () => {
		const m = edgeMarkers(
			[
				{ kind: 'boss', sx: 5000, sy: 275 },
				{ kind: 'ground', sx: 1100, sy: 275 }
			],
			W,
			H,
			OPTS
		);
		expect(m).toHaveLength(1);
		expect(m[0].kind).toBe('boss');
		expect(m[0].count).toBe(2);
		expect(m[0].near).toBeCloseTo(1 - 100 / (W * 1.5));
	});

	it('keeps separate markers apart by at least the merge distance', () => {
		const ring: EdgeContact[] = [];
		for (let i = 0; i < 200; i++) {
			const a = (i / 200) * Math.PI * 2;
			ring.push({ kind: 'ground', sx: 500 + Math.cos(a) * 3000, sy: 250 + Math.sin(a) * 3000 });
		}
		const m = edgeMarkers(ring, W, H, OPTS);
		expect(m.length).toBeLessThanOrEqual(OPTS.max);
		for (let i = 0; i < m.length; i++)
			for (let j = i + 1; j < m.length; j++)
				expect(Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y)).toBeGreaterThanOrEqual(OPTS.merge);
		expect(m.reduce((n, k) => n + k.count, 0)).toBeLessThanOrEqual(200);
	});
});

describe('enemyContacts', () => {
	const flat = (x: number, y: number): [number, number] => [x, -y];

	it('lists living ground units, bosses and enemy aircraft', () => {
		const w = testWorld();
		w.spawnUnit('tank', 2000, 0);
		const dead = w.spawnUnit('truck', 2100, 0);
		dead.alive = false;
		w.spawnUnit('superTank', 2600, 0);
		w.air.push(new AirUnit(w.newId(), 'fighter', 1800, 300));
		const c = enemyContacts(w, flat);
		expect(c.map((k) => k.kind).sort()).toEqual(['air', 'boss', 'ground']);
	});

	it('leaves out launchers already shown by the threat ring', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1500, w.ground(1500) + 200, 0);
		w.player = p;
		const sam = w.spawnUnit('sam', 2000, 0);
		w.spawnUnit('tank', 2200, 0);
		p.lockers.push({ x: sam.x, y: sam.y + sam.def.half[1], progress: 0.5 });
		const c = enemyContacts(w, flat);
		expect(c).toHaveLength(1);
		expect(c[0].sx).toBe(2200);
	});

	it('skips anything the camera cannot project', () => {
		const w = testWorld();
		w.spawnUnit('tank', 2000, 0);
		expect(enemyContacts(w, () => null)).toEqual([]);
	});
});
