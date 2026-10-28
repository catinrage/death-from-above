import { describe, expect, it } from 'vitest';
import { Rng } from '../engine/rng';
import { tend } from './allies';
import { UNITS } from './defs-units';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { LOB } from './unit-ai';
import { planGroup } from './war';
import { planWave } from './waves';
import type { UnitKind } from './types';
import type { World } from './world';

const DT = 1 / 30;

function run(w: World, seconds: number, until?: () => boolean): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, null);
		if (until?.()) return;
	}
}

describe('enemy specialists', () => {
	it('anti-tank troopers pick armour over nearer infantry', () => {
		const w = testWorld();
		w.allies.deploy(w, ['rifleman', 'apc'], 1300);
		const [rifleman, apc] = w.allies.list;
		rifleman.x = 1340;
		apc.x = 1300;
		expect(w.allies.nearest(1560, 0, 300)).toBe(rifleman);
		expect(w.allies.nearest(1560, 0, 300, true)).toBe(apc);
	});

	it('anti-tank rockets hit armour hard', () => {
		const w = testWorld();
		w.allies.deploy(w, ['apc'], 1300);
		const apc = w.allies.list[0];
		const at = w.spawnUnit('atTrooper', 1560, 0);
		at.cooldown = 0;
		run(w, 15, () => {
			apc.x = 1300;
			return apc.hp < apc.def.hp;
		});
		expect(apc.hp).toBeLessThan(apc.def.hp - 50);
	});

	it('snipers drop our infantry from beyond rifle range', () => {
		const w = testWorld();
		w.allies.deploy(w, ['rifleman'], 1200);
		const target = w.allies.list[0];
		const sniper = w.spawnUnit('sniper', 1200 + 400, 0);
		sniper.cooldown = 0;
		// Pin the soldier: no walking into his own range.
		run(w, 45, () => {
			target.x = 1200;
			return !target.alive;
		});
		expect(target.alive).toBe(false);
		expect(sniper.alive).toBe(true);
	});

	it('mortar teams stop short and shell the column from out of its reach', () => {
		const w = testWorld();
		w.allies.deploy(w, ['rifleman', 'rifleman', 'rifleman'], 1200);
		const mortar = w.spawnUnit('mortar', 1600, 0);
		const hurt = (): boolean => w.allies.list.some((u) => u.hp < u.def.hp);
		run(w, 45, () => {
			for (const u of w.allies.list) u.x = Math.min(u.x, 1200);
			return hurt();
		});
		expect(hurt()).toBe(true);
		const gap = mortar.x - 1200;
		expect(gap).toBeGreaterThan(280);
		expect(gap).toBeLessThan(LOB.mortar!.range);
	});

	it('medics patch up the soldiers around them', () => {
		const w = testWorld();
		const medic = w.spawnUnit('medic', 2000, 0);
		const hurt = w.spawnUnit('rifleman', 2006, 0);
		const far = w.spawnUnit('rifleman', 2100, 0);
		hurt.hp = far.hp = 3;
		for (let i = 0; i < 90; i++) tend(medic, w.units, DT);
		expect(hurt.hp).toBeGreaterThan(9);
		expect(far.hp).toBe(3);
	});
});

describe('friendly specialists', () => {
	it('rocket artillery stays back and rains rounds on the enemy', () => {
		const w = testWorld();
		w.allies.deploy(w, ['rocketTruck'], 1100);
		const launcher = w.allies.list[0];
		const foe = w.spawnUnit('truck', 1900, 0);
		foe.speed = 0;
		run(w, 30, () => {
			foe.x = 1900;
			return foe.hp < foe.def.hp;
		});
		expect(foe.hp).toBeLessThan(foe.def.hp);
		expect(1900 - launcher.x).toBeGreaterThan(400);
	});

	it('holds indirect fire rather than drop it on our own troops', () => {
		const w = testWorld();
		w.allies.deploy(w, ['mortar', 'rifleman'], 1200);
		const [mortar, rifleman] = w.allies.list;
		const foe = w.spawnUnit('truck', 1600, 0);
		let shells = 0;
		run(w, 15, () => {
			mortar.x = 1200;
			// Our man is standing right on the target.
			rifleman.x = foe.x - 5;
			foe.x = 1600;
			shells = Math.max(shells, w.shells.filter((s) => s.owner === 'player').length);
			return false;
		});
		expect(shells).toBe(0);
	});

	it('medics keep our wounded on their feet', () => {
		const w = testWorld();
		w.allies.deploy(w, ['medic', 'rifleman'], 1200);
		const [, soldier] = w.allies.list;
		soldier.hp = 4;
		run(w, 4);
		expect(soldier.hp).toBeGreaterThan(10);
	});
});

describe('who turns up', () => {
	it('fields every new enemy type once the war has gone on a while', () => {
		const seen = new Set<UnitKind>();
		for (let seed = 1; seed <= 6; seed++) {
			for (const o of planWave(7, seed, 0).orders) seen.add(o.kind as UnitKind);
		}
		for (const k of [
			'sniper',
			'atTrooper',
			'mortar',
			'medic',
			'lightTank',
			'rocketTruck'
		] as UnitKind[])
			expect(seen).toContain(k);
	});

	it('keeps the early waves to the basics', () => {
		for (let seed = 1; seed <= 6; seed++) {
			for (const o of planWave(1, seed, 0).orders)
				if (o.kind in UNITS) expect(UNITS[o.kind as UnitKind].minWave).toBeLessThanOrEqual(1);
		}
	});

	it('mixes specialists and light armour into our groups', () => {
		const rng = new Rng(9);
		const seen = new Set<string>();
		for (let i = 0; i < 40; i++) for (const k of planGroup(6, rng)) seen.add(k);
		for (const k of ['atTrooper', 'medic', 'mortar', 'sniper', 'lightTank', 'rocketTruck'])
			expect(seen).toContain(k);
	});
});
