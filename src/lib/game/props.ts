import { smoothstep } from '../engine/math';
import { Noise } from '../engine/noise';
import { Rng } from '../engine/rng';
import type { MeshName } from '../models';
import { BIOMES, type Flora } from './biomes';
import { WORLD } from './constants';
import type { River } from './river';
import type { Terrain } from './terrain';

export type PropKind = 'tree' | 'bush' | 'rock' | 'grass' | 'house' | 'pole' | 'fence' | 'decor';

export interface Prop {
	mesh: MeshName;
	glow: MeshName | null;
	kind: PropKind;
	x: number;
	y: number;
	z: number;
	yaw: number;
	scale: number;
	sway: number;
	hp: number;
	fall: number;
	fallDir: number;
	falling: boolean;
	char: number;
	ruined: boolean;
	tint: number;
	/** Strength before a house or block collapses. */
	maxHp: number;
	/** Mesh left standing once it collapses. */
	ruin: MeshName;
	readonly baseMesh: MeshName;
	readonly baseGlow: MeshName | null;
}

const ROCKS: MeshName[] = ['rock0', 'rock1', 'rock2'];

/** City blocks: mesh, lit windows, footprint half-depth and strength. */
const BLOCKS: readonly (readonly [MeshName, MeshName, number, number])[] = [
	['block0', 'block0Lights', 5, 260],
	['block1', 'block1Lights', 5, 320],
	['block2', 'block2Lights', 7, 420],
	['block3', 'block3Lights', 4.5, 180]
];

function pickWeighted(rng: Rng, items: Flora['trees']): MeshName {
	let total = 0;
	for (const [, w] of items) total += w;
	let r = rng.next() * total;
	for (const [m, w] of items) {
		r -= w;
		if (r <= 0) return m;
	}
	return items[items.length - 1][0];
}

/**
 * Scenery along the battlefield. `near` holds everything close to the battle
 * line (destructible, culled tightly); `far` holds the background forests.
 * Both lists are sorted by x for fast range queries.
 */
export class Props {
	readonly near: Prop[] = [];
	readonly far: Prop[] = [];
	readonly grass: Prop[] = [];
	private flora: Flora;

	constructor(
		private readonly terrain: Terrain,
		private readonly seed = 99,
		private readonly river: River | null = null,
		flora: Flora = BIOMES.temperate.flora
	) {
		this.flora = flora;
		this.populate();
	}

	/** Replants the scenery for another biome (after the terrain was reshaped). */
	rebuild(flora: Flora): void {
		this.flora = flora;
		this.populate();
	}

	private populate(): void {
		const rng = new Rng(this.seed);
		const noise = new Noise(this.seed + 1);
		const river = this.river;
		this.near.length = this.far.length = this.grass.length = 0;
		this.forests(rng, noise);
		this.foreground(rng);
		if (this.flora.settlement === 'city') this.city(rng);
		else this.villages(rng);
		this.roadside(rng);
		for (const list of [this.near, this.far, this.grass]) {
			if (river) {
				// Nothing grows in the river or stands on the bridge approaches.
				const keep = list.filter((p) => !inRiver(river, p.x, p.z));
				list.length = 0;
				list.push(...keep);
			}
			list.sort((a, b) => a.x - b.x);
		}
	}

	private add(
		list: Prop[],
		mesh: MeshName,
		kind: PropKind,
		x: number,
		z: number,
		scale: number,
		rng: Rng,
		glow: MeshName | null = null
	): Prop {
		const p: Prop = {
			mesh,
			glow,
			kind,
			x,
			y: this.terrain.heightAtXZ(x, z),
			z,
			yaw: rng.range(0, Math.PI * 2),
			scale,
			sway: kind === 'tree' ? 0.35 : kind === 'grass' ? 1 : kind === 'bush' ? 0.4 : 0,
			hp: kind === 'house' ? 120 : 30,
			fall: 0,
			fallDir: 1,
			falling: false,
			char: 0,
			ruined: false,
			tint: rng.range(0.85, 1.1),
			maxHp: kind === 'house' ? 120 : 30,
			ruin: 'ruin',
			baseMesh: mesh,
			baseGlow: glow
		};
		list.push(p);
		return p;
	}

	private inBase(x: number, z: number): boolean {
		return x > WORLD.baseMinX - 40 && x < WORLD.baseMaxX + 30 && z > -80 && z < 34;
	}

	private forests(rng: Rng, noise: Noise): void {
		const { terrainMinX: x0, terrainMaxX: x1 } = WORLD;
		const fl = this.flora;
		for (let x = x0; x < x1; x += 2.2) {
			const density = Math.max(fl.cover, smoothstep(0.0, 0.5, noise.fbm1(x * 0.0045, 3)) * 1.6);
			for (const [zMin, zMax, chance, list] of [
				[-38, -11, 0.28, this.near],
				[-95, -38, 0.42, this.far],
				[-190, -95, 0.5, this.far]
			] as const) {
				if (!rng.chance(chance * (0.05 + density) * fl.forest)) continue;
				const z = rng.range(zMin, zMax);
				const tx = x + rng.range(-1, 1);
				if (this.inBase(tx, z)) continue;
				const mesh = pickWeighted(rng, fl.trees);
				const s = rng.range(0.8, 1.25) * (z < -95 ? 1.3 : 1);
				this.add(list, mesh, 'tree', tx, z, s, rng);
				if (fl.bushes.length > 0 && rng.chance(0.3 * fl.undergrowth))
					this.add(
						list,
						rng.pick(fl.bushes),
						'bush',
						tx + rng.range(-3, 3),
						z + rng.range(-2, 2),
						rng.range(0.7, 1.2),
						rng
					);
			}
		}
	}

	private foreground(rng: Rng): void {
		const { terrainMinX: x0, terrainMaxX: x1 } = WORLD;
		const fl = this.flora;
		const tries = Math.floor(fl.grassDensity);
		const extra = fl.grassDensity - tries;
		for (let x = x0; x < x1; x += 1.7) {
			const n = fl.grass.length === 0 ? 0 : tries + (rng.chance(extra) ? 1 : 0);
			for (let k = 0; k < n; k++) {
				const z = rng.range(-13, 22);
				if (Math.abs(z) < 4.6 || this.inBase(x, z)) continue;
				this.add(
					this.grass,
					rng.pick(fl.grass),
					'grass',
					x + rng.range(-0.8, 0.8),
					z,
					rng.range(0.8, 1.5),
					rng
				);
			}
			if (fl.bushes.length > 0 && rng.chance(0.05 * fl.undergrowth)) {
				const z = rng.range(9, 40);
				if (!this.inBase(x, z))
					this.add(this.near, rng.pick(fl.bushes), 'bush', x, z, rng.range(0.8, 1.5), rng);
			}
			if (rng.chance(0.03 * fl.rocks)) {
				const z = rng.chance(0.5) ? rng.range(7, 45) : rng.range(-30, -7);
				if (!this.inBase(x, z))
					this.add(this.near, rng.pick(ROCKS), 'rock', x, z, rng.range(0.6, 1.8), rng);
			}
		}
	}

	private villages(rng: Rng): void {
		for (const vx of [800, 1500, 2200, 3350, 4150, -500]) {
			const n = rng.int(3, 6);
			for (let i = 0; i < n; i++) {
				const x = vx + rng.range(-55, 55);
				const z = rng.range(-34, -13);
				const white = rng.chance(0.4);
				const h = this.add(
					this.near,
					white ? 'houseWhite' : 'house',
					'house',
					x,
					z,
					1,
					rng,
					white ? 'houseWhiteLights' : 'houseLights'
				);
				h.yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rng.range(-0.15, 0.15);
				h.sway = 0;
				if (rng.chance(0.5))
					this.add(this.near, 'fence', 'fence', x + rng.range(-6, 6), z + 5, 1, rng).yaw =
						rng.range(-0.2, 0.2);
				if (rng.chance(0.4)) this.add(this.near, 'crates', 'decor', x + 5, z + 3, 1, rng);
			}
		}
	}

	/** Blocks along the road and a skyline of towers behind them. */
	private city(rng: Rng): void {
		const { terrainMinX: x0, terrainMaxX: x1 } = WORLD;
		for (const [zMin, zMax, gap, scale, list] of [
			[-30, -21, 0.2, 1, this.near],
			[-80, -50, 0.45, 1, this.far],
			[-190, -110, 0.35, 1.3, this.far]
		] as const) {
			for (let x = x0 + rng.range(0, 10); x < x1;) {
				let pick = rng.pick(BLOCKS);
				// Glass towers stand at the back; the street front stays mid-rise.
				if (list === this.near && pick[0] === 'block2') pick = BLOCKS[0];
				const width = pick[2] * 2.4 * scale;
				const z = rng.range(zMin, zMax);
				if (!rng.chance(gap) && !this.inBase(x, z) && !this.inBase(x + width, z)) {
					const p = this.add(
						list,
						pick[0],
						'house',
						x + width / 2,
						z,
						scale * rng.range(0.9, 1.1),
						rng,
						pick[1]
					);
					p.yaw = rng.pick([0, Math.PI]) + rng.range(-0.04, 0.04);
					p.sway = 0;
					p.hp = p.maxHp = pick[3];
					p.ruin = 'rubble';
					p.tint = rng.range(0.8, 1.15);
				}
				x += width + rng.range(4, 12);
			}
		}
	}

	private roadside(rng: Rng): void {
		for (let x = WORLD.baseMaxX + 60; x < WORLD.terrainMaxX; x += 46 + rng.range(-4, 4)) {
			const p = this.add(this.near, 'pole', 'pole', x, -7.5, 1, rng);
			p.yaw = rng.range(-0.08, 0.08);
		}
		for (let x = 2000; x < 3700; x += rng.range(60, 140)) {
			const z = rng.pick([-6.5, 6.5]);
			const p = this.add(
				this.near,
				rng.chance(0.5) ? 'tankTrap' : 'sandbagWall',
				'decor',
				x,
				z,
				1,
				rng
			);
			p.yaw = rng.range(-0.3, 0.3);
		}
	}

	/** Index of the first prop with x >= value. */
	static lowerBound(list: readonly Prop[], x: number): number {
		let lo = 0,
			hi = list.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid].x < x) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/**
	 * Applies an explosion to scenery. Returns houses that collapsed so the
	 * caller can spawn debris for them.
	 */
	blast(x: number, y: number, z: number, radius: number, damage: number): Prop[] {
		const collapsed: Prop[] = [];
		const list = this.near;
		for (
			let i = Props.lowerBound(list, x - radius);
			i < list.length && list[i].x <= x + radius;
			i++
		) {
			const p = list[i];
			const d = Math.hypot(p.x - x, (p.y - y) * 0.6, p.z - z);
			if (d > radius) continue;
			const k = 1 - d / radius;
			p.char = Math.min(1, p.char + k * 1.4);
			if (p.kind === 'tree' && !p.falling && k > 0.25) {
				p.falling = true;
				p.fallDir = p.x >= x ? 1 : -1;
			} else if (p.kind === 'house' && !p.ruined) {
				p.hp -= damage * k;
				if (p.hp <= 0) {
					p.ruined = true;
					p.mesh = p.ruin;
					p.glow = null;
					collapsed.push(p);
				}
			} else if (p.kind === 'bush' || p.kind === 'fence' || p.kind === 'pole') {
				if (k > 0.4) {
					p.falling = true;
					p.fallDir = p.x >= x ? 1 : -1;
				}
			}
		}
		return collapsed;
	}

	/** Stands every tree back up and rebuilds the villages. */
	reset(): void {
		for (const p of this.near) {
			p.fall = 0;
			p.falling = false;
			p.char = 0;
			p.ruined = false;
			p.hp = p.maxHp;
			p.mesh = p.baseMesh;
			p.glow = p.baseGlow;
		}
	}

	update(dt: number): void {
		for (const p of this.near) {
			if (!p.falling || p.fall >= Math.PI / 2 - 0.05) continue;
			p.fall = Math.min(Math.PI / 2 - 0.05, p.fall + dt * (0.4 + p.fall * 3));
		}
	}
}

function inRiver(r: River, x: number, z: number): boolean {
	if (r.inChannel(x, z, 7)) return true;
	return Math.abs(z) < 7 && Math.abs(x - r.x0) < r.bridgeHalf + 6;
}
