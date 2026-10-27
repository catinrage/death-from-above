import { angleDiff, clamp, damp, moveToward, smoothstep, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode } from './combat';
import { WORLD } from './constants';
import { AIRCRAFT, type AircraftDef } from './defs-aircraft';
import { BOMBS, BOMB_ORDER, LAUNCHED, type BlastSpec } from './defs-bombs';
import { launchSpecial } from './specials';
import { launchMissile, spawnBullet, type Flare } from './projectiles';
import type { AircraftId, BombId, Designation, Trackable } from './types';
import type { Loadout } from './loadout';
import { dropBomb } from './weapons';
import type { World } from './world';

export interface PilotInput {
	/** Desired direction of flight (screen space). Zero vector = hold heading. */
	steerX: number;
	steerY: number;
	boost: boolean;
	brake: boolean;
	fire: boolean;
	bomb: boolean;
	bombPressed: boolean;
	flare: boolean;
	cycle: number;
	select: BombId | null;
	/** Targets for a missile salvo; set only on the frame the missile key is pressed. */
	missiles: Designation[] | null;
	/** Where a guided bomb released this frame should go (reticle / lock). */
	designate: Designation | null;
}

export const NO_INPUT: Readonly<PilotInput> = {
	steerX: 0,
	steerY: 0,
	boost: false,
	brake: false,
	fire: false,
	bomb: false,
	bombPressed: false,
	flare: false,
	cycle: 0,
	select: null,
	missiles: null,
	designate: null
};

const G = 11;
/** Warhead of the player's guided air-to-ground missile. */
const AGM_BLAST: BlastSpec = {
	radius: 10,
	damage: 260,
	pierce: 0.9,
	crater: [3.5, 1.1],
	size: 0.9,
	shake: 0.25
};
/** Focus mode sharpens handling so the aircraft keeps up with the pilot's aim. */
/** A fresh press may cut a held-repeat cooldown this short. */
const HOLD_GRACE = 0.12;
/** Field repairs: seconds untouched before they start, armour fraction they stop at, rate. */
export const REPAIR_DELAY = 5;
export const REPAIR_CAP = 0.6;
const REPAIR_RATE = 0.035;
/** Airbrake strength relative to the boost, and the stall margin it stops at. */
const BRAKE_POWER = 1.3;
export const BRAKE_FLOOR = 1.12;
/** Flares rippled out per press (one counts against the dispenser load). */
const FLARES_PER_SALVO = 8;
/** Ordnance the airfield cannot restock: it comes back once, at the start of each wave. */
const WAVE_ONLY: ReadonlySet<BombId> = new Set<BombId>(['nuke']);
const FOCUS_AGILITY = 2.3;
const CRASH_BLAST: BlastSpec = {
	radius: 16,
	damage: 160,
	pierce: 0.5,
	crater: [6, 2],
	size: 1.5,
	shake: 0.6
};

export class Player implements Trackable {
	readonly def: AircraftDef;
	x: number;
	y: number;
	z = 0;
	vx: number;
	vy: number;
	angle: number;
	angVel = 0;
	roll = 0;
	rollTarget = 0;
	bank = 0;
	alive = true;
	dying = false;
	crashed = false;
	deathTime = 0;
	hp: number;
	boostMeter = 1;
	boosting = false;
	/** Afterburner intensity 0..1, eased so the plume spools up and fades. */
	boostLevel = 0;
	/** Light-off flash when the burner kicks in. */
	ignition = 0;
	/** Airbrake deployment 0..1 (eased like the burner). */
	brakeLevel = 0;
	/** Seconds since the last hit (field repairs wait for this). */
	sinceHit = 0;
	throttle = 0.8;
	gunHeat = 0;
	overheated = false;
	firing = false;
	private gunTimer = 0;
	private shot = 0;
	readonly ammo: Record<BombId, number>;
	selected: BombId = 'gp';
	private bombTimer = 0;
	private regenTimer = 0;
	private hardpoint = 0;
	flares: number;
	missiles: number;
	/** Focus (slow motion) is active: handling is sharpened. */
	focus = false;
	private readonly missileQueue: Designation[] = [];
	private missileTimer = 0;
	private missileRail = 0;
	private flareTimer = 0;
	/** Flares still to leave the dispensers in the current salvo. */
	private flareQueue = 0;
	private flareGap = 0;
	private flareRegen = 0;
	invuln = 0;
	hitFlash = 0;
	damageDir = 0;
	stalled = false;
	landed = false;
	rearming = false;
	private rearmTimer = 0;
	outOfBounds = 0;
	ceiling = false;
	propSpin = 0;
	private tailTimer = 0;
	private trailTimer = 0;
	/** Enemy launchers currently locking (reset by the AI every frame). */
	lockedBy = 0;
	lockProgress = 0;
	/** Where each of those launchers sits and how far along its lock is (reset by the AI every frame). */
	readonly lockers: { x: number; y: number; progress: number }[] = [];

	/** What this sortie carries (the hangar may change it from stock). */
	readonly loadout: Loadout;

	constructor(id: AircraftId, x: number, y: number, angle = 0, loadout?: Loadout) {
		this.def = AIRCRAFT[id];
		this.loadout = loadout ?? this.def.loadout;
		this.x = x;
		this.y = y;
		this.angle = angle;
		this.vx = Math.cos(angle) * this.def.cruise;
		this.vy = Math.sin(angle) * this.def.cruise;
		this.hp = this.def.hp;
		this.flares = this.def.flares;
		this.missiles = this.def.missiles;
		this.ammo = Object.fromEntries(BOMB_ORDER.map((id) => [id, this.loadout[id] ?? 0])) as Record<
			BombId,
			number
		>;
		this.invuln = 2.5;
		this.rollTarget = this.roll = Math.cos(angle) < 0 ? Math.PI : 0;
	}

	get heat(): number {
		return this.boosting ? 2.5 : 1;
	}

	get speed(): number {
		return Math.hypot(this.vx, this.vy);
	}

	capacity(id: BombId): number {
		return this.loadout[id] ?? 0;
	}

	/** Ordnance this aircraft carries, in rack order (number keys pick from this). */
	get carried(): BombId[] {
		return BOMB_ORDER.filter((id) => this.capacity(id) > 0);
	}

	update(dt: number, inp: PilotInput, w: World): void {
		this.invuln = Math.max(0, this.invuln - dt);
		this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
		this.ignition = Math.max(0, this.ignition - dt * 4);
		this.sinceHit += dt;
		const cap = this.def.hp * REPAIR_CAP;
		if (this.alive && !this.dying && this.sinceHit > REPAIR_DELAY && this.hp < cap)
			this.hp = Math.min(cap, this.hp + this.def.hp * REPAIR_RATE * dt);
		this.propSpin += dt * (35 + this.throttle * 40);
		if (this.crashed) {
			this.deathTime += dt;
			return;
		}
		if (this.dying) {
			this.fall(dt, w);
			return;
		}
		inp = this.turnback(inp);
		this.steer(dt, inp, w);
		this.fly(dt, inp, w);
		if (!this.alive) return;
		this.guns(dt, inp, w);
		this.ordnance(dt, inp, w);
		this.launchers(dt, inp, w);
		this.countermeasures(dt, inp, w);
		this.rearm(dt, w);
		this.cosmetics(dt, w);
		if (this.def.tailGun) this.tailGunner(dt, w);
		const out = this.x < WORLD.arenaMinX || this.x > WORLD.arenaMaxX;
		this.outOfBounds = out ? this.outOfBounds + dt : 0;
		if (this.outOfBounds > 4) this.hit(10 * dt, w, this.x, this.y, true, 'bounds');
	}

	/** Side (+1 past the far edge, -1 past the near edge) if beyond the turn-back line, else 0. */
	private pastTurnback(): number {
		if (this.x > WORLD.arenaMaxX + WORLD.arenaTurnback) return 1;
		if (this.x < WORLD.arenaMinX - WORLD.arenaTurnback) return -1;
		return 0;
	}

	/**
	 * Well outside the combat area the aircraft swings itself around, so the
	 * player can never fly off to where the landscape runs out.
	 */
	private turnback(inp: PilotInput): PilotInput {
		const side = this.pastTurnback();
		if (side === 0 || Math.cos(this.angle) * side < -0.5) return inp;
		return { ...inp, steerX: -side, steerY: 0.2 };
	}

	private steer(dt: number, inp: PilotInput, w: World): void {
		const d = this.def;
		const speed = this.speed;
		const authority = clamp((speed - d.stallSpeed * 0.45) / (d.stallSpeed * 0.8), 0.25, 1);
		const mag = Math.hypot(inp.steerX, inp.steerY);
		let rate = 0;
		if (mag > 0.25) {
			const target = Math.atan2(inp.steerY, inp.steerX);
			let diff = angleDiff(this.angle, target);
			if (Math.abs(diff) > 2.6) {
				// Reversal: loop over the top unless we're scraping the ceiling.
				const noseUp = Math.cos(this.angle) >= 0 ? 1 : -1;
				const high = this.y - w.ground(this.x) > WORLD.ceiling - 90;
				diff = Math.abs(diff) * (high ? -noseUp : noseUp);
			}
			const agility = this.focus ? FOCUS_AGILITY : 1;
			const maxRate = d.turnRate * agility;
			rate = clamp(diff * 5 * agility, -maxRate, maxRate) * authority * Math.min(1, mag);
		}
		this.angVel = damp(this.angVel, rate, 10, dt);
		this.angle = wrapAngle(this.angle + this.angVel * dt);
	}

	private fly(dt: number, inp: PilotInput, w: World): void {
		const d = this.def;
		const wasBoosting = this.boosting;
		this.boosting = inp.boost && this.boostMeter > 0.02 && !this.landed;
		if (this.boosting && !wasBoosting) this.ignition = 1;
		// Afterburner spools up quickly and dies away a little slower.
		this.boostLevel = damp(this.boostLevel, this.boosting ? 1 : 0, this.boosting ? 7 : 4, dt);
		// About seven seconds of boost, back in about eight.
		this.boostMeter = clamp(this.boostMeter + (this.boosting ? -0.14 : 0.125) * dt, 0, 1);
		const braking = inp.brake && !this.boosting && !this.landed;
		if (braking && this.brakeLevel < 0.05) w.sound.play('airbrake', this.x, this.y, 0.9);
		this.brakeLevel = damp(this.brakeLevel, braking ? 1 : 0, braking ? 6 : 4, dt);
		// Idle while braking, but keep enough power to hold the floor speed rather than sink into a stall.
		const slowEnough = this.speed < d.stallSpeed * BRAKE_FLOOR * 1.08;
		const idle = braking && !slowEnough;
		this.throttle = damp(this.throttle, idle ? 0.15 : this.boosting ? 1 : 0.8, idle ? 3 : 6, dt);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		const alt = this.y - WORLD.baseHeight;
		this.ceiling = alt > WORLD.ceiling - 20;
		const thin = 1 - smoothstep(WORLD.ceiling - 40, WORLD.ceiling + 60, alt) * 0.9;
		const accel = (d.thrust * this.throttle + (this.boosting ? d.boost : 0)) * thin;
		this.vx += ca * accel * dt;
		this.vy += sa * accel * dt - G * dt;

		let speed = this.speed;
		if (speed > 1) {
			const velAng = Math.atan2(this.vy, this.vx);
			const stallK = smoothstep(d.stallSpeed * 0.7, d.stallSpeed * 1.05, speed);
			const liftAcc =
				G * Math.min((speed / d.cruise) ** 2, 1.3) * Math.abs(Math.cos(velAng)) * stallK;
			let nx = -this.vy / speed,
				ny = this.vx / speed;
			if (ny < 0) {
				nx = -nx;
				ny = -ny;
			}
			this.vx += nx * liftAcc * dt;
			this.vy += ny * liftAcc * dt;
			speed = this.speed;
			const va = Math.atan2(this.vy, this.vx);
			const rot = angleDiff(va, this.angle) * (1 - Math.exp(-d.lift * stallK * dt));
			const sp = speed * (1 - Math.abs(rot) * 0.12);
			this.vx = Math.cos(va + rot) * sp;
			this.vy = Math.sin(va + rot) * sp;
		}
		speed = this.speed;
		this.vx -= this.vx * speed * d.drag * dt;
		this.vy -= this.vy * speed * d.drag * dt;
		// Airbrake: the reverse of boost. Bleeds speed hard, but holds you just above the stall.
		const floor = d.stallSpeed * BRAKE_FLOOR;
		if (this.brakeLevel > 0.01 && speed > floor) {
			const cut = Math.min(speed - floor, d.boost * BRAKE_POWER * this.brakeLevel * dt);
			this.vx -= (this.vx / speed) * cut;
			this.vy -= (this.vy / speed) * cut;
		}
		this.stalled = speed < d.stallSpeed && !this.landed;
		if (this.stalled)
			this.angle += angleDiff(this.angle, -Math.PI / 2) * (1 - speed / d.stallSpeed) * 1.8 * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		const g = w.surface.clearance(this.x);
		const onRunway = this.x > WORLD.runwayMinX && this.x < WORLD.runwayMaxX;
		if (this.y - g < 1.7) {
			const level = Math.abs(Math.sin(this.angle)) < 0.3 && this.vy > -11;
			if (onRunway && level) {
				this.landed = true;
				this.y = g + 1.7;
				this.vy = Math.max(this.vy, 0);
				this.vx *= Math.exp(-0.35 * dt);
				const lvl = Math.cos(this.angle) >= 0 ? 0.03 : Math.PI - 0.03;
				this.angle +=
					angleDiff(this.angle, lvl) * Math.min(1, dt * 4) * (Math.abs(this.angVel) < 0.3 ? 1 : 0);
			} else {
				this.crash(w);
				return;
			}
		} else {
			this.landed = false;
		}
		const c = Math.cos(this.angle);
		if (c > 0.2) this.rollTarget = 0;
		else if (c < -0.2) this.rollTarget = Math.PI;
		this.roll = moveToward(this.roll, this.rollTarget, dt * 3.4);
		this.bank = damp(this.bank, -this.angVel * 0.32 * (this.rollTarget > 1 ? -1 : 1), 6, dt);
	}

	/** Local hardpoint/muzzle offset to world space (applies roll, then heading). */
	localToWorld(
		l: readonly number[],
		out: [number, number, number] = [0, 0, 0]
	): [number, number, number] {
		const s = this.def.scale;
		const r = this.roll + this.bank;
		const cr = Math.cos(r),
			sr = Math.sin(r);
		const y1 = l[1] * cr - l[2] * sr,
			z1 = l[1] * sr + l[2] * cr;
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		out[0] = this.x + (l[0] * ca - y1 * sa) * s;
		out[1] = this.y + (l[0] * sa + y1 * ca) * s;
		out[2] = this.z + z1 * s;
		return out;
	}

	private guns(dt: number, inp: PilotInput, w: World): void {
		const gun = this.def.gun;
		this.gunTimer -= dt;
		this.firing = inp.fire && !this.overheated && !this.landed;
		if (!this.firing) this.gunHeat = Math.max(0, this.gunHeat - dt * (this.overheated ? 30 : 45));
		if (this.overheated && this.gunHeat < 25) this.overheated = false;
		if (!this.firing) {
			this.gunTimer = Math.max(this.gunTimer, 0);
			return;
		}
		const m: [number, number, number] = [0, 0, 0];
		while (this.gunTimer <= 0) {
			this.gunTimer += 1 / gun.rate;
			const muzzle = gun.muzzles[this.shot % gun.muzzles.length];
			this.shot++;
			this.localToWorld(muzzle, m);
			const a = this.angle + rnd.gauss(gun.spread);
			spawnBullet(w, {
				x: m[0],
				y: m[1],
				z: m[2],
				vx: Math.cos(a) * gun.speed + this.vx,
				vy: Math.sin(a) * gun.speed + this.vy,
				life: 1.25,
				damage: gun.damage,
				pierce: gun.pierce,
				owner: 'player',
				tracer: this.shot % gun.tracerEvery === 0,
				color: gun.color,
				size: gun.explosive > 0 ? 0.32 : 0.2,
				explosive: gun.explosive
			});
			w.fx.muzzleFlash(
				m[0],
				m[1],
				m[2],
				Math.cos(this.angle),
				Math.sin(this.angle),
				gun.explosive > 0 ? 1.5 : 1,
				gun.color
			);
			w.sound.play(gun.explosive > 0 ? 'cannon' : 'gun', m[0], m[1], 0.5);
			this.gunHeat += gun.heatPerShot;
			if (this.gunHeat >= 100) {
				this.overheated = true;
				w.sound.play('empty', this.x, this.y, 0.6);
				break;
			}
		}
	}

	private ordnance(dt: number, inp: PilotInput, w: World): void {
		this.bombTimer -= dt;
		if (inp.select && inp.select !== this.selected && this.capacity(inp.select) > 0) {
			this.selected = inp.select;
			w.sound.play('select', this.x, this.y, 0.5);
		}
		if (inp.cycle !== 0) this.cycleBomb(inp.cycle, w);
		if (this.ammo.gp < this.capacity('gp')) {
			this.regenTimer += dt * (this.rearming ? 3 : 1);
			if (this.regenTimer >= this.def.regen) {
				this.regenTimer = 0;
				this.ammo.gp++;
			}
		} else {
			this.regenTimer = 0;
		}
		// One bomb per press; holding the button keeps them coming at the rack's pace.
		const wants = inp.bombPressed || inp.bomb;
		if (!wants || this.landed) return;
		if (this.bombTimer > 0 && !inp.bombPressed) return;
		if (this.bombTimer > HOLD_GRACE && inp.bombPressed) return;
		if (this.ammo[this.selected] <= 0) {
			if (inp.bombPressed) {
				w.sound.play('empty', this.x, this.y, 0.7);
				this.cycleBomb(1, w);
			}
			return;
		}
		this.releaseBomb(w, inp.designate);
		// Bombers ripple faster when the button is held.
		this.bombTimer = BOMBS[this.selected].cooldown / Math.max(1, this.def.salvo * 0.6);
	}

	private cycleBomb(dir: number, w: World): void {
		const rack = this.carried;
		const n = rack.length;
		let i = rack.indexOf(this.selected);
		for (let k = 0; k < n; k++) {
			i = (i + dir + n) % n;
			if (this.ammo[rack[i]] > 0) {
				this.selected = rack[i];
				w.sound.play('select', this.x, this.y, 0.5);
				return;
			}
		}
	}

	private releaseBomb(w: World, designate: Designation | null): void {
		const def = BOMBS[this.selected];
		this.ammo[this.selected]--;
		if (LAUNCHED.has(def.id)) {
			launchSpecial(w, this, def.id, designate);
			return;
		}
		const hp = this.def.hardpoints;
		const local = hp.length > 0 ? hp[this.hardpoint++ % hp.length] : [0.5, -1.7, 0];
		const p = this.localToWorld(local);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		const down = Math.cos(this.roll) >= 0 ? 1 : -1;
		dropBomb(
			w,
			def,
			p[0],
			p[1],
			p[2],
			this.vx + sa * 2.5 * down,
			this.vy - ca * 2.5 * down,
			this.angle,
			designate
		);
	}

	/** Missiles not yet committed to a salvo. */
	get missilesFree(): number {
		return this.missiles - this.missileQueue.length;
	}

	/** Whether a salvo still waiting on the rails is meant for this target. */
	hasQueued(track: Trackable): boolean {
		return this.missileQueue.some((d) => d.track === track);
	}

	/** Fires queued missiles one rail at a time so a salvo ripples off the wings. */
	private launchers(dt: number, inp: PilotInput, w: World): void {
		this.missileTimer -= dt;
		if (inp.missiles && inp.missiles.length > 0 && !this.landed) {
			// A second salvo joins the one still rippling off the rails.
			const room = this.missiles - this.missileQueue.length;
			if (room > 0) this.missileQueue.push(...inp.missiles.slice(0, room));
			else w.sound.play('empty', this.x, this.y, 0.7);
		}
		if (this.missileQueue.length === 0 || this.missileTimer > 0) return;
		const d = this.missileQueue.shift();
		if (!d || this.missiles <= 0) {
			this.missileQueue.length = 0;
			return;
		}
		this.missiles--;
		this.missileTimer = 0.07;
		const side = this.missileRail++ % 2 === 0 ? 1 : -1;
		const p = this.localToWorld([0.4, -0.8, 1.7 * side]);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		launchMissile(w, {
			kind: 'agm',
			x: p[0],
			y: p[1],
			z: p[2],
			angle: this.angle - 0.05 * Math.sign(ca || 1),
			speed: Math.max(55, this.speed * 0.95),
			maxSpeed: 300,
			accel: 260,
			turnRate: 4,
			target: d.track,
			burn: 3.4,
			life: 7.5,
			damage: 0,
			owner: 'player',
			seeker: 'radar',
			blast: AGM_BLAST
		});
		w.fx.muzzleFlash(p[0], p[1], p[2], ca, sa, 1.6, [10, 6, 3]);
		w.fx.gunSmoke(p[0], p[1], p[2], 2.2);
	}

	private countermeasures(dt: number, inp: PilotInput, w: World): void {
		this.flareTimer -= dt;
		if (this.flares < this.def.flares) {
			this.flareRegen += dt;
			if (this.flareRegen > 11) {
				this.flareRegen = 0;
				this.flares++;
			}
		}
		this.ejectFlares(dt, w);
		if (!inp.flare || this.flareTimer > 0 || this.flares <= 0) return;
		this.flares--;
		this.flareTimer = 1.0;
		this.flareQueue = FLARES_PER_SALVO;
		this.flareGap = 0;
	}

	/** Ripples a salvo out of the dispensers, alternating sides: the classic "angel wings". */
	private ejectFlares(dt: number, w: World): void {
		if (this.flareQueue <= 0) return;
		this.flareGap -= dt;
		if (this.flareGap > 0) return;
		this.flareGap = 0.07;
		const n = FLARES_PER_SALVO - this.flareQueue;
		this.flareQueue--;
		const side = n % 2 === 0 ? 1 : -1;
		const p = this.localToWorld([-2.5, -0.9, 0.9 * side]);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		// Kicked out and down from the belly, fanning wider each pair.
		const out = 9 + n * 2.2 + rnd.range(-2, 2);
		const f: Flare = {
			x: p[0],
			y: p[1],
			z: p[2],
			vx: this.vx * 0.8 - ca * 6 + sa * out * 0.4,
			vy: this.vy * 0.8 - sa * 6 - out * 0.9,
			vz: side * (5 + n * 1.4),
			alive: true,
			heat: 4,
			age: 0,
			life: rnd.range(2.8, 3.6)
		};
		w.flares.push(f);
		w.fx.muzzleFlash(p[0], p[1], p[2], -ca, -sa, 0.6, [12, 10, 7]);
		if (n % 2 === 0) w.sound.play('flare', this.x, this.y, 0.7);
	}

	private rearm(dt: number, w: World): void {
		const g = w.ground(this.x);
		this.rearming = this.x > WORLD.runwayMinX && this.x < WORLD.runwayMaxX && this.y - g < 48;
		if (!this.rearming) return;
		this.hp = Math.min(this.def.hp, this.hp + 16 * dt);
		this.rearmTimer += dt;
		if (this.rearmTimer < 0.9) return;
		this.rearmTimer = 0;
		if (this.flares < this.def.flares) this.flares++;
		if (this.missiles < this.def.missiles) this.missiles++;
		for (const id of BOMB_ORDER) {
			if (id !== 'gp' && !WAVE_ONLY.has(id) && this.ammo[id] < this.capacity(id)) {
				this.ammo[id]++;
				w.sound.play('rearm', this.x, this.y, 0.6);
				break;
			}
		}
	}

	/** A new wave: weapons that only restock between waves come back. */
	restockWave(): void {
		for (const id of WAVE_ONLY) this.ammo[id] = this.capacity(id);
	}

	/** Adds one special bomb (supply drop from a destroyed truck or depot). */
	resupply(): BombId | null {
		const options = BOMB_ORDER.filter(
			(id) =>
				id !== 'gp' && id !== 'thunder' && !WAVE_ONLY.has(id) && this.ammo[id] < this.capacity(id)
		);
		if (options.length === 0) return null;
		const id = options[Math.floor(Math.random() * options.length)];
		this.ammo[id]++;
		return id;
	}

	private cosmetics(dt: number, w: World): void {
		this.trailTimer += dt;
		if (this.trailTimer < 0.025) return;
		this.trailTimer = 0;
		const frac = this.hp / this.def.hp;
		if (frac < 0.5) {
			const p = this.localToWorld([-3, 0.3, 0]);
			const dark = frac < 0.25;
			w.fx.trail(
				p[0],
				p[1],
				p[2],
				dark ? 1.6 : 1.1,
				dark ? 0.04 : 0.25,
				dark ? 0.85 : 0.5,
				dark ? 3 : 2,
				0.2
			);
			if (dark && rnd.chance(0.6)) w.fx.ember(p[0], p[1], p[2]);
		}
		if (Math.abs(this.angVel) > 1.4 && this.speed > 70) {
			const span = this.def.tip[2];
			for (const s of [1, -1]) {
				const p = this.localToWorld([-2, 0, span * s]);
				w.fx.trail(p[0], p[1], p[2], 0.25, 0.9, 0.35, 0.7, 0);
			}
		}
	}

	private tailGunner(dt: number, w: World): void {
		this.tailTimer -= dt;
		if (this.tailTimer > 0) return;
		let best: Trackable | null = null;
		let bestD = 380;
		for (const a of w.air) {
			if (!a.alive) continue;
			const d = Math.hypot(a.x - this.x, a.y - this.y);
			if (d < bestD) {
				bestD = d;
				best = a;
			}
		}
		for (const m of w.missiles) {
			if (m.owner !== 'enemy' || !m.alive) continue;
			const d = Math.hypot(m.x - this.x, m.y - this.y);
			if (d < bestD) {
				bestD = d;
				best = m;
			}
		}
		if (!best) {
			this.tailTimer = 0.3;
			return;
		}
		this.tailTimer = 0.09;
		const tail = this.localToWorld([-11.6, 0.2, 0]);
		const t = bestD / 650;
		const a =
			Math.atan2(best.y + best.vy * t - tail[1], best.x + best.vx * t - tail[0]) + rnd.gauss(0.03);
		spawnBullet(w, {
			x: tail[0],
			y: tail[1],
			z: tail[2],
			vx: Math.cos(a) * 650 + this.vx,
			vy: Math.sin(a) * 650 + this.vy,
			life: 1,
			damage: 7,
			pierce: 0.1,
			owner: 'player',
			tracer: true,
			color: [10, 6, 2],
			size: 0.2,
			explosive: 0
		});
		w.fx.muzzleFlash(tail[0], tail[1], tail[2], Math.cos(a), Math.sin(a), 0.8, [10, 6, 2]);
		w.sound.play('gun', tail[0], tail[1], 0.35, 0.8);
	}

	hit(
		amount: number,
		w: World,
		fromX: number,
		fromY: number,
		ignoreInvuln = false,
		cause = 'misc'
	): void {
		if (!this.alive || this.dying || amount <= 0) return;
		if (this.invuln > 0 && !ignoreInvuln) return;
		this.hp -= amount;
		this.sinceHit = 0;
		w.damageTaken[cause] = (w.damageTaken[cause] ?? 0) + amount;
		this.hitFlash = 1;
		this.damageDir = Math.atan2(fromY - this.y, fromX - this.x);
		w.events.playerHit(amount);
		w.camera.addTrauma(Math.min(0.45, 0.06 + amount * 0.012));
		w.sound.play('hit', this.x, this.y, Math.min(1, 0.3 + amount * 0.03));
		if (this.hp <= 0) {
			this.hp = 0;
			this.dying = true;
			this.alive = false;
			this.angVel = rnd.sign() * 2.2;
			w.events.message('MAYDAY', 'Aircraft going down', 'warn');
			w.events.slowmo(0.4, 0.8);
			w.fx.explosion(this.x, this.y, 0, 0.7, false);
		}
	}

	private fall(dt: number, w: World): void {
		this.vy -= G * 1.2 * dt;
		this.vx *= Math.exp((this.pastTurnback() * this.vx > 0 ? -1.5 : -0.25) * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.angle += this.angVel * dt;
		this.roll += dt * 5;
		this.trailTimer += dt;
		if (this.trailTimer > 0.02) {
			this.trailTimer = 0;
			w.fx.trail(this.x, this.y, 0, 2, 0.03, 0.9, 4, 0.3);
			w.fx.flame(this.x, this.y, 0, 1.6, 1.2);
		}
		if (this.y <= w.surface.clearance(this.x) + 1) this.crash(w);
	}

	private crash(w: World): void {
		const g = Math.min(this.y, w.surface.clearance(this.x));
		this.alive = false;
		this.dying = false;
		this.crashed = true;
		this.deathTime = 0;
		this.hp = 0;
		explode(w, this.x, g, 0, CRASH_BLAST, 'player', { playerScale: 0 });
		w.fires.add(this.x, g, 0, 2, 20, { radius: 3 });
		w.sound.play('crash', this.x, g, 1.2);
		w.damageTaken.crash = (w.damageTaken.crash ?? 0) + 1;
		w.events.message('AIRCRAFT LOST', '', 'warn');
	}
}
