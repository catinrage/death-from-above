import { updateDrones } from './drones';
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
export function simulateWorld(
	w: World,
	dt: number,
	input: PilotInput | null,
	p2Input: PilotInput | null = null
): void {
	w.time += dt;
	const p = w.player;
	if (p && input) p.update(dt, input, w);
	const q = w.player2;
	if (q && p2Input) q.update(dt, p2Input, w);
	w.railway?.update(w, dt);
	updateUnits(w, dt);
	updateAir(w, dt);
	updateWingman(w, dt);
	updateDrones(w, dt);
	updateBombs(w, dt);
	updateProjectiles(w, dt);
	updateStrikes(w, dt);
	w.troops.update(w, dt);
	w.allies.update(w, dt);
	w.war.update(w, dt);
	w.command.update(w, dt);
	w.enemyCommand.update(w, dt);
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
	followPilots(w, dt);
}

/**
 * Points the camera at the aircraft. In co-op it frames both, and stays on
 * whichever is still flying while the other waits to respawn.
 */
export function followPilots(w: World, dt: number): void {
	const p = w.player;
	if (!p) return;
	const q = w.player2;
	const flying = q && !q.crashed && p.crashed ? q : p;
	const other = flying === p ? q : null;
	w.camera.second = other && !other.crashed ? other.cameraTarget : null;
	const target = flying.crashed
		? { x: flying.x, y: flying.y + 20, vx: 0, vy: 0 }
		: flying.cameraTarget;
	// The gunship looks down on its orbit; everything else gets the flat side-on view.
	w.camera.pitchTarget = flying.flight === 'orbit' && !flying.crashed ? ORBIT_PITCH : SIDE_PITCH;
	let ground = w.ground(target.x);
	if (w.camera.second) ground = Math.min(ground, w.ground(w.camera.second.x));
	w.camera.follow(dt, target, ground);
}
