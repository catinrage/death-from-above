import { updateAir } from './enemy-air';
import { ORBIT_PITCH, SIDE_PITCH } from './camera';
import type { PilotInput } from './player';
import { updateProjectiles } from './projectiles';
import { updateStrikes } from './specials';
import { updateUnits } from './unit-ai';
import { applyFireDamage, updateBombs } from './weapons';
import { updateWingman } from './wingman';
import type { World } from './world';

/**
 * Advances every simulation system by one fixed step. Pure game state — no
 * rendering, audio or DOM — so whole battles can run headlessly in tests.
 * Pass `null` input to leave the player's aircraft untouched.
 */
export function simulateWorld(w: World, dt: number, input: PilotInput | null): void {
	w.time += dt;
	const p = w.player;
	if (p && input) p.update(dt, input, w);
	w.railway?.update(w, dt);
	updateUnits(w, dt);
	updateAir(w, dt);
	updateWingman(w, dt);
	updateBombs(w, dt);
	updateProjectiles(w, dt);
	updateStrikes(w, dt);
	w.troops.update(w, dt);
	w.allies.update(w, dt);
	w.civilians.update(w, dt);
	w.gas.update(w, dt);
	applyFireDamage(w, dt);
	w.base.update(w, dt);
	w.bridge?.update(w, dt);
	w.railBridge?.update(w, dt);
	w.debris.update(dt, w.surface, w.fx);
	w.fires.update(dt);
	w.props.update(dt);
	w.terrain.update(dt);
	w.weather.update(w, dt);
	w.particles.update(dt, (x, z) => w.surface.heightAtXZ(x, z));
	w.lights.update(dt);
	w.fx.update(dt);
	if (p) {
		const target = p.crashed ? { x: p.x, y: p.y + 20, vx: 0, vy: 0 } : p.cameraTarget;
		// The gunship looks down on its orbit; everything else gets the flat side-on view.
		w.camera.pitchTarget = p.flight === 'orbit' && !p.crashed ? ORBIT_PITCH : SIDE_PITCH;
		w.camera.follow(dt, target, w.ground(target.x));
	}
}
