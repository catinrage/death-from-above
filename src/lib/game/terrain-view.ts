import type { Renderer } from '../engine/renderer';
import type { Terrain } from './terrain';

/** Mirrors terrain chunks into GPU buffers and streams crater edits back up. */
export class TerrainView {
	private readonly ids: number[] = [];
	private readonly scratch: Float32Array[] = [];

	constructor(
		private readonly renderer: Renderer,
		private readonly terrain: Terrain
	) {
		for (let k = 0; k < terrain.chunkCount; k++) {
			const verts = terrain.chunkVertices(k);
			const [c0, c1] = terrain.chunkRange(k);
			const minX = terrain.minX + c0 * terrain.dx;
			const maxX = terrain.minX + c1 * terrain.dx;
			this.ids.push(renderer.createTerrainChunk(verts, terrain.chunkIndices(k), minX, maxX));
			this.scratch.push(verts);
		}
		terrain.dirtyChunks.clear();
	}

	/** Uploads every modified chunk now (after the landscape was regrown). */
	syncAll(): void {
		this.sync(Infinity);
	}

	/** Uploads up to `budget` modified chunks this frame. */
	sync(budget = 8): void {
		let n = 0;
		for (const k of this.terrain.dirtyChunks) {
			const data = this.terrain.chunkVertices(k, this.scratch[k]);
			this.renderer.updateTerrainChunk(this.ids[k], data);
			this.terrain.dirtyChunks.delete(k);
			if (++n >= budget) break;
		}
	}
}
