import { smoothstep } from '../engine/math';
import { Noise } from '../engine/noise';
import { Rng } from '../engine/rng';
import type { MeshName } from '../models';
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
	readonly baseMesh: MeshName;
	readonly baseGlow: MeshName | null;
}

const TREES: MeshName[] = ['pine0', 'pine1', 'pine2', 'broad0', 'broad1', 'broad2'];
const BUSHES: MeshName[] = ['bush0', 'bush1'];
const ROCKS: MeshName[] = ['rock0', 'rock1', 'rock2'];
const GRASS: MeshName[] = ['grass0', 'grass1', 'grass2'];

/**
 * Scenery along the battlefield. `near` holds everything close to the battle
 * line (destructible, culled tightly); `far` holds the background forests.
 * Both lists are sorted by x for fast range queries.
 */
export class Props {
	readonly near: Prop[] = [];
	readonly far: Prop[] = [];
	readonly grass: Prop[] = [];

	constructor(
		private readonly terrain: Terrain,
		seed = 99,
		river: River | null = null
	) {
		const rng = new Rng(seed);
		const noise = new Noise(seed + 1);
		this.forests(rng, noise);
		this.foreground(rng);
		this.villages(rng);
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
		for (let x = x0; x < x1; x += 2.2) {
			const density = smoothstep(0.0, 0.5, noise.fbm1(x * 0.0045, 3)) * 1.6;
			for (const [zMin, zMax, chance, list] of [
				[-38, -11, 0.28, this.near],
				[-95, -38, 0.42, this.far],
				[-190, -95, 0.5, this.far]
			] as const) {
				if (!rng.chance(chance * (0.05 + density))) continue;
				const z = rng.range(zMin, zMax);
				const tx = x + rng.range(-1, 1);
				if (this.inBase(tx, z)) continue;
				const roll = rng.next();
				const mesh: MeshName =
					roll < 0.07 ? 'deadTree' : roll < 0.6 ? TREES[rng.int(0, 2)] : TREES[rng.int(3, 5)];
				const s = rng.range(0.8, 1.25) * (z < -95 ? 1.3 : 1);
				this.add(list, mesh, 'tree', tx, z, s, rng);
				if (rng.chance(0.3))
					this.add(
						list,
						rng.pick(BUSHES),
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
		for (let x = x0; x < x1; x += 1.7) {
			for (let k = 0; k < 3; k++) {
				const z = rng.range(-13, 22);
				if (Math.abs(z) < 4.6 || this.inBase(x, z)) continue;
				this.add(
					this.grass,
					rng.pick(GRASS),
					'grass',
					x + rng.range(-0.8, 0.8),
					z,
					rng.range(0.8, 1.5),
					rng
				);
			}
			if (rng.chance(0.05)) {
				const z = rng.range(9, 40);
				if (!this.inBase(x, z))
					this.add(this.near, rng.pick(BUSHES), 'bush', x, z, rng.range(0.8, 1.5), rng);
			}
			if (rng.chance(0.03)) {
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
					p.mesh = 'ruin';
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
			p.hp = p.kind === 'house' ? 120 : 30;
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
	if (r.offset(x, z) < r.halfWidthAt(z) + 7) return true;
	return Math.abs(z) < 7 && Math.abs(x - r.x0) < r.bridgeHalf + 6;
}
