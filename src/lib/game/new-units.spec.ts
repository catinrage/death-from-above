import { describe, expect, it } from 'vitest';
import { allyDef } from './allies';
import { COMMANDS } from './command';
import { UNITS } from './defs-units';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import type { UnitKind } from './types';
import { HQ_HP } from './war';
import type { World } from './world';

const STEP = 1 / 60;

function commandWorld(): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false }, 5);
	w.units.length = 0;
	w.command.start(99_999);
	return w;
}

function run(w: World, seconds: number, until?: () => boolean): void {
	for (let t = 0; t < seconds && !until?.(); t += STEP) simulateWorld(w, STEP, null);
}

describe('new ground units', () => {
	it('can be ordered in command mode and roll out as ours', () => {
		const w = commandWorld();
		for (const id of ['ifv', 'tankDestroyer', 'mgTeam'] as const) {
			expect(w.command.order(w, id)).toBeNull();
		}
		run(w, 12, () => w.allies.list.length >= 1 + 4 + 1 + 2);
		const kinds = w.allies.list.map((u) => u.def.kind);
		for (const k of ['ifv', 'tankDestroyer', 'mgTeam'] as UnitKind[]) expect(kinds).toContain(k);
		for (const u of w.allies.list) expect(u.def).toBe(allyDef(u.def.kind as never));
		expect(COMMANDS.ifv.tab).toBe('vehicles');
		expect(COMMANDS.mgTeam.tab).toBe('infantry');
	});

	it.each(['ifv', 'tankDestroyer', 'mgTeam'] as UnitKind[])(
		'our %s fights an enemy in range',
		(kind) => {
			const w = commandWorld();
			w.allies.deploy(w, [kind as never], 1200);
			const foe = w.spawnUnit(kind === 'mgTeam' ? 'rifleman' : 'tank', 1480, 0, -1);
			foe.stun = 1e4;
			const hp = foe.hp;
			run(w, 30, () => foe.hp < hp);
			expect(foe.hp).toBeLessThan(hp);
		}
	);

	it('the enemy fields them too, and theirs shoot back', () => {
		const w = commandWorld();
		w.allies.deploy(w, ['tank'], 1200);
		const tank = w.allies.list[0];
		tank.stun = 1e4;
		const hp = tank.hp;
		w.spawnUnit('tankDestroyer', 1520, 0, -1);
		run(w, 30, () => tank.hp < hp);
		expect(tank.hp).toBeLessThan(hp);
	});

	it('a tank destroyer outguns a light tank against armour', () => {
		expect(UNITS.tankDestroyer.range).toBeGreaterThan(UNITS.lightTank.range);
		expect(UNITS.ifv.hp).toBeGreaterThan(UNITS.apc.hp);
	});
});
