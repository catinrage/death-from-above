import { AirBase } from './base';
import { World } from './world';

let shared: World | null = null;

/**
 * A fully built world for tests. Building terrain and scenery takes a moment,
 * so one instance is shared and reset between tests.
 */
export function testWorld(): World {
	if (!shared) {
		shared = new World(11);
		shared.base = new AirBase();
	}
	shared.reset();
	shared.godMode = false;
	shared.wave = 1;
	return shared;
}
