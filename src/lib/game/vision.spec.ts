import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { aircraftSensor, aircraftSignature } from './vision';
import { HQ_HP } from './war';
import { nearestFriendly, Wingman } from './wingman';
import { wingProfile } from './wing-profile';
import type { World } from './world';

const STEP = 1 / 60;

function foggy(on = true): World {
	const w = testWorld();
	w.war.start(w, { hqHp: HQ_HP, auto: false, ourHq: true }, 5);
	w.units.length = 0;
	w.command.start(0);
	w.enemyCommand.start(0);
	w.player = null;
	w.vision.reset(on);
	return w;
}

const run = (w: World, seconds: number): void => {
	for (let t = 0; t < seconds; t += STEP) simulateWorld(w, STEP, null);
};

describe('fog of war', () => {
	it('changes nothing when it is off', () => {
		const w = foggy(false);
		const t = w.spawnUnit('tank', 3000, 0, -1);
		w.vision.update(w, 1);
		expect(w.vision.seen('player', t)).toBe(true);
	});

	it('a Raptor sees a Flanker long before the Flanker sees the Raptor', () => {
		expect(aircraftSensor('f22')[0] * aircraftSignature('su27')).toBeGreaterThan(1500);
		expect(aircraftSensor('su27')[0] * aircraftSignature('f22')).toBeLessThan(700);
		const w = foggy();
		const raptor = new Wingman(1700, w.ground(1700) + 200, {
			aircraft: 'f22',
			callsign: null,
			profile: wingProfile('f22'),
			autoRearm: true
		});
		w.escorts.push(raptor);
		const flanker = new AirUnit(w.newId(), 'fighter', 2700, w.ground(2700) + 200, 'su27');
		w.air.push(flanker);
		w.vision.update(w, 1);
		expect(w.vision.seen('player', flanker)).toBe(true);
		expect(w.vision.seen('enemy', raptor)).toBe(false);
		// So the Flanker has nobody to go after, while the Raptor already has it.
		expect(nearestFriendly(w, flanker.x, flanker.y)).toBeNull();
		expect(raptor.autoTarget(w)?.air).toBe(flanker);
	});

	it('a radar truck shows a rifle squad what it cannot see for itself', () => {
		const w = foggy();
		w.allies.deploy(w, ['rifleman', 'rifleman'], 1600);
		const tank = w.spawnUnit('tank', 2300, 0, -1);
		tank.stun = 1e4;
		run(w, 0.5);
		expect(w.vision.seen('player', tank)).toBe(false);
		w.allies.deploy(w, ['radarTruck'], 1500);
		run(w, 0.5);
		expect(w.vision.seen('player', tank)).toBe(true);
	});

	it('our guns leave alone what they cannot see, and open up once it is spotted', () => {
		const w = foggy();
		w.allies.deploy(w, ['tank'], 1500);
		const ours = w.allies.list[0];
		ours.stun = 1e4;
		const sniper = w.spawnUnit('sniper', 1760, 0, -1);
		sniper.stun = 1e4;
		const hp = sniper.hp;
		run(w, 8);
		expect(w.vision.seen('player', sniper)).toBe(false);
		expect(sniper.hp).toBe(hp);
		w.allies.deploy(w, ['radarTruck'], 1450);
		w.allies.list.at(-1)!.stun = 1e4;
		run(w, 12);
		expect(sniper.hp).toBeLessThan(hp);
	});

	it('remembers a lost contact for a moment, then forgets it', () => {
		const w = foggy();
		w.allies.deploy(w, ['radarTruck'], 1500);
		w.allies.list[0].stun = 1e4;
		const tank = w.spawnUnit('tank', 2200, 0, -1);
		tank.stun = 1e4;
		run(w, 0.5);
		expect(w.vision.seen('player', tank)).toBe(true);
		w.allies.list[0].alive = false;
		run(w, 1);
		expect(w.vision.seen('player', tank)).toBe(true);
		run(w, 3);
		expect(w.vision.seen('player', tank)).toBe(false);
	});
});
