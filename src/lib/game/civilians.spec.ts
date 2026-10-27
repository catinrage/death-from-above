import { describe, expect, it } from 'vitest';
import type { Civilian } from './civilians';
import { explode } from './combat';
import { BOMBS } from './defs-bombs';
import { CIVILIAN_PENALTY, HOSPITAL_PENALTY, NO_FIRE_ZONES, clearOfZones, zoneAt } from './no-fire';
import { spawnBullet } from './projectiles';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { WaveDirector } from './waves';
import type { World } from './world';

const DT = 1 / 60;
const HOSPITAL = NO_FIRE_ZONES.find((z) => z.kind === 'hospital')!;
const VILLAGE = NO_FIRE_ZONES.find((z) => z.kind === 'village')!;

function run(w: World, seconds: number): void {
	for (let t = 0; t < seconds; t += DT) simulateWorld(w, DT, null);
}

/** Records every penalty the world reports. */
function penalties(w: World): { name: string; points: number }[] {
	const out: { name: string; points: number }[] = [];
	w.events = { ...w.events, penalty: (name, points) => out.push({ name, points }) };
	return out;
}

function villager(w: World): Civilian {
	const c = w.civilians.list.find((c) => c.zone === VILLAGE && c.alive && !c.sheltered);
	if (!c) throw new Error('no villager outdoors');
	return c;
}

describe('no-fire zones', () => {
	it('finds the zone covering a point and slides positions out of it', () => {
		expect(zoneAt(HOSPITAL.x)?.kind).toBe('hospital');
		expect(zoneAt(VILLAGE.x + VILLAGE.half - 1)?.kind).toBe('village');
		expect(zoneAt(1000)).toBeNull();
		expect(zoneAt(NaN)).toBeNull();
		const left = clearOfZones(VILLAGE.x - 10);
		const right = clearOfZones(VILLAGE.x + 10);
		expect(zoneAt(left)).toBeNull();
		expect(zoneAt(right)).toBeNull();
		expect(left).toBeLessThan(VILLAGE.x);
		expect(right).toBeGreaterThan(VILLAGE.x);
		expect(clearOfZones(1000)).toBe(1000);
	});

	it('builds a hospital and marker boards, and fills each zone with civilians', () => {
		const w = testWorld();
		const hospital = w.props.near.find((p) => p.mesh === 'hospital');
		expect(hospital).toBeDefined();
		expect(zoneAt(hospital!.x)).toBe(HOSPITAL);
		expect(w.props.near.filter((p) => p.mesh === 'noFireSign')).toHaveLength(4);
		for (const zone of NO_FIRE_ZONES) {
			const people = w.civilians.list.filter((c) => c.zone === zone);
			expect(people).toHaveLength(zone.population);
			for (const c of people) expect(Math.abs(c.x - zone.x)).toBeLessThanOrEqual(zone.half);
			expect(w.civilians.homes(w, zone).length).toBeGreaterThan(2);
		}
	});

	it('keeps the hospital and its people in the city biome too', () => {
		const w = testWorld();
		try {
			w.setBiome('city');
			w.reset();
			expect(w.props.near.some((p) => p.mesh === 'hospital')).toBe(true);
			for (const zone of NO_FIRE_ZONES) {
				expect(w.civilians.homes(w, zone).length).toBeGreaterThan(0);
				expect(w.civilians.list.filter((c) => c.zone === zone)).toHaveLength(zone.population);
			}
		} finally {
			w.setBiome('temperate');
			w.reset();
		}
	});

	it('keeps civilians walking inside their village', () => {
		const w = testWorld();
		run(w, 30);
		for (const c of w.civilians.list) {
			expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
			expect(Math.abs(c.x - c.zone.x)).toBeLessThanOrEqual(c.zone.half + 0.5);
			expect(c.z).toBeLessThan(-4);
		}
		expect(w.civilians.list.some((c) => c.speed > 0.2 || c.anim > 10)).toBe(true);
	});
});

describe('collateral damage', () => {
	it('docks score when the player bombs a civilian', () => {
		const w = testWorld();
		const got = penalties(w);
		const c = villager(w);
		explode(w, c.x, c.y, 0, BOMBS.gp.blast, 'player');
		expect(c.alive).toBe(false);
		expect(w.civilians.killed).toBeGreaterThanOrEqual(1);
		expect(got.filter((p) => p.name === 'Civilian killed')[0]?.points).toBe(CIVILIAN_PENALTY);
	});

	it("doesn't blame the player for enemy shells", () => {
		const w = testWorld();
		const got = penalties(w);
		const c = villager(w);
		explode(w, c.x, c.y, c.z, BOMBS.gp.blast, 'enemy');
		expect(c.alive).toBe(false);
		expect(got).toHaveLength(0);
		expect(w.civilians.killed).toBe(0);
	});

	it('stops a player bullet on a civilian in the line of fire', () => {
		const w = testWorld();
		const got = penalties(w);
		const c = villager(w);
		for (let i = 0; i < 4; i++) {
			spawnBullet(w, {
				// Straight down, so the road's camber can't catch the round first.
				x: c.x,
				y: c.y + 20,
				z: 0,
				vx: 0,
				vy: -900,
				life: 1,
				damage: 6,
				pierce: 0.2,
				owner: 'player',
				tracer: false,
				color: [1, 1, 1],
				size: 0.1,
				explosive: 0
			});
		}
		run(w, 0.2);
		expect(c.alive).toBe(false);
		expect(got.some((p) => p.name === 'Civilian killed')).toBe(true);
	});

	it('burns civilians caught in napalm', () => {
		const w = testWorld();
		const got = penalties(w);
		const c = villager(w);
		w.fires.add(c.x, c.y, c.z + 3, 2, 10, { radius: 6, dps: 34 });
		run(w, 1);
		expect(c.alive).toBe(false);
		expect(got.length).toBeGreaterThan(0);
	});

	it('charges heavily for flattening the hospital', () => {
		const w = testWorld();
		const got = penalties(w);
		const hospital = w.props.near.find((p) => p.mesh === 'hospital')!;
		for (let i = 0; i < 3 && !hospital.ruined; i++)
			explode(w, hospital.x, hospital.y + 2, hospital.z, BOMBS.penetrator.blast, 'player');
		expect(hospital.ruined).toBe(true);
		expect(got.some((p) => p.name === 'Hospital destroyed' && p.points === HOSPITAL_PENALTY)).toBe(
			true
		);
	});
});

describe('civilian behaviour', () => {
	it('runs for cover when bombs fall nearby, then comes back out', () => {
		const w = testWorld();
		const c = villager(w);
		expect(c.home).not.toBeNull();
		// A blast well clear of them, but close enough to hear.
		explode(w, c.x + 40, w.ground(c.x + 40), 0, BOMBS.gp.blast, 'player');
		expect(c.panic).toBeGreaterThan(0);
		let hid = false;
		for (let t = 0; t < 20 && !hid; t += DT) {
			simulateWorld(w, DT, null);
			hid = c.sheltered;
		}
		expect(c.alive).toBe(true);
		expect(hid).toBe(true);
		expect(w.civilians.outdoors()).not.toContain(c);
		run(w, 20);
		expect(c.sheltered).toBe(false);
	});

	it('kills anyone sheltering in a house that comes down', () => {
		const w = testWorld();
		const got = penalties(w);
		const c = villager(w);
		const home = c.home!;
		c.sheltered = true;
		c.calm = 100;
		c.x = home.x;
		w.civilians.houseCollapsed(w, home, 'player');
		expect(c.alive).toBe(false);
		expect(got.map((p) => p.name)).toEqual(
			expect.arrayContaining(['Civilian killed', 'Home destroyed'])
		);
	});

	it('repopulates a village after its people are lost', () => {
		const w = testWorld();
		for (const c of w.civilians.list) if (c.zone === VILLAGE) c.alive = false;
		run(w, 1);
		expect(w.civilians.list.filter((c) => c.zone === VILLAGE)).toHaveLength(0);
		run(w, 40);
		expect(w.civilians.list.filter((c) => c.zone === VILLAGE).length).toBeGreaterThan(0);
	});

	it('refills every zone when the battlefield resets', () => {
		const w = testWorld();
		w.civilians.clear();
		w.reset();
		expect(w.civilians.list).toHaveLength(HOSPITAL.population + VILLAGE.population);
		expect(w.civilians.killed).toBe(0);
	});
});

describe('enemy emplacements', () => {
	it('never dig in inside a no-fire zone', () => {
		const w = testWorld();
		for (const seed of [1, 2, 3, 4, 5]) {
			w.units.length = 0;
			const waves = new WaveDirector(seed);
			waves.begin(w, 8);
			for (let t = 0; t < 4; t += DT) waves.update(w, DT);
			const statics = w.units.filter((u) => u.def.isStatic);
			expect(statics.length).toBeGreaterThan(0);
			for (const u of statics) expect(zoneAt(u.x)).toBeNull();
		}
	});
});
