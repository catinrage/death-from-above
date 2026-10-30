import { angleDiff, clamp, damp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode } from './combat';
import { WORLD } from './constants';
import { AIRCRAFT } from './defs-aircraft';
import { BOMBS, type BlastSpec } from './defs-bombs';
import { FlareDrill, launchMissile, spawnBullet } from './projectiles';
import { FlatTurn } from './flat-turn';
import { spread } from './spacing';
import { bomberAltitude, TACTICS } from './wing-profile';
import { dropBomb, predictImpact } from './weapons';
import { levelOff, pullUpRoom, safeTurn } from './terrain-floor';
import type { Player } from './player';
import type { AircraftId, Owner, Trackable, Unit, UnitKind } from './types';
import { nearestFriendly, type AirAlly } from './wingman';
import type { World } from './world';

/** How fast their jets turn, rad/s, and the share of it a heavy bomber manages. */
const TURN = 1.7;
const HEAVY_TURN = 0.75;

export type AirKind = 'fighter' | 'heli' | 'striker';

/**
 * What the enemy commander sent a jet to do: 'attack' fights our aircraft
 * and then whatever is near the front, 'sams' goes after our AA first.
 * Aircraft from the old waves have no orders.
 */
export type AirRole = 'attack' | 'sams';

/** An ordered fighter takes on our aircraft within this range; beyond it, our troops. */
const INTERCEPT_RANGE = 900;
/** Lowest an attack run may take a jet, and the height it waits at between runs. */
const RUN_FLOOR = 38;
/** Heavy bombers: how far past the target they fly before turning back, the stick they lay across it, and the gap between bombs. */
const BOMB_OVERRUN = 260;
const BOMB_STICK = 20;
const BOMB_GAP = 0.09;
const LOITER_ALT = 150;
/** Seconds a jet runs out and climbs after a pass before it comes round again. */
const EXTEND_TIME = 3;
/** Our units an attack jet goes for first, most wanted first. */
const PREY_WEIGHT: Partial<Record<UnitKind, number>> = {
	spaag: 0.35,
	manpads: 0.45,
	rocketTruck: 0.7,
	tank: 0.75,
	tankDestroyer: 0.75,
	ifv: 0.8,
	lightTank: 0.8
};

/** How far ahead of the friendly spearhead a gunship hovers, and how far its rockets reach. */
const ROCKET_STANDOFF = 220;
const ROCKET_REACH = 420;

const CRASH: BlastSpec = {
	radius: 14,
	damage: 140,
	pierce: 0.6,
	crater: [5, 1.5],
	size: 1.3,
	shake: 0.4
};

/** Enemy aircraft: interceptors that dogfight the player and gunship helicopters. */
export class AirUnit implements Trackable {
	readonly id: number;
	readonly kind: AirKind;
	x: number;
	y: number;
	z = 0;
	/** Turn away from the road, only during a heavy bomber's flat turn. */
	yaw = 0;
	private readonly flat = new FlatTurn();
	vx = 0;
	vy = 0;
	angle: number;
	roll = 0;
	rotor = 0;
	tilt = 0;
	alive = true;
	dying = false;
	dead = false;
	hp: number;
	readonly maxHp: number;
	readonly radius: number;
	readonly score: number;
	heat = 1.6;
	flash = 0;
	/** The enemy commander's order for it, or null for a wave aircraft. */
	role: AirRole | null = null;
	/** Where an ordered jet hangs about while it has nothing to hit (the front). */
	patrol = 0;
	private prey: Unit | null = null;
	private rescan = 0;
	private state: 'attack' | 'extend' = 'attack';
	private stateTime = 0;
	private gunCd = 1;
	private burst = 0;
	private missileCd: number;
	private trail = 0;
	private spinRate = 0;
	private rocketCd = 3;
	/** Heavy bombers: seconds to the next bomb, and which way the run goes. */
	private bombCd = 0;
	private runDir: 1 | -1 = -1;
	/** Pops flares at our missiles chasing it, when it sees them in time. */
	private readonly drill = new FlareDrill();
	/** Fly-speed factor for the airframe against the stock one for its kind. */
	private readonly pace: number;

	constructor(
		id: number,
		kind: AirKind,
		x: number,
		y: number,
		/** The enemy commander's pick of airframe (drawn and named as it); null for the stock one. */
		readonly airframe: AircraftId | null = null
	) {
		this.id = id;
		this.kind = kind;
		this.x = x;
		this.y = y;
		this.angle = Math.PI;
		// A sturdier or faster airframe than the stock one for its kind keeps the difference.
		const stock = AIRCRAFT[STOCK[kind]];
		const own = airframe ? AIRCRAFT[airframe] : stock;
		const toughness = clamp(own.hp / stock.hp, 0.6, 2.6);
		this.pace = clamp(own.cruise / stock.cruise, 0.75, 1.15);
		const base = kind === 'fighter' ? 70 : kind === 'striker' ? 110 : 95;
		this.hp = this.maxHp = Math.round(base * toughness);
		this.radius = kind === 'heli' ? 5.5 : 6;
		this.score = kind === 'fighter' ? 300 : kind === 'striker' ? 280 : 220;
		this.missileCd = rnd.range(8, 14);
		const sp = kind === 'heli' ? 22 : 85;
		this.vx = -sp;
		this.roll = Math.PI;
	}

	damage(w: World, amount: number, by: Owner): void {
		if (!this.alive || this.dying) return;
		this.hp -= amount;
		this.flash = 1;
		if (this.hp > 0) return;
		this.dying = true;
		this.spinRate = rnd.sign() * rnd.range(2, 4);
		w.fx.explosion(this.x, this.y, this.z, 0.6, false);
		w.sound.boom(0.75, this.x, this.y, true);
		const name = this.airframe ? AIRCRAFT[this.airframe].name : AIR_NAME[this.kind];
		w.events.kill(name, this.score, this.x, this.y + 6, by);
	}

	update(w: World, dt: number): void {
		this.flash = Math.max(0, this.flash - dt * 4);
		this.rotor += dt * 32;
		if (this.dying) return this.fall(w, dt);
		if (this.kind === 'heli') this.hover(w, dt);
		else this.fly(w, dt);
		this.drill.update(w, dt, this, 'player');
	}

	private fly(w: World, dt: number): void {
		// The attack jet leaves our aircraft alone: it is after the ground.
		const p = this.kind === 'striker' ? null : nearestFriendly(w, this.x, this.y);
		this.stateTime += dt;
		this.gunCd -= dt;
		this.missileCd -= dt;
		this.rocketCd -= dt;
		const ground = w.surface.clearance(this.x);
		const engage = !!p && (!this.role || Math.hypot(p.x - this.x, p.y - this.y) < INTERCEPT_RANGE);
		let target: number;
		let floor = 70;
		if (p && engage) target = this.dogfight(w, p);
		else if (this.role) {
			target = this.attackRun(w, dt);
			floor = RUN_FLOOR;
		} else target = this.x > 1200 ? Math.PI : 0;
		const speed = (this.kind === 'striker' ? 80 : 88) * this.pace;
		const agl = this.y - ground;
		if (agl < floor + pullUpRoom(this.angle, speed, TURN))
			target =
				0.9 * (Math.cos(this.angle) >= 0 ? 1 : -1) + (Math.cos(this.angle) >= 0 ? 0 : Math.PI);
		if (this.y > WORLD.ceiling - 40) target = Math.cos(this.angle) >= 0 ? -0.4 : Math.PI + 0.4;
		if (this.x < WORLD.arenaMinX + 80) target = 0.3;
		if (this.x > WORLD.arenaMaxX + 80) target = Math.PI - 0.3;
		// Heavy bombers turn round flat and level; everything else turns in the battle plane.
		const heavy = !!this.airframe && TACTICS[this.airframe] === 'bomber';
		if (heavy && (this.flat.active || this.flat.wants(this.angle, target, agl))) {
			if (!this.flat.active) this.flat.start(this);
			this.flat.step(this, speed, TURN * HEAVY_TURN, dt);
		} else {
			const low = agl < (2 * speed) / TURN + floor;
			const turn = safeTurn(this.angle, target, low);
			this.angle = wrapAngle(this.angle + clamp(turn, -TURN * dt, TURN * dt));
			this.vx = Math.cos(this.angle) * speed;
			this.vy = Math.sin(this.angle) * speed;
			this.x += this.vx * dt;
			this.y += this.vy * dt;
			this.z = moveToward(this.z, 0, 20 * dt);
			// Never through the ground: skim it and level off.
			const skim = w.surface.clearance(this.x) + 2;
			if (this.y < skim) {
				this.y = skim;
				this.angle = levelOff(this.angle);
				this.vx = Math.cos(this.angle) * speed;
				this.vy = Math.sin(this.angle) * speed;
			}
			const c = Math.cos(this.angle);
			this.roll = moveToward(this.roll, c > 0.15 ? 0 : c < -0.15 ? Math.PI : this.roll, dt * 3.5);
		}
		this.trail += dt;
		if (this.trail > 0.03) {
			this.trail = 0;
			// Out of the tail, whichever way it points (flat turns included).
			const c = this.vx / Math.max(1, Math.hypot(this.vx, this.vy));
			const sn = this.vy / Math.max(1, Math.hypot(this.vx, this.vy));
			w.fx.exhaust(this.x - c * 6, this.y - sn * 6, this.z, c, sn, 0.4, this.vx, this.vy);
			if (this.hp < this.maxHp * 0.5) w.fx.trail(this.x, this.y, 0, 1, 0.08, 0.7, 2, 0.2);
		}
	}

	/** Heading to fight one of our aircraft: guns close in, a heat seeker from further out. */
	private dogfight(w: World, p: Player | AirAlly): number {
		const dx = p.x - this.x,
			dy = p.y - this.y;
		const dist = Math.hypot(dx, dy);
		if (this.state === 'extend') {
			if (this.stateTime > rnd.range(2.2, 3.4)) this.state = 'attack';
			return this.angle + angleDiff(this.angle, Math.atan2(-dy, -dx)) * 0.4;
		}
		const t = dist / 600;
		const aim = Math.atan2(p.y + p.vy * t - this.y, p.x + p.vx * t - this.x);
		const err = Math.abs(angleDiff(this.angle, aim));
		if (err < 0.13 && dist < 430) this.guns(w);
		if (err < 0.45 && dist > 260 && dist < 720 * w.weather.irScale() && this.missileCd <= 0) {
			this.missileCd = rnd.range(11, 16);
			launchMissile(w, {
				kind: 'air',
				x: this.x,
				y: this.y - 1,
				z: 0,
				angle: this.angle,
				speed: 90,
				maxSpeed: 230,
				accel: 200,
				turnRate: 2.4,
				target: p,
				burn: 2.6,
				life: 6,
				damage: 30,
				owner: 'enemy',
				seeker: 'heat'
			});
			if (w.pilots().includes(p as Player)) w.events.message('MISSILE LAUNCH', '', 'warn');
		}
		if (dist < 110) {
			this.state = 'extend';
			this.stateTime = 0;
		}
		return aim;
	}

	/**
	 * Heading for a pass at our troops: wait over the front at height, dive on
	 * the chosen unit with guns (and rockets from the attack jet), then pull
	 * off, climb out and come round again.
	 */
	private attackRun(w: World, dt: number): number {
		this.rescan -= dt;
		if (!this.prey?.alive || this.rescan <= 0) {
			this.prey = pickPrey(w, this);
			this.rescan = 4;
		}
		const dir = Math.cos(this.angle) >= 0 ? 1 : -1;
		const level = (h: number): number => clamp((h - this.y) * 0.012, -0.35, 0.35);
		const u = this.prey;
		if (!u) {
			// Nothing to hit: hold over the front, turning back at each end of the beat.
			const head = this.x < this.patrol - 250 ? 1 : this.x > this.patrol + 250 ? -1 : dir;
			// Heavy bombers hold at their bombing height, everything else lower down.
			const hold =
				this.airframe && TACTICS[this.airframe] === 'bomber'
					? bomberAltitude(this.airframe)
					: LOITER_ALT;
			const pitch = level(Math.min(w.surface.clearance(this.x) + hold, WORLD.ceiling - 60));
			return head > 0 ? pitch : Math.PI - pitch;
		}
		if (this.airframe && TACTICS[this.airframe] === 'bomber') return this.bombRun(w, dt, u);
		const dx = u.x - this.x;
		const dy = u.y + u.def.half[1] - this.y;
		if (this.state === 'extend') {
			if (this.stateTime > EXTEND_TIME) {
				this.state = 'attack';
				this.stateTime = 0;
			}
			return dir > 0 ? 0.4 : Math.PI - 0.4;
		}
		const dist = Math.hypot(dx, dy);
		// Overshot: run on until there is room to turn and dive again.
		if (dx * dir < 0 && Math.abs(dx) < 320) return dir > 0 ? 0.15 : Math.PI - 0.15;
		// Still far out: close at height, then tip into the dive.
		if (Math.abs(dx) > 700) {
			const pitch = level(w.surface.clearance(this.x) + LOITER_ALT);
			return dx > 0 ? pitch : Math.PI - pitch;
		}
		const tof = dist / 640;
		const aim = Math.atan2(dy, dx + u.speed * u.dir * tof);
		const err = Math.abs(angleDiff(this.angle, aim));
		if (err < 0.12 && dist < 480) this.guns(w);
		if (this.kind === 'striker' && err < 0.2 && dist < 560 && this.rocketCd <= 0)
			this.rockets(w, u);
		if (dist < 150 || this.y - w.surface.clearance(this.x) < RUN_FLOOR + 6) {
			this.state = 'extend';
			this.stateTime = 0;
		}
		return aim;
	}

	/**
	 * A heavy bomber never dives: it runs level across the target at height,
	 * laying bombs while they would land on it, then flies on and turns back.
	 */
	private bombRun(w: World, dt: number, u: Unit): number {
		const alt = Math.min(
			Math.max(w.ground(u.x), w.surface.clearance(this.x)) + bomberAltitude(this.airframe!),
			WORLD.ceiling - 60
		);
		const pitch = clamp((alt - this.y) * 0.012, -0.3, 0.3);
		const dx = u.x - this.x;
		if (dx * this.runDir < -BOMB_OVERRUN) this.runDir = this.runDir > 0 ? -1 : 1;
		this.bombCd -= dt;
		if (this.bombCd <= 0) {
			const hit = predictImpact(w, this.x, this.y - 2, this.vx, this.vy, BOMBS.gp.drag, null);
			// Where the target will be when the bombs come down, with a stick straddling it.
			const aimX = u.x + u.speed * u.dir * hit.t;
			const along = (hit.x - aimX) * Math.sign(this.vx || 1);
			if (along > -BOMB_STICK && along < BOMB_STICK) {
				this.bombCd = BOMB_GAP;
				dropBomb(w, BOMBS.gp, this.x, this.y - 2, 0, this.vx, this.vy, this.angle).owner = 'enemy';
			}
		}
		return this.runDir > 0 ? pitch : Math.PI - pitch;
	}

	/** A pair of rockets at a ground unit, led by their time of flight. */
	private rockets(w: World, u: Unit): void {
		this.rocketCd = rnd.range(2.6, 3.6);
		for (let i = 0; i < 2; i++) {
			const tof = Math.hypot(u.x - this.x, u.y - this.y) / 190;
			const tx = u.x + u.speed * u.dir * tof + rnd.gauss(3);
			const a = Math.atan2(u.y + 0.5 - this.y, tx - this.x) + rnd.gauss(0.01);
			w.shells.push({
				kind: 'rocket',
				x: this.x,
				y: this.y - 1 - i,
				z: i ? 1.6 : -1.6,
				vx: Math.cos(a) * 190,
				vy: Math.sin(a) * 190,
				age: 0,
				fuse: Infinity,
				damage: 12,
				radius: 6,
				owner: 'enemy',
				trail: 0
			});
		}
		w.sound.play('missileLaunch', this.x, this.y, 0.5, 1.5);
	}

	private guns(w: World): void {
		if (this.gunCd > 0) return;
		if (this.burst <= 0) {
			this.burst = 8;
		}
		this.burst--;
		this.gunCd = this.burst > 0 ? 0.07 : rnd.range(0.8, 1.4);
		const a = this.angle + rnd.gauss(0.03);
		const mx = this.x + Math.cos(this.angle) * 5,
			my = this.y + Math.sin(this.angle) * 5;
		spawnBullet(w, {
			x: mx,
			y: my,
			z: 0,
			vx: Math.cos(a) * 640 + this.vx,
			vy: Math.sin(a) * 640 + this.vy,
			life: 1.2,
			damage: 3.2,
			pierce: 0,
			owner: 'enemy',
			tracer: true,
			color: [12, 3, 1.5],
			size: 0.2,
			explosive: 0
		});
		w.fx.muzzleFlash(mx, my, 0, Math.cos(a), Math.sin(a), 0.9, [12, 5, 2]);
		w.sound.play('mg', mx, my, 0.4, 1.3);
	}

	/** Their other helicopters in the air. */
	private *otherHelos(w: World): Generator<AirUnit> {
		for (const a of w.air) if (a !== this && a.alive && !a.dying && a.kind === 'heli') yield a;
	}

	private hover(w: World, dt: number): void {
		const p = nearestFriendly(w, this.x, this.y);
		this.gunCd -= dt;
		this.rocketCd -= dt;
		const ground = w.surface.clearance(this.x);
		const near = p ? Math.hypot(p.x - this.x, p.y - this.y) : Infinity;
		// Gunships hunt the friendly army's spearhead; with none on the road they hold off the airfield.
		const prey = w.allies.spearhead();
		const station = prey ? prey.x + ROCKET_STANDOFF : WORLD.baseMaxX + 520;
		const onStation = this.x < station;
		let wantVx = onStation ? 0 : -24;
		if (near < 420) wantVx *= 0.3;
		// Keep clear of the other gunships, which hold the same station.
		const [sx, sy] = spread<AirUnit>(this, this.otherHelos(w), (a) => a.id);
		wantVx += sx * 0.8;
		this.vx = damp(this.vx, wantVx, 0.8, dt);
		const wantY = ground + 46 + Math.sin(w.time * 0.7 + this.id) * 8 + sy;
		this.vy = damp(this.vy, (wantY - this.y) * 0.8, 1.5, dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.tilt = damp(this.tilt, this.vx * 0.012, 2, dt);
		if (p && near < 380 && this.gunCd <= 0) {
			this.gunCd = this.burst > 0 ? 0.09 : rnd.range(1.4, 2.2);
			this.burst = this.burst > 0 ? this.burst - 1 : 6;
			const t = near / 520;
			const a = Math.atan2(p.y + p.vy * t - this.y, p.x + p.vx * t - this.x) + rnd.gauss(0.04);
			spawnBullet(w, {
				x: this.x + 2.5,
				y: this.y + 1.2,
				z: 0,
				vx: Math.cos(a) * 520,
				vy: Math.sin(a) * 520,
				life: 1.4,
				damage: 2.4,
				pierce: 0,
				owner: 'enemy',
				tracer: true,
				color: [12, 4, 1.4],
				size: 0.18,
				explosive: 0
			});
			w.fx.muzzleFlash(this.x + 2.8, this.y + 1.2, 0, Math.cos(a), Math.sin(a), 0.8, [12, 5, 2]);
			w.sound.play('mg', this.x, this.y, 0.4, 1.1);
		}
		if (prey && this.rocketCd <= 0 && Math.abs(prey.x - this.x) < ROCKET_REACH) {
			// Rockets for the troops on the ground; bases are too hard a target from the air.
			this.rocketCd = rnd.range(2.5, 4);
			// Lead the target by the rockets' time of flight.
			const tof = Math.hypot(prey.x - this.x, prey.y - this.y) / 160;
			const tx = prey.x + prey.speed * prey.dir * tof + rnd.gauss(3);
			const a = Math.atan2(prey.y + 0.5 - this.y, tx - this.x);
			w.shells.push({
				kind: 'rocket',
				x: this.x,
				y: this.y + 1,
				z: 1.6,
				vx: Math.cos(a) * 160,
				vy: Math.sin(a) * 160,
				age: 0,
				fuse: Infinity,
				damage: 12,
				radius: 6,
				owner: 'enemy',
				trail: 0
			});
			w.sound.play('missileLaunch', this.x, this.y, 0.5, 1.6);
		}
		if (this.hp < this.maxHp * 0.5 && rnd.chance(dt * 15))
			w.fx.trail(this.x, this.y + 2.5, 0, 1, 0.07, 0.7, 2.5, 0.5);
	}

	private fall(w: World, dt: number): void {
		this.vy -= 14 * dt;
		this.vx *= Math.exp(-0.3 * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.kind === 'fighter') {
			this.angle += this.spinRate * 0.3 * dt;
			this.roll += this.spinRate * dt;
		} else {
			this.rotor += this.spinRate * dt;
			this.tilt += this.spinRate * 0.15 * dt;
		}
		this.trail += dt;
		if (this.trail > 0.025) {
			this.trail = 0;
			w.fx.trail(this.x, this.y, 0, 1.8, 0.03, 0.85, 4, 0.3);
			w.fx.flame(this.x, this.y, 0, 1.3, 1.1);
		}
		const g = w.surface.clearance(this.x);
		if (this.y > g + 1) return;
		this.alive = false;
		this.dead = true;
		explode(w, this.x, g, 0, CRASH, 'player', { playerScale: 0.5 });
		w.fires.add(this.x, g, 0, 1.6, 16, { radius: 2.5 });
	}
}

/** The airframe each kind stands for when the commander doesn't pick one. */
const STOCK: Record<AirKind, AircraftId> = { fighter: 'f16', heli: 'apache', striker: 'su25' };

const AIR_NAME: Record<AirKind, string> = {
	fighter: 'Interceptor',
	heli: 'Gunship',
	striker: 'Attack jet'
};

/**
 * The unit of ours an ordered jet goes for: near the front it was sent to,
 * with the attack jet weighting our AA (then armour) well ahead of the rest.
 */
function pickPrey(w: World, a: AirUnit): Unit | null {
	let best: Unit | null = null;
	let bestScore = 900;
	for (const u of w.allies.list) {
		if (!u.alive || !w.vision.seen('enemy', u)) continue;
		const weight = a.role === 'sams' ? (PREY_WEIGHT[u.def.kind] ?? 1) : 1;
		const score = Math.abs(u.x - a.patrol) * weight + (u.def.category === 'infantry' ? 40 : 0);
		if (score < bestScore) {
			bestScore = score;
			best = u;
		}
	}
	return best;
}

export function updateAir(w: World, dt: number): void {
	for (const a of w.air) a.update(w, dt);
	for (let i = w.air.length - 1; i >= 0; i--) if (w.air[i].dead) w.air.splice(i, 1);
}
