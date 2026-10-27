import type { Bridge } from './bridge';
import type { DebrisGround } from './debris';
import type { River } from './river';
import type { Terrain } from './terrain';

export type SurfaceKind = 'ground' | 'water' | 'deck';

/**
 * Terrain, river and bridge combined into the questions gameplay asks:
 * what is under this point, where does it land, what must a plane clear.
 */
export class Surface implements DebrisGround {
	/** Set by `under`: what the last queried point was over. */
	kind: SurfaceKind = 'ground';

	constructor(
		readonly terrain: Terrain,
		readonly river: River | null,
		readonly bridge: Bridge | null,
		/** The rail viaduct behind the road. */
		readonly railBridge: Bridge | null = null
	) {}

	/** The bridge whose intact deck is over (x, z), if any. */
	private deck(x: number, z: number): Bridge | null {
		if (this.bridge?.deckAt(x, z) != null) return this.bridge;
		if (this.railBridge?.deckAt(x, z) != null) return this.railBridge;
		return null;
	}

	water(x: number, z: number): number {
		return this.river ? this.river.waterAt(x, z) : -Infinity;
	}

	/** Ground or water surface, ignoring the bridge (particles, spray, shadows). */
	heightAtXZ(x: number, z: number): number {
		return Math.max(this.terrain.heightAtXZ(x, z), this.water(x, z));
	}

	/** What something at (x, y, z) rests on: terrain, or the deck if it is up there. */
	support(x: number, y: number, z: number): number {
		const g = this.terrain.heightAtXZ(x, z);
		const deck = this.deck(x, z);
		return deck && y > deck.deckY - deck.spec.below ? Math.max(g, deck.deckY) : g;
	}

	/** Surface a falling point at (x, y, z) would hit; sets `kind`. */
	under(x: number, y: number, z: number): number {
		const g = this.terrain.heightAtXZ(x, z);
		const deck = this.deck(x, z);
		if (deck && y > deck.deckY - deck.spec.below && deck.deckY > g) {
			this.kind = 'deck';
			return deck.deckY;
		}
		const wl = this.water(x, z);
		this.kind = wl > g ? 'water' : 'ground';
		return Math.max(g, wl);
	}

	/** Battle-line surface at x (deck, water or ground) for projectiles and the camera. */
	ground(x: number): number {
		return this.under(x, Infinity, 0);
	}

	/** Lowest safe height for an aircraft over x: includes the bridge's steelwork. */
	clearance(x: number): number {
		const top = this.bridge?.topAt(x);
		const g = Math.max(this.terrain.heightAt(x), this.water(x, 0));
		return top != null ? Math.max(g, top) : g;
	}
}
