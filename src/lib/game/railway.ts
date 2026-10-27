import { clamp, damp } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { damageUnit, IDENTITY } from './combat';
import { WORLD } from './constants';
import { dropUnit } from './deaths';
import type { Bridge, BridgeSpec } from './bridge';
import type { RailLine } from './rail';
import type { River } from './river';
import type { Owner, Unit, UnitKind } from './types';
import type { World } from './world';

/** Top running speed and how hard the crew can accelerate or brake. */
export const TRAIN_SPEED = 11;
const ACCEL = 0.9;
export const BRAKE = 2.2;
/** A train without a working locomotive just rolls to a stop. */
const COAST = 0.7;
/** How far ahead the driver spots a break in the line. */
export const SIGHT = 85;
/** Hitting a break faster than this throws the train off the rails. */
const DERAIL_SPEED = 2.5;
/** Buffers between cars. */
const COUPLING = 1.1;
/** Seconds the line crews take to relay a blown stretch of track. */
export const TRACK_REPAIR = 28;
/** Blast strength (after armour-piercing weighting) needed to tear up the rails. */
const CUT_POWER = 45;
const SPAN_SCORE = 300;

/** A stretch of track blown away. */
export interface TrackCut {
	x0: number;
	x1: number;
	/** Seconds until it is relaid. */
	repair: number;
	by: Owner;
}

export interface Train {
	readonly id: number;
	/** Front to back: cars[0] leads toward the airfield. */
	readonly cars: Unit[];
	/** Each car's centre behind the lead car's centre. */
	readonly offsets: number[];
	/** Lead car's centre. */
	x: number;
	speed: number;
	state: 'run' | 'derailed' | 'siege';
	/** A firing position to pull up at short of the railhead (the railway gun). */
	halt?: number;
}

/** The viaduct carrying the line over the river, if it crosses one. */
export function railBridgeSpec(line: RailLine, river: River): BridgeSpec | null {
	if (!line.crossing || line.deckY === null) return null;
	return {
		z: line.z,
		halfZ: 2.6,
		deckY: line.deckY,
		level: river.level,
		west: line.crossing[0],
		east: line.crossing[1],
		spans: 4,
		hp: 240,
		below: 2.6,
		above: 1.4,
		// The line runs behind the road but combat is side-on: depth doesn't shield it.
		zWeight: 0,
		// Engineers bridge gaps for the road; the line waits for the next wave.
		pontoons: false,
		name: 'RAIL SPAN',
		score: SPAN_SCORE,
		down: ['RAIL BRIDGE DOWN', 'No train is crossing the river now'],
		rebuilt: ['RAIL BRIDGE REBUILT', 'Enemy engineers repaired the viaduct'],
		deckMesh: 'railDeckHalf',
		trussMesh: null
	};
}

/** Standard make-up of an armoured train for a given enemy strength. */
export function trainConsist(wave: number): UnitKind[] {
	const cars: UnitKind[] = ['locomotive', 'gunWagon', 'boxcar', 'flakWagon'];
	if (wave >= 7) cars.push('boxcar', 'gunWagon');
	return cars;
}

/**
 * The railway behind the road: the track (which bombs can tear up and line
 * crews relay), the viaduct over the river and the armoured trains running
 * on it. Trains brake for breaks they see in time; a break that opens right
 * under the locomotive's nose throws the whole train off the rails.
 */
export class Railway {
	readonly cuts: TrackCut[] = [];
	readonly trains: Train[] = [];
	private nextId = 1;

	constructor(
		readonly line: RailLine,
		readonly bridge: Bridge | null
	) {}

	/**
	 * Nearest place ahead of `x` (moving `dir`) where the track stops: a cut,
	 * a fallen viaduct span or the buffer stop. Null when the line is clear.
	 */
	breakAhead(x: number, dir: number): { at: number; kind: 'cut' | 'span' | 'end' } | null {
		let best: { at: number; kind: 'cut' | 'span' | 'end' } | null = null;
		const consider = (at: number, kind: 'cut' | 'span' | 'end'): void => {
			if ((at - x) * dir < -0.01) return;
			if (!best || (at - best.at) * dir < 0) best = { at, kind };
		};
		for (const c of this.cuts) {
			if (x > c.x0 && x < c.x1) consider(x, 'cut');
			else consider(dir < 0 ? c.x1 : c.x0, 'cut');
		}
		if (this.bridge) {
			for (const s of this.bridge.spans) {
				if (!s.down) continue;
				if (x > s.x0 && x < s.x1) consider(x, 'span');
				else consider(dir < 0 ? s.x1 : s.x0, 'span');
			}
		}
		if (dir < 0) consider(this.line.start, 'end');
		return best;
	}

	/** Puts an armoured train on the line at `x`, heading for the airfield. */
	spawnTrain(w: World, kinds: UnitKind[], x = WORLD.enemySpawnX + 60): Train {
		const cars: Unit[] = [];
		const offsets: number[] = [];
		let off = 0;
		for (let i = 0; i < kinds.length; i++) {
			const u = w.makeUnit(kinds[i], x, this.line.z, -1);
			if (i > 0) off += cars[i - 1].def.half[0] + u.def.half[0] + COUPLING;
			u.x = x + off;
			u.y = this.line.railY(u.x);
			u.pitch = -this.line.slope(u.x);
			cars.push(u);
			offsets.push(off);
			w.units.push(u);
		}
		const train: Train = { id: this.nextId++, cars, offsets, x, speed: 0, state: 'run' };
		this.trains.push(train);
		return train;
	}

	/** Tears up the track under a blast that is strong and close enough. */
	blast(
		w: World,
		x: number,
		y: number,
		radius: number,
		damage: number,
		pierce: number,
		by: Owner
	): void {
		if (x < this.line.start || this.line.onViaduct(x)) return;
		if (damage * (0.35 + 0.65 * pierce) < CUT_POWER) return;
		// Side-on like the rest of combat: only the height difference shields the rails.
		const dy = Math.abs(y - this.line.railY(x));
		const reach = radius * 0.6;
		if (dy >= reach) return;
		const half = clamp(radius * 0.4 * (1 - dy / reach), 2, 9);
		this.cut(w, x - half, x + half, by);
	}

	/** Removes the track between x0 and x1 until the crews relay it. */
	cut(w: World, x0: number, x1: number, by: Owner): void {
		for (let i = this.cuts.length - 1; i >= 0; i--) {
			const c = this.cuts[i];
			if (c.x1 < x0 || c.x0 > x1) continue;
			x0 = Math.min(x0, c.x0);
			x1 = Math.max(x1, c.x1);
			this.cuts.splice(i, 1);
		}
		this.cuts.push({ x0, x1, repair: TRACK_REPAIR, by });
		const z = this.line.z;
		// Twisted lengths of rail thrown out of the crater.
		for (let i = 0; i < 3; i++) {
			const rx = rnd.range(x0, x1);
			w.debris.spawn({
				x: rx,
				y: this.line.railY(rx) + 0.5,
				z: z + rnd.range(-1, 1),
				vx: rnd.gauss(6),
				vy: rnd.range(7, 13),
				vz: rnd.gauss(2),
				half: [1.6, 0.1, 0.1],
				parts: [{ mesh: 'railPiece', local: IDENTITY }],
				mass: 1.5,
				spin: 7,
				char: 0.5,
				life: rnd.range(8, 14)
			});
		}
	}

	update(w: World, dt: number): void {
		for (let i = this.cuts.length - 1; i >= 0; i--) {
			const c = this.cuts[i];
			c.repair -= dt;
			// A train piled up in the gap keeps the crews away until it is cleared.
			if (c.repair <= 0 && !this.blocked(c)) this.cuts.splice(i, 1);
		}
		for (let i = this.trains.length - 1; i >= 0; i--) {
			const t = this.trains[i];
			if (t.cars.every((u) => u.remove)) {
				this.trains.splice(i, 1);
				continue;
			}
			this.drive(w, t, dt);
		}
	}

	private blocked(c: TrackCut): boolean {
		return this.trains.some(
			(t) =>
				t.state === 'derailed' &&
				t.cars.some((u) => !u.remove && u.x > c.x0 - 20 && u.x < c.x1 + 20)
		);
	}

	/** Index of the frontmost car still on the line. */
	private leadIndex(t: Train): number {
		const i = t.cars.findIndex((u) => !u.remove);
		return Math.max(0, i);
	}

	private drive(w: World, t: Train, dt: number): void {
		if (t.state === 'derailed') return;
		const li = this.leadIndex(t);
		// Distance from the train's reference point to the front of its leading car.
		const front = t.cars[li].def.half[0] - t.offsets[li];
		const loco = t.cars.find((u) => u.def.kind === 'locomotive');
		const powered = !!loco && loco.alive && loco.stun <= 0;
		const nose = t.x - front;
		const brk = t.state === 'siege' ? null : this.breakAhead(nose, -1);
		let want = t.state === 'siege' ? 0 : TRAIN_SPEED;
		if (brk) {
			const room = nose - brk.at;
			// Braking curve that stops the nose a couple of metres short.
			if (room < SIGHT) want = Math.min(want, Math.sqrt(2 * BRAKE * Math.max(0, room - 2)));
		}
		// Pulling up at a firing position: no siege, the gun works from there.
		const halt = t.halt !== undefined && (!brk || brk.at < t.halt) ? t.halt : null;
		if (halt !== null) {
			want = Math.min(want, Math.sqrt(2 * BRAKE * Math.max(0, nose - halt)));
			if (nose - halt < 0.3 && t.speed < 0.3) want = 0;
		}
		if (!powered) t.speed = Math.max(0, t.speed - COAST * dt);
		else if (want > t.speed) t.speed = Math.min(want, t.speed + ACCEL * dt);
		else t.speed = Math.max(want, t.speed - BRAKE * dt);
		t.x -= t.speed * dt;
		if (brk?.kind === 'end' && t.x - front < brk.at + 2.5 && t.speed < 0.1) {
			// Pulled up at the buffer stop: every gun on the train turns on the airfield.
			t.speed = 0;
			t.state = 'siege';
		}
		if (brk && t.x - front < brk.at) {
			if (brk.kind === 'end') {
				t.x = brk.at + front;
				t.speed = 0;
				t.state = 'siege';
			} else if (brk.kind === 'cut') {
				if (t.speed > DERAIL_SPEED) return this.derail(w, t, brk.at, li);
				t.x = brk.at + front;
				t.speed = 0;
			} else if (t.speed <= DERAIL_SPEED) {
				t.x = brk.at + front;
				t.speed = 0;
			}
			// Too fast at a fallen span: it rolls on over the edge, car by car.
		}
		for (let i = 0; i < t.cars.length; i++) {
			const u = t.cars[i];
			if (u.remove) continue;
			u.x = t.x + t.offsets[i];
			u.speed = t.speed;
			u.anim += (t.speed * dt) / 0.45;
			if (!u.alive) continue;
			// Ran off the end of a broken viaduct. (A few metres of torn-up track
			// under a car that is already past just gets bridged by the rest of the train.)
			if (this.line.onViaduct(u.x) && this.bridge?.spanAt(u.x)?.down) {
				dropUnit(w, u, 'player');
				continue;
			}
			u.y = this.line.railY(u.x);
			u.pitch = damp(u.pitch, -this.line.slope(u.x), 6, dt);
			if (t.state === 'siege' && u.state !== 'siege') {
				u.state = 'siege';
				u.stateTime = 0;
			}
		}
	}

	private derail(w: World, t: Train, at: number, li: number): void {
		const v = t.speed;
		t.state = 'derailed';
		t.speed = 0;
		const by = this.cuts.find((c) => at >= c.x0 - 0.5 && at <= c.x1 + 0.5)?.by ?? 'player';
		// The leading car ploughs a few metres into the crater.
		t.x = at + t.cars[li].def.half[0] - t.offsets[li] - 3;
		for (let i = li; i < t.cars.length; i++) {
			const u = t.cars[i];
			if (u.remove) continue;
			const k = i - li;
			// Cars concertina into the one in front: each closes up a little and slews off the line.
			u.x = t.x + t.offsets[i] - Math.min(k * 1.4, (t.offsets[i] - t.offsets[li]) * 0.15);
			u.speed = 0;
			const kink = (k % 2 === 0 ? 1 : -1) * rnd.range(0.12, 0.3) * Math.min(1, v / 8);
			u.yaw = Math.PI + kink;
			u.pitch += rnd.range(-0.08, 0.08);
			u.y = this.line.formation(u.x) + (k === 0 ? -0.4 : 0.1);
			if (u.alive) {
				const hit = v * (k === 0 ? 60 : 26 * Math.pow(0.7, k - 1));
				damageUnit(w, u, hit, 1, by, at - 10, 'blast');
			}
		}
		const y = this.line.formation(at);
		w.fx.explosion(at, y, this.line.z, 1.1, true);
		w.fx.impact(at, y, this.line.z, 'metal', true);
		w.fx.shake(at, y, 0.6);
		w.sound.play('crash', at, y, 1.3);
		w.sound.boom(1.2, at, y);
		w.events.message('TRAIN DERAILED', 'It ran into the break in the line', 'good');
	}

	/** Line crews relay every break and the trains are cleared (new wave or game). */
	repair(): void {
		this.cuts.length = 0;
	}

	reset(): void {
		this.cuts.length = 0;
		this.trains.length = 0;
	}
}
