import { describe, expect, it } from 'vitest';
import {
	bossStatus,
	CRUISER_ENTRY,
	CRUISER_STATION,
	RAIL_GUN_HALT,
	riverPoint,
	spawnBoss
} from './boss';
import { inBattlePlane } from './combat';
import { isEmitting } from './arm';
import { BOMBS } from './defs-bombs';
import { BOSS_KINDS, MOBILE_KINDS, UNITS } from './defs-units';
import { Player } from './player';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import type { Unit } from './types';
import { dropBomb } from './weapons';
import { warBoss, warTweaks, planWave, WaveDirector } from './waves';
import type { World } from './world';

const DT = 1 / 60;

function run(w: World, seconds: number, each?: () => void): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		each?.();
	}
}

/** Drops a bomb straight onto a unit and lets it land. Returns how many it took to kill it. */
function bombUntilDead(w: World, u: Unit, id: 'gp' | 'penetrator', max = 60): number {
	for (let n = 1; n <= max; n++) {
		dropBomb(w, BOMBS[id], u.x, u.y + 60, 0, 0, -20, -Math.PI / 2);
		run(w, 3);
		if (!u.alive) return n;
	}
	return Infinity;
}

/** Holds an aircraft at a fixed spot so ground fire has something to shoot at. */
function hover(w: World, x: number, alt: number): Player {
	const p = new Player('albatross', x, w.ground(x) + alt, 0);
	p.invuln = 1e9;
	w.player = p;
	return p;
}

function arrive(w: World, cruiser: Unit): void {
	for (let t = 0; t < 120 && cruiser.aux!.route < CRUISER_STATION - 0.5; t += DT)
		simulateWorld(w, DT, null);
	run(w, 6);
}

describe('boss definitions', () => {
	it('never turn up in an ordinary wave budget', () => {
		for (const k of BOSS_KINDS) {
			expect(UNITS[k].boss).toBe(true);
			expect(MOBILE_KINDS).not.toContain(k);
		}
		for (let wave = 1; wave <= 20; wave++) {
			const kinds = planWave(wave, 3, 0).orders.map((o) => o.kind);
			for (const k of BOSS_KINDS) expect(kinds).not.toContain(k);
		}
	});

	it('take far more punishment than a battle tank', () => {
		const tank = UNITS.tank,
			boss = UNITS.superTank;
		expect(boss.hp * (1 - boss.armor * 0.55)).toBeGreaterThan(
			3 * tank.hp * (1 - tank.armor * 0.55)
		);
	});
});

describe('super-heavy tank', () => {
	it('rolls in from the enemy end of the road with a health bar', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'superTank');
		expect(u.def.kind).toBe('superTank');
		expect(u.z).toBe(0);
		expect(bossStatus(w)).toEqual({ name: 'Behemoth', frac: 1 });
		const x0 = u.x;
		run(w, 4);
		expect(u.x).toBeLessThan(x0);
		u.hp = u.def.hp / 4;
		expect(bossStatus(w)?.frac).toBeCloseTo(0.25);
	});

	it('shoots at a low aircraft with its rear AA guns', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'superTank');
		u.x = 2000;
		hover(w, 2050, 160);
		run(w, 6);
		expect(w.bullets.some((b) => b.owner === 'enemy')).toBe(true);
		expect(Math.abs(u.aux!.pitch)).toBeGreaterThan(0.5);
	});

	it('needs a stack of bombs, but only a few bunker busters', () => {
		const w = testWorld();
		const a = spawnBoss(w, 'superTank');
		a.x = 2000;
		a.speed = 0;
		const gp = bombUntilDead(w, a, 'gp');
		expect(gp).toBeGreaterThanOrEqual(8);
		expect(gp).toBeLessThan(30);
		expect(bossStatus(w)).toBeNull();

		const w2 = testWorld();
		const b = spawnBoss(w2, 'superTank');
		b.x = 2000;
		expect(bombUntilDead(w2, b, 'penetrator')).toBeLessThanOrEqual(3);
		expect(b.turretGone).toBe(true);
	});

	it('shells the airfield once it reaches the siege line', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'superTank');
		u.x = 760;
		run(w, 25);
		expect(u.state).toBe('siege');
		expect(w.base.hp).toBeLessThan(w.base.maxHp);
	});
});

describe('river cruiser', () => {
	it('anchors across the channel just below the bridge', () => {
		const w = testWorld();
		const r = w.river!;
		const at = riverPoint(r, CRUISER_STATION);
		// The straight reach below the bridge runs toward the camera...
		expect(Math.sin(at.yaw)).toBeLessThan(-0.95);
		// ...and the cruiser lies across it from bank to bank.
		const [hx, , hz] = UNITS.cruiser.half;
		expect(r.inChannel(at.x - hx + 1, at.z)).toBe(true);
		expect(r.inChannel(at.x + hx - 1, at.z)).toBe(true);
		// Clear of the bridge deck, near enough that bombs on the line still reach it.
		expect(at.z - hz).toBeGreaterThan(4.8);
		expect(at.z - hz).toBeLessThan(15);
	});

	it('steams up the river out of reach, then anchors and fights', () => {
		const w = testWorld();
		const r = w.river!;
		const u = spawnBoss(w, 'cruiser');
		expect(u.aux!.route).toBe(CRUISER_ENTRY);
		expect(inBattlePlane(u)).toBe(false);
		const p = hover(w, u.x + 150, 260);
		let firedEarly = false;
		for (let t = 0; t < 120 && u.aux!.route < CRUISER_STATION - 0.5; t += DT) {
			p.x = u.x + 150;
			simulateWorld(w, DT, null);
			expect(r.inChannel(u.x, u.z)).toBe(true);
			firedEarly ||= w.shells.length > 0 || w.missiles.length > 0;
		}
		expect(firedEarly).toBe(false);
		expect(u.aux!.route).toBeCloseTo(CRUISER_STATION, 0);
		run(w, 6, () => (p.x = u.x + 150));
		expect(Math.cos(u.yaw)).toBeCloseTo(-1, 2);
		expect(inBattlePlane(u)).toBe(true);
		expect(u.y).toBeCloseTo(r.level, 0);

		let launches = 0;
		let locked = false;
		w.sound = {
			play: (id) => id === 'missileLaunch' && launches++,
			boom: () => {},
			whistle: () => {}
		};
		run(w, 12, () => {
			p.x = u.x + 150;
			p.y = w.ground(p.x) + 260;
			locked ||= p.lockedBy > 0;
		});
		expect(locked).toBe(true);
		expect(launches).toBeGreaterThanOrEqual(2);
		expect(w.shells.some((s) => s.kind === 'flak') || w.bullets.length > 0).toBe(true);
	});

	it('lights up for anti-radiation missiles only while its SAMs lock on', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'cruiser');
		expect(isEmitting(u)).toBe(false);
		u.aux!.lock = 0.5;
		expect(isEmitting(u)).toBe(true);
	});

	it("can't be bombed on its way in", () => {
		const w = testWorld();
		const u = spawnBoss(w, 'cruiser');
		dropBomb(w, BOMBS.penetrator, u.x, w.ground(u.x) + 60, 0, 0, -20, -Math.PI / 2);
		run(w, 2.5);
		expect(u.hp).toBe(u.def.hp);
	});

	it('sinks onto the river bed with its upperworks showing, then goes under', () => {
		const w = testWorld();
		const r = w.river!;
		const u = spawnBoss(w, 'cruiser');
		arrive(w, u);
		const hits = bombUntilDead(w, u, 'gp');
		expect(hits).toBeGreaterThanOrEqual(6);
		expect(hits).toBeLessThan(40);
		run(w, 30);
		expect(w.units).toContain(u);
		expect(u.y).toBeLessThan(r.level - 1);
		// The mast still stands clear of the water.
		expect(u.y + 13).toBeGreaterThan(r.level);
		run(w, 50);
		expect(w.units).not.toContain(u);
	});
});

describe('railway gun', () => {
	it('runs down the line coupled into a train, pulls up short of the railhead and shells the airfield', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'railGun');
		const train = w.railway!.trains[0];
		expect(train.cars.map((c) => c.def.kind)).toEqual(['locomotive', 'railGun', 'flakWagon']);
		expect(u.def.rail).toBe(true);
		train.x = RAIL_GUN_HALT + 250;
		let fired = 0;
		w.sound = {
			play: (id) => id === 'artillery' && fired++,
			boom: () => {},
			whistle: () => {}
		};
		run(w, 90);
		expect(train.state).toBe('run');
		expect(train.speed).toBe(0);
		const nose = train.x - train.cars[0].def.half[0];
		expect(Math.abs(nose - RAIL_GUN_HALT)).toBeLessThan(3);
		expect(fired).toBeGreaterThanOrEqual(3);
		expect(w.base.hp).toBeLessThan(w.base.maxHp);
		expect(u.y).toBeCloseTo(w.rail!.railY(u.x), 1);
	});

	it('holds fire while rolling and out of range', () => {
		const w = testWorld();
		spawnBoss(w, 'railGun');
		let fired = 0;
		w.sound = { play: (id) => id === 'artillery' && fired++, boom: () => {}, whistle: () => {} };
		run(w, 20);
		expect(fired).toBe(0);
	});

	it('can be stopped short by cutting the line, but still fires if it is in range there', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'railGun');
		const train = w.railway!.trains[0];
		train.x = 2380;
		w.railway!.cut(w, 2300, 2310, 'player');
		// Less than the crews take to relay the track.
		run(w, 22);
		expect(train.x - train.cars[0].def.half[0]).toBeGreaterThan(2300);
		expect(u.speed).toBe(0);
		expect(u.aimPitch).toBeGreaterThan(0.7);
	});

	it('loses its barrel when destroyed', () => {
		const w = testWorld();
		const u = spawnBoss(w, 'railGun');
		w.railway!.trains[0].x = RAIL_GUN_HALT + 20;
		run(w, 8);
		expect(bombUntilDead(w, u, 'penetrator')).toBeLessThanOrEqual(4);
		expect(u.turretGone).toBe(true);
	});
});

describe('boss waves', () => {
	it('add a boss to a wave on top of its budget', () => {
		const plain = planWave(6, 9, 0);
		const boss = planWave(6, 9, 0, null, { boss: 'cruiser' });
		expect(boss.orders.length).toBe(plain.orders.length + 1);
		expect(boss.orders.filter((o) => o.kind === 'cruiser')).toHaveLength(1);
	});

	it('bring one every fifth wave of the war, alternating', () => {
		expect([4, 5, 6, 10, 15, 20].map(warBoss)).toEqual([
			undefined,
			'superTank',
			undefined,
			'cruiser',
			'railGun',
			'superTank'
		]);
		expect(warTweaks(10).boss).toBe('cruiser');
	});

	it("don't clear until the boss is dead", () => {
		const w = testWorld();
		const waves = new WaveDirector(5, { last: 1, tweaks: () => ({ budget: 0, boss: 'cruiser' }) });
		waves.begin(w, 1);
		for (let t = 0; t < 20; t += DT) {
			simulateWorld(w, DT, null);
			waves.update(w, DT);
		}
		const boss = w.units.find((u) => u.def.kind === 'cruiser');
		expect(boss).toBeDefined();
		for (const u of w.units) if (u !== boss) u.alive = false;
		for (let t = 0; t < 2; t += DT) waves.update(w, DT);
		expect(waves.state).toBe('active');
		boss!.alive = false;
		waves.update(w, DT);
		expect(waves.state).toBe('complete');
	});
});
