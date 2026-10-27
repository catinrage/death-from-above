import { describe, expect, it } from 'vitest';
import { Player } from './player';
import { launchMissile } from './projectiles';
import { testWorld } from './test-world';
import { cockpitAlerts, missileThreat } from './warnings';

describe('cockpit warnings', () => {
	it('reports the closest missile homing on the aircraft and where it is', () => {
		const w = testWorld();
		const p = new Player('kestrel', 1500, w.ground(1500) + 200, 0);
		w.player = p;
		expect(missileThreat(w, p).missileDist).toBe(0);
		const base = {
			kind: 'manpads',
			angle: 0,
			speed: 100,
			maxSpeed: 200,
			accel: 50,
			turnRate: 2,
			target: p,
			burn: 4,
			life: 8,
			damage: 30,
			owner: 'enemy',
			seeker: 'heat'
		} as const;
		launchMissile(w, { ...base, x: 900, y: p.y });
		launchMissile(w, { ...base, x: 1500, y: p.y - 300 });
		const t = missileThreat(w, p);
		expect(t.missileDist).toBeCloseTo(300, 0);
		// Straight below the aircraft: pointing down the screen.
		expect(t.missileDir).toBeCloseTo(Math.PI / 2, 2);
		expect(cockpitAlerts(w, p).missile).toBe(true);
	});
});
