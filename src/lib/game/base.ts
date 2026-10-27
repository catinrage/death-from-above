import { angleDiff, clamp, moveToward } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { MeshName } from '../models';
import { WORLD } from './constants';
import type { FireSource } from './fires';
import { spawnBullet } from './projectiles';
import type { World } from './world';

export interface BaseStructure {
	mesh: MeshName;
	glow: MeshName | null;
	x: number;
	z: number;
	yaw: number;
	scale: number;
	fire: FireSource | null;
}

export interface BaseGun {
	x: number;
	z: number;
	yaw: number;
	pitch: number;
	cooldown: number;
}

const LAYOUT: Omit<BaseStructure, 'fire'>[] = [
	{
		mesh: 'runway',
		glow: null,
		x: (WORLD.runwayMinX + WORLD.runwayMaxX) / 2,
		z: 0,
		yaw: 0,
		scale: 1
	},
	{ mesh: 'hangar', glow: 'hangarGlow', x: 105, z: -46, yaw: 0, scale: 1 },
	{ mesh: 'hangar', glow: 'hangarGlow', x: 192, z: -50, yaw: 0, scale: 1 },
	{ mesh: 'tower', glow: 'towerGlow', x: 307.5, z: -34, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: 393, z: -42, yaw: 0, scale: 1 },
	{ mesh: 'fuelTankSmall', glow: null, x: 420, z: -50, yaw: 0.2, scale: 1 },
	{ mesh: 'windsock', glow: null, x: 468, z: 17, yaw: 0, scale: 1 },
	{ mesh: 'flagpole', glow: null, x: 33, z: -22, yaw: 0, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: 507, z: 9, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'sandbagWall', glow: null, x: 507, z: -10, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'crates', glow: null, x: 240, z: -28, yaw: 0.4, scale: 1 },
	{ mesh: 'crates', glow: null, x: 60, z: -30, yaw: -0.3, scale: 1 },
	{ mesh: 'kestrel', glow: null, x: 105, z: -27, yaw: Math.PI / 2, scale: 1 },
	{ mesh: 'grizzly', glow: null, x: 192, z: -30, yaw: Math.PI / 2 + 0.2, scale: 1 }
];

/** The friendly airfield: rearm point, objective to defend, and its AA cover. */
export class AirBase {
	hp = 1000;
	readonly maxHp = 1000;
	readonly minX = WORLD.baseMinX;
	readonly maxX = WORLD.baseMaxX;
	readonly structures: BaseStructure[] = LAYOUT.map((s) => ({ ...s, fire: null }));
	readonly guns: BaseGun[] = [
		{ x: -6, z: -16, yaw: 0, pitch: 0.6, cooldown: 1 },
		{ x: 515, z: -20, yaw: 0, pitch: 0.6, cooldown: 2 }
	];
	underAttack = 0;
	private fireStage = 0;

	damage(w: World, amount: number): void {
		if (this.hp <= 0) return;
		this.hp = Math.max(0, this.hp - amount);
		this.underAttack = 3;
		const stage = Math.floor((1 - this.hp / this.maxHp) * 5);
		while (this.fireStage < stage) {
			this.fireStage++;
			const s = rnd.pick(this.structures.filter((b) => !b.fire && b.mesh !== 'runway'));
			if (s) {
				const y = w.terrain.heightAtXZ(s.x, s.z);
				s.fire = w.fires.add(s.x + rnd.range(-3, 3), y + 2, s.z, 2.2, 1e9, { radius: 3 });
				w.fx.explosion(s.x, y + 2, s.z, 1, true);
			}
		}
	}

	/** An enemy shell landing on the airfield. */
	shellHit(w: World, x: number, dmg: number): void {
		const g = w.ground(x);
		const z = rnd.range(-30, 10);
		w.fx.explosion(x, g, z, 0.55, true);
		w.terrain.crater(x, z, 2.5, 0.6, 1, 0.6);
		w.sound.boom(0.6, x, g);
		this.damage(w, dmg);
	}

	update(w: World, dt: number): void {
		this.underAttack = Math.max(0, this.underAttack - dt);
		for (const u of w.units) {
			if (u.alive && u.state === 'siege') this.damage(w, u.def.siege * dt);
		}
		for (const g of this.guns) this.gun(w, g, dt);
	}

	private gun(w: World, g: BaseGun, dt: number): void {
		g.cooldown -= dt;
		let target: { x: number; y: number; vx: number; vy: number } | null = null;
		let best = 750;
		for (const a of w.air) {
			if (!a.alive || a.dying) continue;
			const d = Math.hypot(a.x - g.x, a.y - w.ground(g.x));
			if (d < best) {
				best = d;
				target = a;
			}
		}
		const gy = w.ground(g.x) + 2.2;
		if (!target) {
			g.pitch = moveToward(g.pitch, 0.6, dt * 0.4);
			return;
		}
		const t = best / 700;
		const tx = target.x + target.vx * t,
			ty = target.y + target.vy * t;
		g.yaw = moveToward(g.yaw, tx >= g.x ? 0 : Math.PI, dt * 2);
		const want = clamp(Math.atan2(ty - gy, Math.abs(tx - g.x)), 0, 1.4);
		g.pitch = moveToward(g.pitch, want, dt * 1.5);
		if (g.cooldown > 0 || Math.abs(angleDiff(g.pitch, want)) > 0.1) return;
		g.cooldown = 0.12;
		const a = Math.atan2(ty - gy, tx - g.x) + rnd.gauss(0.03);
		spawnBullet(w, {
			x: g.x + Math.cos(a) * 6,
			y: gy + Math.sin(a) * 6,
			z: g.z,
			vx: Math.cos(a) * 700,
			vy: Math.sin(a) * 700,
			life: 1.4,
			damage: 5,
			pierce: 0.2,
			owner: 'player',
			tracer: true,
			color: [6, 9, 4],
			size: 0.2,
			explosive: 0
		});
		w.fx.muzzleFlash(
			g.x + Math.cos(a) * 6,
			gy + Math.sin(a) * 6,
			g.z,
			Math.cos(a),
			Math.sin(a),
			1.2,
			[8, 10, 5]
		);
		w.sound.play('aaGun', g.x, gy, 0.3, 1.2);
	}

	reset(): void {
		this.hp = this.maxHp;
		this.fireStage = 0;
		for (const s of this.structures) s.fire = null;
	}
}
