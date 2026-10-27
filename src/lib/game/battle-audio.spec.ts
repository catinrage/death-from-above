import { describe, expect, it } from 'vitest';
import { threatLevel } from '../audio/music';
import { radioState, threatInput } from './battle-audio';
import { AirUnit } from './enemy-air';
import { Player } from './player';
import { testWorld } from './test-world';

describe('battle audio inputs', () => {
	it('counts enemy aircraft near the player and raises the threat', () => {
		const w = testWorld();
		const p = new Player('kestrel', 800, 200, 0);
		w.player = p;
		const before = threatLevel(threatInput(w, p, 'active'));
		w.air.push(new AirUnit(1, 'fighter', 900, 220));
		const t = threatInput(w, p, 'active');
		expect(t.enemyAir).toBe(1);
		expect(t.near).toBe(1);
		expect(threatLevel(t)).toBeGreaterThan(before);
	});

	it('reports the airfield and the aircraft to the radio', () => {
		const w = testWorld();
		const p = new Player('kestrel', 800, 200, 0);
		w.player = p;
		w.base.hp = w.base.maxHp / 2;
		const s = radioState(w, p, 'briefing', 2);
		expect(s).toMatchObject({ base: 0.5, alive: true, lives: 2, waveState: 'briefing' });
	});

	it('treats a missing aircraft as down', () => {
		const w = testWorld();
		w.player = null;
		expect(threatInput(w, null, 'active').alive).toBe(false);
	});
});
