import { describe, expect, it } from 'vitest';
import { radioState } from './battle-audio';
import { AirUnit } from './enemy-air';
import { Player } from './player';
import { testWorld } from './test-world';

describe('radio state', () => {
	it('reports the airfield, the aircraft and enemy air to the radio', () => {
		const w = testWorld();
		const p = new Player('kestrel', 800, 200, 0);
		w.player = p;
		w.base.hp = w.base.maxHp / 2;
		w.air.push(new AirUnit(1, 'fighter', 900, 220));
		const s = radioState(w, p, 'briefing', 2);
		expect(s).toMatchObject({
			base: 0.5,
			alive: true,
			lives: 2,
			waveState: 'briefing',
			enemyAir: 1
		});
	});

	it('treats a missing aircraft as down', () => {
		const w = testWorld();
		w.player = null;
		expect(radioState(w, null, 'active', 1).alive).toBe(false);
	});
});
