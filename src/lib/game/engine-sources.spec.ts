import { describe, expect, it } from 'vitest';
import { engineSources } from './engine-sources';
import { AirUnit } from './enemy-air';
import { testWorld } from './test-world';
import { Wingman } from './wingman';

describe('engine sources', () => {
	it('hears our jets, enemy aircraft and both sides’ bombers, but not the wrecks', () => {
		const w = testWorld();
		w.escorts.push(new Wingman(100, 200, { aircraft: 'f16', callsign: null }));
		w.air.push(new AirUnit(w.newId(), 'heli', 400, 150));
		const downed = new AirUnit(w.newId(), 'fighter', 500, 250);
		downed.dying = true;
		w.air.push(downed);
		w.command.flybys.push({
			aircraft: 'b1',
			x: 0,
			y: 300,
			z: 0,
			vy: 0,
			dir: 1,
			speed: 150,
			target: 900,
			cruise: 300,
			nextDrop: 0
		});
		const heard = engineSources(w);
		expect(heard.map((s) => [s.engine, s.size])).toEqual([
			['jet', 1],
			['rotor', 1],
			['jet', 2]
		]);
		expect(heard[2].vx).toBe(150);
		w.command.flybys.length = 0;
	});
});
