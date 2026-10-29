import { describe, expect, it } from 'vitest';
import { TRUSS_H } from './bridge';
import { explode, inBattlePlane } from './combat';
import { BOMBS } from './defs-bombs';
import { NO_INPUT } from './player';
import { RAIL, RAIL_TOP } from './rail';
import { BRAKE, SIGHT, TRACK_REPAIR, TRAIN_SPEED, trainConsist, type Train } from './railway';
import { RIVER } from './river';
import { simulateWorld } from './simulate';
import { Terrain } from './terrain';
import { testWorld } from './test-world';
import { planWave, WaveDirector } from './waves';
import type { World } from './world';

const run = (w: World, seconds: number, until: () => boolean = () => false): void => {
	for (let i = 0; i < seconds * 30 && !until(); i++) simulateWorld(w, 1 / 30, NO_INPUT);
};

function setup() {
	const w = testWorld();
	const r = w.railway;
	if (!r || !w.railBridge || !w.river) throw new Error('test world has no railway');
	return { w, r, line: r.line, viaduct: w.railBridge, river: w.river };
}

/** A train already rolling at full speed toward the airfield with its nose at `nose`. */
function rolling(w: World, nose: number): Train {
	const t = w.railway!.spawnTrain(w, trainConsist(4), nose + 6.2);
	t.speed = TRAIN_SPEED;
	return t;
}

const nose = (t: Train): number => t.x - t.cars[0].def.half[0];

describe('rail line', () => {
	it('climbs onto a viaduct that stands clear above the road bridge', () => {
		const { w, line, viaduct, river } = setup();
		expect(line.deckY).toBeGreaterThan(river.deckY + TRUSS_H);
		expect(line.formation(viaduct.west)).toBeCloseTo(viaduct.deckY, 2);
		expect(line.formation(viaduct.east)).toBeCloseTo(viaduct.deckY, 2);
		// The embankment meets both abutments.
		expect(w.terrain.heightAtXZ(viaduct.west - 3, line.z)).toBeCloseTo(viaduct.deckY, 0);
		expect(w.terrain.heightAtXZ(viaduct.east + 3, line.z)).toBeCloseTo(viaduct.deckY, 0);
	});

	it('runs on a smooth embankment and leaves the road untouched', () => {
		const { w, line, viaduct } = setup();
		let worst = 0;
		for (let x = line.start + 20; x < 5300; x += 13) {
			if (x > viaduct.west - 5 && x < viaduct.east + 5) continue;
			worst = Math.max(worst, Math.abs(w.terrain.heightAtXZ(x, line.z) - line.formation(x)));
			expect(Math.abs(line.slope(x))).toBeLessThan(0.1);
		}
		expect(worst).toBeLessThan(0.25);
		const plain = new Terrain(11, undefined, undefined, RIVER);
		for (let x = 600; x < 5300; x += 97) expect(w.terrain.heightAt(x)).toBe(plain.heightAt(x));
	});

	it('keeps scenery off the track without uprooting the villages', () => {
		const { w, line } = setup();
		const onLine = w.props.near.filter((p) => p.x > line.start && Math.abs(p.z - RAIL.z) < 5);
		expect(onLine).toEqual([]);
		// The villages and the field hospital beside the road stand clear of it.
		expect(w.props.near.some((p) => p.mesh === 'hospital')).toBe(true);
	});
});

describe('armoured train', () => {
	it('crosses the viaduct and pulls into the railhead to shell the airfield', () => {
		const { w, line, viaduct } = setup();
		const t = w.railway!.spawnTrain(w, trainConsist(4), viaduct.east + 120);
		const loco = t.cars[0];
		let onDeck = Infinity;
		run(w, 400, () => {
			if (loco.x > viaduct.west + 5 && loco.x < viaduct.east - 5) onDeck = Math.min(onDeck, loco.y);
			return t.state === 'siege';
		});
		expect(onDeck).toBeCloseTo(viaduct.deckY + RAIL_TOP, 2);
		expect(t.state).toBe('siege');
		expect(nose(t) - line.start).toBeLessThan(2.5);
		expect(t.cars.every((u) => u.alive && u.state === 'siege')).toBe(true);
		const hp = w.base.hp;
		run(w, 10);
		expect(w.base.hp).toBeLessThan(hp);
	});

	it('brakes for a break in the line it sees in time and waits for the crews to relay it', () => {
		const { w, r } = setup();
		const t = rolling(w, 2200);
		const gap = nose(t) - SIGHT + 5;
		r.cut(w, gap - 6, gap, 'player');
		run(w, 20);
		expect(t.state).toBe('run');
		expect(t.speed).toBe(0);
		expect(t.cars.every((u) => u.alive)).toBe(true);
		expect(nose(t)).toBeGreaterThan(gap);
		expect(nose(t)).toBeLessThan(gap + 4);
		run(w, TRACK_REPAIR);
		expect(r.cuts).toEqual([]);
		expect(nose(t)).toBeLessThan(gap - 20);
	});

	it('comes off the rails when the track is bombed right under its nose', () => {
		const { w, r, line } = setup();
		const t = rolling(w, 1510);
		const stopping = (TRAIN_SPEED * TRAIN_SPEED) / (2 * BRAKE);
		const x = nose(t) - stopping * 0.4;
		explode(w, x - 6, line.railY(x - 6), 0, BOMBS.gp.blast, 'player');
		expect(r.cuts.length).toBe(1);
		run(w, 3);
		expect(t.state).toBe('derailed');
		expect(t.cars[0].alive).toBe(false);
		expect(t.cars.every((u) => u.speed === 0)).toBe(true);
		// Wrecks in the gap keep the crews from relaying it.
		run(w, TRACK_REPAIR + 2);
		expect(r.cuts.length).toBe(1);
	});

	it('takes bomb damage side-on even though it runs behind the road', () => {
		const { w, r } = setup();
		const t = r.spawnTrain(w, ['boxcar'], 2000);
		const car = t.cars[0];
		// Bombs, bullets and target pickers all treat the line as part of the battle.
		expect(inBattlePlane(car)).toBe(true);
		explode(w, car.x, car.y + car.def.half[1] * 2, 0, BOMBS.gp.blast, 'player');
		expect(car.hp).toBeLessThan(car.def.hp * 0.4);
	});

	it('only tears up track for heavy blasts close to the rails', () => {
		const { w, r, line } = setup();
		explode(w, 1310, line.railY(1310), 0, { ...BOMBS.gp.blast, damage: 20 }, 'player');
		explode(w, 1410, line.railY(1410) + 20, 0, BOMBS.gp.blast, 'player');
		expect(r.cuts).toEqual([]);
		explode(w, 1510, line.railY(1510), 0, BOMBS.gp.blast, 'player');
		expect(r.cuts.length).toBe(1);
	});
});

describe('rail viaduct', () => {
	it('drops the train cars on a fallen span and leaves the road traffic alone', () => {
		const { w, r, viaduct } = setup();
		const span = viaduct.spans[1];
		const t = r.spawnTrain(w, ['boxcar'], (span.x0 + span.x1) / 2);
		const truck = w.spawnUnit('truck', (span.x0 + span.x1) / 2, 0);
		run(w, 0.1);
		viaduct.collapse(w, span, 'player');
		expect(t.cars[0].alive).toBe(false);
		expect(truck.alive).toBe(true);
		expect(w.debris.list.filter((d) => d.parts.some((p) => p.mesh === 'railDeckHalf')).length).toBe(
			2
		);
	});

	it('is not brought down with the road bridge, and the road bridge spares the train', () => {
		const { w, r, viaduct } = setup();
		const span = w.bridge!.spans[1];
		const t = r.spawnTrain(w, ['boxcar'], (span.x0 + span.x1) / 2);
		w.bridge!.collapse(w, span, 'player');
		expect(t.cars[0].alive).toBe(true);
		expect(viaduct.downCount).toBe(0);
		// A bomb on the road deck only scratches the viaduct above it.
		explode(w, (span.x0 + span.x1) / 2 + 30, w.river!.deckY, 0, BOMBS.gp.blast, 'player');
		expect(viaduct.spans[2].hp).toBeGreaterThan(viaduct.hp * 0.75);
	});

	it('sends a train that cannot stop in time over the edge, car by car', () => {
		const { w, viaduct } = setup();
		const span = viaduct.spans[2];
		const t = rolling(w, span.x1 + 12);
		viaduct.collapse(w, span, 'player');
		run(w, 15);
		expect(t.cars[0].alive).toBe(false);
		expect(t.speed).toBe(0);
		const left = t.cars.filter((u) => u.alive);
		expect(left.length).toBeGreaterThan(0);
		for (const u of left) expect(u.x).toBeGreaterThan(span.x1);
	});

	it('is rebuilt, and the track relaid, for the next wave', () => {
		const { w, r, viaduct } = setup();
		viaduct.collapse(w, viaduct.spans[0], 'player');
		r.cut(w, 2000, 2010, 'player');
		const d = new WaveDirector(1);
		d.begin(w, 2);
		expect(viaduct.downCount).toBe(0);
		expect(r.cuts).toEqual([]);
	});
});

describe('train waves', () => {
	it('sends no trains early on and some later, leaving the road columns as they were', () => {
		for (let seed = 1; seed <= 30; seed++) {
			for (let wave = 1; wave <= 3; wave++)
				expect(planWave(wave, seed, 0).orders.some((o) => o.kind === 'train')).toBe(false);
		}
		let trains = 0;
		for (let seed = 1; seed <= 30; seed++)
			trains += planWave(8, seed, 0).orders.filter((o) => o.kind === 'train').length;
		expect(trains).toBeGreaterThan(10);
		const forced = planWave(1, 4, 0, null, { trains: 1 });
		const stock = planWave(1, 4, 0);
		expect(forced.orders.filter((o) => o.kind !== 'train')).toEqual(stock.orders);
	});

	it('puts a whole train on the line when its turn comes', () => {
		const w = testWorld();
		const d = new WaveDirector(1, { tweaks: () => ({ trains: 1 }) });
		d.begin(w, 1);
		for (let i = 0; i < 300; i++) {
			simulateWorld(w, 1 / 30, NO_INPUT);
			d.update(w, 1 / 30);
		}
		expect(w.railway!.trains.length).toBe(1);
		expect(w.units.filter((u) => u.def.rail).length).toBe(trainConsist(1).length);
	});
});
