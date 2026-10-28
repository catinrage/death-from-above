import { describe, expect, it } from 'vitest';
import {
	BIOMES,
	BIOME_ORDER,
	climateWeather,
	gradeEnvironment,
	isBiome,
	type BiomeId
} from './biomes';
import { WORLD } from './constants';
import { environmentAt } from './environment';
import { Props } from './props';
import { Terrain } from './terrain';
import { testWorld } from './test-world';
import { weatherForWave } from './weather';

// A narrow strip keeps generation fast for unit tests.
const strip = (id: BiomeId): Terrain => new Terrain(7, -200, 900, null, BIOMES[id].shape);

const meshes = (p: Props, list: 'near' | 'far' | 'grass'): Set<string> =>
	new Set(p[list].map((q) => q.baseMesh));

describe('Biomes', () => {
	it('defines every biome with a full palette and a menu entry', () => {
		expect([...BIOME_ORDER].sort()).toEqual(Object.keys(BIOMES).sort());
		for (const id of BIOME_ORDER) {
			const b = BIOMES[id];
			expect(b.id).toBe(id);
			expect(isBiome(id)).toBe(true);
			for (const c of Object.values(b.ground)) {
				expect(c).toHaveLength(3);
				for (const v of c) expect(v).toBeGreaterThan(0);
			}
			expect(b.flora.trees.length).toBeGreaterThan(0);
			for (const [, w] of b.flora.trees) expect(w).toBeGreaterThan(0);
		}
		expect(isBiome('moon')).toBe(false);
	});

	it('keeps the battle line and airbase identical in every biome', () => {
		const ref = strip('temperate');
		for (const id of BIOME_ORDER) {
			const t = strip(id);
			for (let x = -150; x < 880; x += 7) expect(t.heightAt(x)).toBeCloseTo(ref.heightAt(x), 4);
			for (let x = WORLD.runwayMinX; x <= WORLD.runwayMaxX; x += 25)
				expect(t.heightAtXZ(x, -40)).toBeCloseTo(WORLD.baseHeight, 1);
		}
	});

	it('shapes the land away from the road differently per biome', () => {
		const relief = (t: Terrain, z: number): number => {
			let lo = Infinity,
				hi = -Infinity;
			for (let x = 600; x < 880; x += 2) {
				const h = t.heightAtXZ(x, z);
				lo = Math.min(lo, h);
				hi = Math.max(hi, h);
			}
			return hi - lo;
		};
		// Snow ridges tower over the valley; the city plain is flatter.
		expect(relief(strip('snow'), -300)).toBeGreaterThan(relief(strip('temperate'), -300));
		expect(relief(strip('city'), -60)).toBeLessThan(relief(strip('temperate'), -60));
		// Dunes ripple the desert foreground even where the valley is smooth.
		const desert = strip('desert'),
			plain = new Terrain(7, -200, 900, null, { ...BIOMES.desert.shape, dunes: 0 });
		let diff = 0;
		for (let x = 600; x < 880; x += 3)
			diff += Math.abs(desert.heightAtXZ(x, 40) - plain.heightAtXZ(x, 40));
		expect(diff / 94).toBeGreaterThan(0.5);
	});

	it('reshapes a terrain in place to match a freshly grown one', () => {
		const t = strip('temperate');
		t.crater(700, 0, 6, 3, 1, 1);
		t.dirtyChunks.clear();
		t.reshape(BIOMES.snow.shape);
		const fresh = strip('snow');
		for (let x = 300; x < 880; x += 11)
			for (const z of [-200, -40, 0, 30])
				expect(t.heightAtXZ(x, z)).toBeCloseTo(fresh.heightAtXZ(x, z), 4);
		expect(t.scorchAt(700)).toBe(0);
		expect(t.dirtyChunks.size).toBe(t.chunkCount);
		t.reset();
		expect(t.heightAt(700)).toBeCloseTo(fresh.heightAt(700), 4);
	});

	it('plants scenery that fits each biome', () => {
		const t = strip('temperate');
		const props = new Props(t, 5, null, BIOMES.desert.flora);
		const desertTrees = new Set([...meshes(props, 'near'), ...meshes(props, 'far')]);
		expect(desertTrees.has('cactus0') || desertTrees.has('cactus1')).toBe(true);
		expect(desertTrees.has('pine0')).toBe(false);
		const desertCount = props.far.length;

		props.rebuild(BIOMES.snow.flora);
		const snowTrees = props.far.filter((p) => p.kind === 'tree').map((p) => p.baseMesh);
		expect(snowTrees.every((m) => m.startsWith('snowPine') || m === 'deadTree')).toBe(true);
		expect(props.near.some((p) => p.kind === 'bush')).toBe(false);

		props.rebuild(BIOMES.jungle.flora);
		expect(props.far.length).toBeGreaterThan(desertCount * 3);
		expect(meshes(props, 'grass').has('fern')).toBe(true);

		props.rebuild(BIOMES.temperate.flora);
		expect(props.near.some((p) => p.baseMesh === 'house')).toBe(true);
		expect(props.near.some((p) => p.baseMesh.startsWith('block'))).toBe(false);
	});

	it('builds a city whose blocks collapse into rubble and stand again on reset', () => {
		const t = strip('city');
		const props = new Props(t, 5, null, BIOMES.city.flora);
		const blocks = props.near.filter((p) => p.baseMesh.startsWith('block'));
		expect(blocks.length).toBeGreaterThan(10);
		expect(props.far.filter((p) => p.baseMesh === 'block2').length).toBeGreaterThan(0);
		// The street front keeps the glass towers at the back.
		expect(blocks.some((p) => p.baseMesh === 'block2')).toBe(false);
		for (const b of blocks) {
			expect(b.z).toBeLessThan(-14);
			expect(b.x < WORLD.baseMinX - 40 || b.x > WORLD.baseMaxX + 30).toBe(true);
		}
		const b = blocks.find((p) => p.x > 600 && p.x < 850)!;
		expect(b).toBeDefined();
		// Tougher than a farmhouse: one light hit leaves it standing.
		expect(props.blast(b.x, b.y, b.z, 12, 130)).toHaveLength(0);
		let fallen: unknown[] = [];
		for (let i = 0; i < 6 && fallen.length === 0; i++) fallen = props.blast(b.x, b.y, b.z, 12, 130);
		expect(fallen).toContain(b);
		expect(b.mesh).toBe('rubble');
		expect(b.glow).toBeNull();
		props.reset();
		expect(b.mesh).toBe(b.baseMesh);
		expect(b.hp).toBe(b.maxHp);
		expect(b.glow).not.toBeNull();
	});

	it('grades the light per biome without breaking the day cycle', () => {
		for (const phase of [0, 1.5, 3, 4.5]) {
			const base = environmentAt(phase);
			expect(gradeEnvironment(base, BIOMES.temperate)).toEqual(base);
			for (const id of BIOME_ORDER) {
				const env = gradeEnvironment(base, BIOMES[id]);
				for (const v of [env.exposure, env.saturation, env.contrast, env.fog[0], ...env.tint])
					expect(Number.isFinite(v) && v > 0).toBe(true);
				expect(env.cloud[0]).toBeLessThanOrEqual(1);
				expect(env.stars).toBe(base.stars);
				expect(env.sunDir).toBe(base.sunDir);
			}
		}
		const noon = environmentAt(0);
		const desert = gradeEnvironment(noon, BIOMES.desert);
		const snow = gradeEnvironment(noon, BIOMES.snow);
		// Warm, clear desert haze; cool, bright snow bounce.
		expect(desert.horizon[0] / desert.horizon[2]).toBeGreaterThan(
			noon.horizon[0] / noon.horizon[2]
		);
		expect(desert.cloud[0]).toBeLessThan(noon.cloud[0]);
		expect(snow.ambGround[2]).toBeGreaterThan(noon.ambGround[2] * 2);
	});

	it('keeps the weather to what each climate allows', () => {
		const kinds = (id: BiomeId): Set<string> => {
			const out = new Set<string>();
			for (let wave = 1; wave <= 30; wave++)
				out.add(climateWeather(weatherForWave(wave), BIOMES[id]).kind);
			return out;
		};
		expect(kinds('temperate')).toEqual(new Set(['clear', 'rain', 'storm', 'snow']));
		expect(kinds('desert').has('snow') || kinds('desert').has('rain')).toBe(false);
		expect(kinds('snow').has('rain')).toBe(false);
		expect(kinds('jungle').has('snow')).toBe(false);
		const spec = weatherForWave(5);
		expect(climateWeather(spec, BIOMES.desert).wind).toBe(spec.wind);
	});

	it('swaps a live world to another biome and back', () => {
		const w = testWorld();
		const line = [700, 1500, 2600].map((x) => w.ground(x));
		expect(w.setBiome('temperate')).toBe(false);
		try {
			expect(w.setBiome('city')).toBe(true);
			w.reset();
			expect(w.biome.id).toBe('city');
			expect([700, 1500, 2600].map((x) => w.ground(x))).toEqual(line);
			expect(w.props.near.some((p) => p.baseMesh.startsWith('block'))).toBe(true);
			for (const p of w.props.near.slice(0, 200))
				expect(p.y).toBeCloseTo(w.terrain.heightAtXZ(p.x, p.z), 4);
			// The bridge still spans the river.
			expect(w.bridge!.spans.length).toBeGreaterThan(0);
		} finally {
			w.setBiome('temperate');
			w.reset();
		}
		expect(w.props.near.some((p) => p.baseMesh.startsWith('block'))).toBe(false);
	});
});
