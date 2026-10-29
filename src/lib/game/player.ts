import { angleDiff, clamp, damp, moveToward, smoothstep, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import type { FollowTarget } from './camera';
import { explode } from './combat';
import {
	COMPONENT_INFO,
	COMPONENTS,
	WING_AGILITY_LOSS,
	WING_PULL,
	bayJams,
	engineFactor,
	noDamage,
	repairSystems,
	rollComponentHit,
	type Component,
	type Systems
} from './damage';
import { WORLD } from './constants';
import { AIRCRAFT, type AircraftDef, type GunSpec } from './defs-aircraft';
import { isEmitterKind, pickEmitter } from './arm';
import {
	BOMBS,
	BOMB_ORDER,
	GUN_POD,
	LAUNCHED,
	POD_COOLING,
	POD_RESET,
	ROCKETS_PER_POD,
	ROCKET_SPEED,
	STICK_COUNT,
	STICK_GAP,
	type BlastSpec,
	type BombDef
} from './defs-bombs';
import {
	GEAR_HEIGHT,
	GROUND_PITCH,
	Gear,
	LIFTOFF_PITCH,
	ROLLING_DRAG,
	WHEEL_BRAKE,
	groundPitch,
	releasesBrakes,
	rotationSpeed
} from './gear';
import { launchSpecial } from './specials';
import { launchMissile, spawnBullet, type Flare } from './projectiles';
import { trackUnit } from './targeting';
import type { AircraftId, BombId, Designation, Trackable } from './types';
import type { Loadout } from './loadout';
import { upgradedDef, type UpgradeLevels } from './progression';
import { dropBomb, predictImpact } from './weapons';
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
	/** Gear up / down toggle, set only on the frame it is pressed. */
	gear: boolean;
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
	designate: null,
	gear: false
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
/** Boost adds this many times the speed over cruise it used to (about doubling the top speed). */
export const BOOST_GAIN = 2;

/**
 * Extra thrust while boosting. Drag grows with the square of speed, so adding
 * BOOST_GAIN times the old speed gain takes more than BOOST_GAIN times the push:
 * this solves for the push that settles at the faster top speed.
 */
export function boostThrust(d: AircraftDef): number {
	const cruise = Math.sqrt((0.8 * d.thrust) / d.drag);
	const old = Math.sqrt((d.thrust + d.boost) / d.drag);
	const top = cruise + (old - cruise) * BOOST_GAIN;
	return d.drag * top * top - d.thrust;
}

/** Flares rippled out per press (one counts against the dispenser load). */
const FLARES_PER_SALVO = 8;
/** Ordnance the airfield cannot restock: it comes back once, at the start of each wave. */
const WAVE_ONLY: ReadonlySet<BombId> = new Set<BombId>(['nuke']);
const FOCUS_AGILITY = 2.3;
/** Gunship orbit: radius across the screen, depth into it, bank, climb rate and altitude band. */
export const ORBIT_R = 80;
const ORBIT_RZ = 30;
const ORBIT_BANK = 0.5;
const ORBIT_CLIMB = 24;
export const ORBIT_MIN = 35;
const ORBIT_START = 130;
/** Helicopter: climb rate, skid height, the sink and roll speeds a touchdown survives, pedal turn rate. */
const HELI_CLIMB = 26;
const HELI_SKIDS = 1.7;
export const HELI_SAFE_SINK = 9;
const HELI_SAFE_ROLL = 26;
const HELI_YAW_RATE = 5;
/** How far off the nose the chin turret can swing. */
const HELI_GUN_ARC = 1.3;
/** Furthest a turret gun picks a target on its own when nothing is designated. */
const AUTO_AIM_RANGE = 450;
/** Dive bombing: how steep counts as a dive, and how far the release may be corrected. */
const DIVE_SIN = 0.5;
const DIVE_CORRECTION = 0.35;
/** Leaving the combat area: seconds of grace, then armour lost per second (the turn-back does the real work). */
export const BOUNDS_GRACE = 8;
const BOUNDS_DAMAGE = 2;
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
	/** Turn about the vertical axis: the gunship's orbit heading, a helicopter's pedal turn. */
	yaw = 0;
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
	/** Gun pod: its own heat budget, separate from the built-in guns. */
	podHeat = 0;
	podOverheated = false;
	podFiring = false;
	private podTimer = 0;
	private podShot = 0;
	/** Rockets still to leave the pods in the current ripple, and the rail they leave from. */
	private rocketQueue = 0;
	private rocketGap = 0;
	/** Stick bombs still to leave the bay, and the time to the next one. */
	private stickQueue = 0;
	private stickGap = 0;
	private rocketRail = 0;
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
	/** Engine, wing and hydraulic damage (0..1 each); fixed only by landing. */
	readonly systems: Systems = noDamage();
	/** Which way a damaged wing pulls the nose (+1 up/anticlockwise, -1 down). */
	wingPull = 1;
	/** Seconds left on the "bay jammed" warning after a release sticks. */
	bayJammed = 0;
	landed = false;
	/** Undercarriage (fixed wing only); airborne aircraft start with it up. */
	readonly gear = new Gear();
	/** Has left the ground since it was parked (or was built in the air). */
	hasFlown = true;
	rearming = false;
	private rearmTimer = 0;
	outOfBounds = 0;
	ceiling = false;
	propSpin = 0;
	/** Dive siren level 0..1 (dive bombers only). */
	siren = 0;
	/** Gunship orbit: pivot on the ground track, height above it and position around it. */
	orbitX = Number.NaN;
	orbitAlt = ORBIT_START;
	private orbitPhase = 0;
	/** Which way a helicopter's nose points along the battlefield (+1 right, -1 left). */
	facing = 1;
	private heavyTimer = 0;
	private readonly view: FollowTarget = { x: 0, y: 0, vx: 0, vy: 0 };
	private tailTimer = 0;
	private trailTimer = 0;
	/** Enemy launchers currently locking (reset by the AI every frame). */
	lockedBy = 0;
	lockProgress = 0;
	/** Where each of those launchers sits and how far along its lock is (reset by the AI every frame). */
	readonly lockers: { x: number; y: number; progress: number }[] = [];

	/** What this sortie carries (the hangar may change it from stock). */
	readonly loadout: Loadout;

	constructor(
		id: AircraftId,
		x: number,
		y: number,
		angle = 0,
		loadout?: Loadout,
		upgrades?: UpgradeLevels
	) {
		this.def = upgradedDef(AIRCRAFT[id], upgrades);
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
		this.facing = Math.cos(angle) < 0 ? -1 : 1;
		if (this.flight === 'rotor') {
			this.vx = 0;
			this.vy = 0;
		}
	}

	/**
	 * Down at the airfield, where the ground crew can hand over another
	 * aircraft. The gunship can't land, so a low pass over the runway does.
	 */
	get canChangeAircraft(): boolean {
		return this.alive && this.rearming && (this.landed || this.flight === 'orbit');
	}

	get flight(): 'fixed' | 'rotor' | 'orbit' {
		return this.def.flight ?? 'fixed';
	}

	/** What the chase camera frames: the gunship's orbit pivot, otherwise the aircraft itself. */
	get cameraTarget(): FollowTarget {
		if (this.flight !== 'orbit' || Number.isNaN(this.orbitX) || !this.alive) return this;
		this.view.x = this.orbitX;
		this.view.y = this.y;
		this.view.vx = 0;
		this.view.vy = this.vy;
		return this.view;
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
		this.bayJammed = Math.max(0, this.bayJammed - dt);
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
		if (this.flight === 'orbit') this.orbit(dt, inp, w);
		else if (this.flight === 'rotor') this.hover(dt, inp, w);
		else {
			this.undercarriage(dt, inp, w);
			this.steer(dt, inp, w);
			this.fly(dt, inp, w);
		}
		if (!this.alive) return;
		this.guns(dt, inp, w);
		this.gunPod(dt, inp, w);
		this.ordnance(dt, inp, w);
		this.rippleRockets(dt, w);
		this.rippleStick(dt, w);
		this.launchers(dt, inp, w);
		this.countermeasures(dt, inp, w);
		this.rearm(dt, w);
		this.cosmetics(dt, w);
		if (this.def.tailGun) this.tailGunner(dt, w);
		const out = this.x < WORLD.arenaMinX || this.x > WORLD.arenaMaxX;
		this.outOfBounds = out ? this.outOfBounds + dt : 0;
		if (this.outOfBounds > BOUNDS_GRACE)
			this.hit(BOUNDS_DAMAGE * dt, w, this.x, this.y, true, 'bounds');
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
		if (side === 0) return inp;
		// A helicopter turns on the spot, so judge it by the stick rather than the nose.
		const inbound =
			this.flight === 'rotor' ? inp.steerX * side < -0.2 : Math.cos(this.angle) * side < -0.5;
		if (inbound) return inp;
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
			const maxRate = d.turnRate * agility * (1 - WING_AGILITY_LOSS * this.systems.wing);
			rate = clamp(diff * 5 * agility, -maxRate, maxRate) * authority * Math.min(1, mag);
		}
		// A shot-up wing keeps dragging the nose round; the pilot has to hold against it.
		if (!this.landed) rate += this.wingPull * WING_PULL * this.systems.wing * authority;
		this.angVel = damp(this.angVel, rate, 10, dt);
		this.angle = wrapAngle(this.angle + this.angVel * dt);
	}

	/** Boost meter and burner; airframes with an airbrake also deploy it. Returns whether it is out. */
	private power(dt: number, inp: PilotInput, w: World, airbrake: boolean): boolean {
		const wasBoosting = this.boosting;
		this.boosting = inp.boost && this.boostMeter > 0.02 && !this.landed;
		if (this.boosting && !wasBoosting) this.ignition = 1;
		// Afterburner spools up quickly and dies away a little slower.
		this.boostLevel = damp(this.boostLevel, this.boosting ? 1 : 0, this.boosting ? 7 : 4, dt);
		// About fourteen seconds of boost, back in about eight.
		this.boostMeter = clamp(this.boostMeter + (this.boosting ? -0.07 : 0.125) * dt, 0, 1);
		const braking = airbrake && inp.brake && !this.boosting && !this.landed;
		if (braking && this.brakeLevel < 0.05) w.sound.play('airbrake', this.x, this.y, 0.9);
		this.brakeLevel = damp(this.brakeLevel, braking ? 1 : 0, braking ? 6 : 4, dt);
		return braking;
	}

	/** Sits the aircraft on the runway where it is, wheels down and brakes on, ready to take off. */
	park(w: World): void {
		this.gear.extend();
		this.gear.parked = true;
		this.landed = true;
		this.hasFlown = false;
		this.vx = this.vy = this.angVel = this.bank = 0;
		this.angle = GROUND_PITCH;
		this.roll = this.rollTarget = 0;
		this.throttle = 0.3;
		this.y = w.surface.clearance(this.x) + GEAR_HEIGHT;
	}

	/** Gear lever and motor, and the wheel brakes that hold a parked aircraft. */
	private undercarriage(dt: number, inp: PilotInput, w: World): void {
		const g = this.gear;
		if (inp.gear) {
			const ev = g.toggle(this.landed);
			w.sound.play(ev === 'refused' ? 'empty' : 'gearMotor', this.x, this.y, 0.7);
		}
		if (g.update(dt)) w.sound.play('gearLock', this.x, this.y, 0.8);
		if (g.parked && releasesBrakes(inp)) g.parked = false;
	}

	private fly(dt: number, inp: PilotInput, w: World): void {
		const d = this.def;
		if (this.gear.parked) {
			// Brakes on: the engine idles and nothing moves until the pilot asks.
			this.throttle = damp(this.throttle, 0.3, 3, dt);
			this.vx = this.vy = this.angVel = 0;
			this.angle = Math.cos(this.angle) >= 0 ? GROUND_PITCH : Math.PI - GROUND_PITCH;
			this.y = w.surface.clearance(this.x) + GEAR_HEIGHT;
			return;
		}
		const braking = this.power(dt, inp, w, true);
		const wheelBrakes = this.landed && inp.brake;
		// Idle while braking, but keep enough power to hold the floor speed rather than sink into a stall.
		const slowEnough = this.speed < d.stallSpeed * BRAKE_FLOOR * 1.08;
		const idle = (braking && !slowEnough) || wheelBrakes;
		this.throttle = damp(this.throttle, idle ? 0.15 : this.boosting ? 1 : 0.8, idle ? 3 : 6, dt);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		const alt = this.y - WORLD.baseHeight;
		this.ceiling = alt > WORLD.ceiling - 20;
		const thin = 1 - smoothstep(WORLD.ceiling - 40, WORLD.ceiling + 60, alt) * 0.9;
		const accel =
			(d.thrust * this.throttle + (this.boosting ? boostThrust(d) : 0)) *
			thin *
			engineFactor(this.systems.engine);
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
		const drag = d.drag * this.gear.drag;
		this.vx -= this.vx * speed * drag * dt;
		this.vy -= this.vy * speed * drag * dt;
		// Airbrake: the reverse of boost. Bleeds speed hard, but holds you just above the stall.
		const floor = d.stallSpeed * BRAKE_FLOOR;
		if (this.brakeLevel > 0.01 && speed > floor) {
			const cut = Math.min(speed - floor, d.boost * BRAKE_POWER * this.brakeLevel * dt);
			this.vx -= (this.vx / speed) * cut;
			this.vy -= (this.vy / speed) * cut;
		}
		if (d.dive) this.diveBrake(dt, d.dive.limit);
		this.stalled = speed < d.stallSpeed && !this.landed;
		if (this.stalled)
			this.angle += angleDiff(this.angle, -Math.PI / 2) * (1 - speed / d.stallSpeed) * 1.8 * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		const g = w.surface.clearance(this.x);
		if (this.y - g < GEAR_HEIGHT) {
			if (!this.groundRoll(dt, inp, w, g)) return;
		} else {
			this.landed = false;
			this.hasFlown = true;
		}
		const c = Math.cos(this.angle);
		if (c > 0.2) this.rollTarget = 0;
		else if (c < -0.2) this.rollTarget = Math.PI;
		this.roll = moveToward(this.roll, this.rollTarget, dt * 3.4);
		this.bank = damp(this.bank, -this.angVel * 0.32 * (this.rollTarget > 1 ? -1 : 1), 6, dt);
	}

	/**
	 * Wheels on the runway: touchdown, the take-off and landing roll, wheel
	 * brakes and rotation. Anywhere else, too steep, or with the gear not
	 * locked down, it is a crash. Returns false if the aircraft crashed.
	 */
	private groundRoll(dt: number, inp: PilotInput, w: World, g: number): boolean {
		const onRunway = this.x > WORLD.runwayMinX && this.x < WORLD.runwayMaxX;
		const level = this.landed || (Math.abs(Math.sin(this.angle)) < 0.3 && this.vy > -11);
		if (!onRunway || !level) {
			this.crash(w);
			return false;
		}
		if (!this.landed && !this.gear.locked) {
			this.crash(w, 'BELLY LANDING', 'Lower the gear with B before touching down');
			return false;
		}
		if (!this.landed) touchdown(w, this, g);
		this.landed = true;
		this.y = g + GEAR_HEIGHT;
		const dir = Math.cos(this.angle) >= 0 ? 1 : -1;
		const raw = dir > 0 ? this.angle : wrapAngle(Math.PI - this.angle);
		// Not pulling: the nose settles back onto its wheel.
		const settle = Math.abs(this.angVel) < 0.3 ? Math.min(1, dt * 4) : 0;
		const speed = this.speed;
		const pitch = groundPitch(raw + (GROUND_PITCH - raw) * settle, speed, rotationSpeed(this.def));
		this.angle = dir > 0 ? pitch : Math.PI - pitch;
		// Glued to the runway until the nose is up at rotation speed.
		this.vy = pitch > LIFTOFF_PITCH ? Math.max(this.vy, 0) : 0;
		this.vx *= Math.exp(-ROLLING_DRAG * dt);
		if (inp.brake) this.vx = Math.sign(this.vx) * Math.max(0, Math.abs(this.vx) - WHEEL_BRAKE * dt);
		return true;
	}

	/**
	 * Dive brakes and siren: in a steep dive the brakes hold the speed at `limit`
	 * so the aim stays steady, and the siren winds up with the airspeed.
	 */
	private diveBrake(dt: number, limit: number): void {
		const steep = smoothstep(DIVE_SIN * 0.7, DIVE_SIN * 1.5, -Math.sin(this.angle));
		const speed = this.speed;
		const howl = steep * smoothstep(this.def.stallSpeed, limit * 0.9, speed);
		this.siren = damp(this.siren, howl, howl > this.siren ? 4 : 2, dt);
		if (steep < 0.5 || speed <= limit) return;
		const cut = Math.min(speed - limit, this.def.boost * BRAKE_POWER * 2 * steep * dt);
		this.vx -= (this.vx / speed) * cut;
		this.vy -= (this.vy / speed) * cut;
	}

	/**
	 * Gunship orbit: a fixed left-hand pylon turn around a pivot on the ground.
	 * Steering slides the pivot along the battlefield and moves the orbit up or
	 * down; the aircraft itself never needs flying, so it cannot stall or crash.
	 */
	private orbit(dt: number, inp: PilotInput, w: World): void {
		if (dt <= 0) return;
		const d = this.def;
		this.power(dt, inp, w, false);
		this.throttle = damp(this.throttle, this.boosting ? 1 : 0.8, 6, dt);
		if (Number.isNaN(this.orbitX)) {
			// Join the orbit at its near point, already heading the way the aircraft faces.
			this.orbitPhase = Math.cos(this.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
			this.orbitX = this.x;
			this.orbitAlt = Math.max(ORBIT_START, this.y - w.ground(this.x));
		}
		const sx = Math.abs(inp.steerX) > 0.2 ? inp.steerX : 0;
		const sy = Math.abs(inp.steerY) > 0.2 ? inp.steerY : 0;
		const slide =
			(d.cruise * 0.8 + (this.boosting ? d.boost * BOOST_GAIN : 0)) *
			engineFactor(this.systems.engine);
		this.orbitX = clamp(
			this.orbitX + sx * slide * dt,
			WORLD.arenaMinX + ORBIT_R,
			WORLD.arenaMaxX - ORBIT_R
		);
		this.orbitAlt = clamp(this.orbitAlt + sy * ORBIT_CLIMB * dt, ORBIT_MIN, WORLD.ceiling - 15);
		this.orbitPhase = wrapAngle(this.orbitPhase - (d.cruise / ORBIT_R) * dt);
		const x = this.orbitX + Math.cos(this.orbitPhase) * ORBIT_R;
		const z = Math.sin(this.orbitPhase) * ORBIT_RZ;
		const floor = w.surface.clearance(x) + ORBIT_MIN * 0.6;
		const wantY = Math.max(w.ground(this.orbitX) + this.orbitAlt, floor);
		const y = this.y + clamp(wantY - this.y, -ORBIT_CLIMB * dt, ORBIT_CLIMB * dt);
		const vz = (z - this.z) / dt;
		this.vx = (x - this.x) / dt;
		this.vy = (y - this.y) / dt;
		this.x = x;
		this.y = Math.max(y, floor);
		this.z = z;
		this.yaw = Math.atan2(-vz, this.vx);
		this.angle = clamp(Math.atan2(this.vy, Math.hypot(this.vx, vz)), -0.3, 0.3);
		this.angVel = 0;
		this.roll = this.rollTarget = 0;
		this.bank = damp(this.bank, -ORBIT_BANK, 2, dt);
		this.stalled = false;
		this.landed = false;
		this.ceiling = this.y - WORLD.baseHeight > WORLD.ceiling - 20;
	}

	/**
	 * Helicopter: the stick sets the velocity directly (forward speed and climb),
	 * with no stall. Letting go or braking hovers. It turns on the spot with the
	 * pedals and can set down anywhere if it touches down gently enough.
	 */
	private hover(dt: number, inp: PilotInput, w: World): void {
		const d = this.def;
		this.power(dt, inp, w, false);
		const hold = inp.brake;
		const sx = !hold && Math.abs(inp.steerX) > 0.2 ? inp.steerX : 0;
		const sy = !hold && Math.abs(inp.steerY) > 0.2 ? inp.steerY : 0;
		const top =
			(d.cruise + (this.boosting ? d.boost * BOOST_GAIN : 0)) * engineFactor(this.systems.engine);
		const alt = this.y - WORLD.baseHeight;
		const thin = 1 - smoothstep(WORLD.ceiling - 40, WORLD.ceiling + 60, alt);
		// Sitting on the skids it only moves off once the collective lifts it.
		const wantVx = this.landed && sy <= 0 ? 0 : clamp(sx, -1, 1) * top;
		// Ground cushion: the sink rate eases off near the ground, so holding down sets it down gently.
		const height = this.y - w.surface.clearance(this.x) - HELI_SKIDS;
		const wantVy = Math.max(
			clamp(sy, -1, 1) * HELI_CLIMB * (sy > 0 ? thin : 1) - (1 - thin) * 6,
			-3 - height * 1.2
		);
		this.vx = moveToward(this.vx, wantVx, d.thrust * dt);
		this.vy = moveToward(this.vy, wantVy, d.thrust * 0.9 * dt);
		const effort = Math.min(1, Math.hypot(this.vx / top, this.vy / HELI_CLIMB));
		this.throttle = damp(
			this.throttle,
			Math.min(1, 0.55 + effort * 0.3 + this.boostLevel * 0.15),
			4,
			dt
		);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (sx !== 0 && Math.sign(sx) !== this.facing) {
			// Pedal turn: flip the nose, and swing the model round from where it was.
			this.facing = -this.facing;
			this.yaw = wrapAngle(this.yaw - Math.PI);
		}
		this.yaw = moveToward(this.yaw, 0, HELI_YAW_RATE * dt);
		const level = this.facing > 0 ? 0 : Math.PI;
		// Nose down to fly forward, up to back off.
		this.angle = wrapAngle(
			level + clamp(-this.vx * 0.007, -0.32, 0.32) + this.vy * 0.003 * this.facing
		);
		this.angVel = 0;
		this.roll = this.rollTarget = level;
		this.bank = 0;
		this.stalled = false;
		this.ceiling = alt > WORLD.ceiling - 20;

		const g = w.surface.clearance(this.x);
		if (this.y - g < HELI_SKIDS) {
			const gentle = this.vy > -HELI_SAFE_SINK && Math.abs(this.vx) < HELI_SAFE_ROLL;
			if (!gentle && !this.landed) {
				this.crash(w);
				return;
			}
			this.landed = true;
			this.y = g + HELI_SKIDS;
			this.vy = Math.max(0, this.vy);
			this.vx *= Math.exp(-6 * dt);
		} else if (this.y - g > HELI_SKIDS + 0.4) {
			this.landed = false;
		}
	}

	/** Local hardpoint/muzzle offset to world space (applies roll, then pitch, then yaw). */
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
		const x2 = l[0] * ca - y1 * sa;
		const cy = Math.cos(this.yaw),
			sy = Math.sin(this.yaw);
		out[0] = this.x + (x2 * cy + z1 * sy) * s;
		out[1] = this.y + (l[0] * sa + y1 * ca) * s;
		out[2] = this.z + (z1 * cy - x2 * sy) * s;
		return out;
	}

	/**
	 * Where a turret or side gun shoots from `from`: the designated spot, or
	 * the nearest target it can bear on, or (with nothing about) its rest angle.
	 */
	aimPoint(w: World, inp: PilotInput, from: readonly number[]): [number, number] | null {
		const d = inp.designate;
		if (d && this.canBear(from, d.track.x, d.track.y)) return [d.track.x, d.track.y];
		let best: [number, number] | null = null;
		let bestD = AUTO_AIM_RANGE;
		const cx = this.flight === 'orbit' ? this.orbitX : from[0];
		for (const u of w.units) {
			if (!u.alive) continue;
			const ty = u.y + u.def.half[1];
			const dist = Math.hypot(u.x - cx, ty - from[1]);
			if (dist < bestD && this.canBear(from, u.x, ty)) {
				bestD = dist;
				best = [u.x, ty];
			}
		}
		return best;
	}

	private canBear(from: readonly number[], x: number, y: number): boolean {
		const a = Math.atan2(y - from[1], x - from[0]);
		if (this.flight === 'rotor') return Math.abs(angleDiff(this.angle, a)) < HELI_GUN_ARC;
		if (this.flight === 'orbit') return y < from[1];
		return true;
	}

	/** Barrel angle for a gun at `from`. Aimed guns track a target; fixed ones point down the nose. */
	private gunAngle(w: World, inp: PilotInput, from: readonly number[], aimed: boolean): number {
		if (!aimed) return this.angle;
		const t = this.aimPoint(w, inp, from);
		if (t) return Math.atan2(t[1] - from[1], t[0] - from[0]);
		if (this.flight === 'orbit')
			return Math.atan2(w.ground(this.orbitX) - from[1], this.orbitX - from[0]);
		return this.angle;
	}

	private guns(dt: number, inp: PilotInput, w: World): void {
		const gun = this.def.gun;
		if (!gun) {
			this.firing = false;
			return;
		}
		this.gunTimer -= dt;
		this.heavyTimer = Math.max(0, this.heavyTimer - dt);
		this.firing = inp.fire && !this.overheated && !this.landed;
		if (this.firing && gun.heavy && this.heavyTimer <= 0) {
			this.heavyTimer = gun.heavy.every;
			this.fireHeavy(w, inp, gun.heavy.muzzle, gun.heavy.speed);
		}
		if (!this.firing) this.gunHeat = Math.max(0, this.gunHeat - dt * (this.overheated ? 30 : 45));
		if (this.overheated && this.gunHeat < 25) this.overheated = false;
		if (!this.firing) {
			this.gunTimer = Math.max(this.gunTimer, 0);
			return;
		}
		while (this.gunTimer <= 0) {
			this.gunTimer += 1 / gun.rate;
			this.shoot(w, gun, this.shot++, inp);
			this.gunHeat += gun.heatPerShot;
			if (this.gunHeat >= 100) {
				this.overheated = true;
				w.sound.play('empty', this.x, this.y, 0.6);
				break;
			}
		}
	}

	/** Holding the bomb button with the gun pod selected hoses the heavy cannon. */
	private gunPod(dt: number, inp: PilotInput, w: World): void {
		this.podTimer -= dt;
		const wants = this.selected === 'gunpod' && (inp.bomb || inp.bombPressed);
		this.podFiring = wants && this.capacity('gunpod') > 0 && !this.podOverheated && !this.landed;
		if (!this.podFiring) {
			this.podHeat = Math.max(0, this.podHeat - dt * POD_COOLING);
			if (this.podOverheated && this.podHeat < POD_RESET) this.podOverheated = false;
			this.podTimer = Math.max(this.podTimer, 0);
			return;
		}
		while (this.podTimer <= 0) {
			this.podTimer += 1 / GUN_POD.rate;
			this.shoot(w, GUN_POD, this.podShot++);
			this.podHeat += GUN_POD.heatPerShot;
			if (this.podHeat >= 100) {
				this.podHeat = 100;
				this.podOverheated = true;
				w.sound.play('empty', this.x, this.y, 0.8);
				w.events.message('GUN POD OVERHEAT', 'Let the barrels cool', 'warn');
				break;
			}
		}
		// The recoil of a heavy cannon checks the aircraft's speed.
		const sp = this.speed;
		if (sp > this.def.stallSpeed * 1.2) {
			const k = 1 - Math.min(0.01, dt * 0.08);
			this.vx *= k;
			this.vy *= k;
		}
	}

	private shoot(w: World, gun: GunSpec, shot: number, inp: PilotInput = NO_INPUT): void {
		const m = this.localToWorld(gun.muzzles[shot % gun.muzzles.length]);
		const aim = this.gunAngle(w, inp, m, !!gun.aimed);
		const a = aim + rnd.gauss(gun.spread);
		// A turret leads for itself, so its rounds leave without the airframe's drift.
		const carry = gun.aimed ? 0 : 1;
		spawnBullet(w, {
			x: m[0],
			y: m[1],
			z: m[2],
			vx: Math.cos(a) * gun.speed + this.vx * carry,
			vy: Math.sin(a) * gun.speed + this.vy * carry,
			life: 1.25,
			damage: gun.damage,
			pierce: gun.pierce,
			owner: 'player',
			tracer: shot % gun.tracerEvery === 0,
			color: gun.color,
			size: gun.explosive > 0 ? 0.32 : 0.2,
			explosive: gun.explosive,
			aircraft: true
		});
		w.fx.muzzleFlash(
			m[0],
			m[1],
			m[2],
			Math.cos(aim),
			Math.sin(aim),
			gun.explosive > 0 ? 1.5 : 1,
			gun.color
		);
		w.sound.play(gun.explosive > 0 ? 'cannon' : 'gun', m[0], m[1], 0.5);
	}

	/** The gunship's howitzer: a heavy shell lobbed onto the aim point. */
	private fireHeavy(w: World, inp: PilotInput, muzzle: readonly number[], speed: number): void {
		const m = this.localToWorld(muzzle);
		const t = this.aimPoint(w, inp, m) ?? [this.orbitX, w.ground(this.orbitX)];
		const shell = BOMBS.gp;
		const a = solveAngle(
			w,
			m[0],
			m[1],
			speed,
			shell.drag,
			Math.atan2(t[1] - m[1], t[0] - m[0]),
			t[0],
			0.6
		);
		dropBomb(w, shell, m[0], m[1], m[2], Math.cos(a) * speed, Math.sin(a) * speed, a);
		w.fx.muzzleFlash(m[0], m[1], m[2], Math.cos(a), Math.sin(a), 3, [12, 7, 3]);
		w.fx.gunSmoke(m[0], m[1], m[2], 3);
		w.sound.play('tankGun', m[0], m[1], 0.9);
		w.camera.addTrauma(0.12);
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
		// The gun pod is a trigger, not a rack: gunPod() handles it.
		if (this.selected === 'gunpod') return;
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
		if (bayJams(this.systems.hydraulics, rnd)) {
			// Damaged hydraulics: the doors stick and the bomb stays on the rack.
			this.bayJammed = 1.2;
			this.bombTimer = 0.45;
			w.sound.play('empty', this.x, this.y, 0.8);
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
		if (def.id === 'rockets') {
			this.rocketQueue += ROCKETS_PER_POD;
			return;
		}
		if (def.id === 'arm') {
			this.launchArm(w, designate);
			return;
		}
		if (LAUNCHED.has(def.id)) {
			launchSpecial(w, this, def.id, designate);
			return;
		}
		if (def.id === 'stick') {
			this.stickQueue += STICK_COUNT - 1;
			this.stickGap = this.stickInterval();
		}
		this.dropFromBay(w, def, designate);
	}

	/** Seconds between stick bombs so they land STICK_GAP metres apart. */
	private stickInterval(): number {
		return STICK_GAP / Math.max(25, Math.abs(this.vx));
	}

	/** Lets the rest of a stick go, one at a time, so the bombs land in a line. */
	private rippleStick(dt: number, w: World): void {
		if (this.stickQueue <= 0) return;
		this.stickGap -= dt;
		if (this.stickGap > 0) return;
		this.stickGap = this.stickInterval();
		this.stickQueue--;
		this.dropFromBay(w, BOMBS.stick, null);
	}

	private dropFromBay(w: World, def: BombDef, designate: Designation | null): void {
		const hp = this.def.hardpoints;
		const local = hp.length > 0 ? hp[this.hardpoint++ % hp.length] : [0.5, -1.7, 0];
		const p = this.localToWorld(local);
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		const down = Math.cos(this.roll) >= 0 ? 1 : -1;
		const [vx, vy] = this.bombVelocity(
			w,
			def,
			p[0],
			p[1],
			designate,
			this.vx + sa * 2.5 * down,
			this.vy - ca * 2.5 * down
		);
		dropBomb(w, def, p[0], p[1], p[2], vx, vy, this.angle, designate);
	}

	/**
	 * How a bomb leaves the rack at (x, y): with the aircraft's own velocity,
	 * except that a dive bomber in a steep dive throws it down its line of
	 * sight so it falls true. The bomb sight uses this too.
	 */
	bombVelocity(
		w: World,
		def: BombDef,
		x: number,
		y: number,
		designate: Designation | null,
		vx = this.vx,
		vy = this.vy
	): [number, number] {
		if (!this.def.dive || def.id === 'guided' || -Math.sin(this.angle) < DIVE_SIN) return [vx, vy];
		const target = this.diveTarget(w, designate);
		if (target === null) return [vx, vy];
		const sp = Math.hypot(vx, vy);
		const a = solveAngle(w, x, y, sp, def.drag, Math.atan2(vy, vx), target, DIVE_CORRECTION);
		return [Math.cos(a) * sp, Math.sin(a) * sp];
	}

	/** Where a dive bomber's nose meets the ground, or the designated spot if it is close to that. */
	diveTarget(w: World, designate: Designation | null): number | null {
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		let nose: number | null = null;
		for (let s = 4; s < 900; s += 4) {
			const x = this.x + ca * s;
			if (this.y + sa * s <= w.ground(x)) {
				nose = x;
				break;
			}
		}
		if (nose === null) return null;
		if (designate && Math.abs(designate.x - nose) < 60) return designate.x;
		return nose;
	}

	/** Ripples the queued rockets off alternate pods, straight along the nose. */
	private rippleRockets(dt: number, w: World): void {
		if (this.rocketQueue <= 0) return;
		this.rocketGap -= dt;
		if (this.rocketGap > 0) return;
		this.rocketGap = 0.055;
		this.rocketQueue--;
		const side = this.rocketRail++ % 2 === 0 ? 1 : -1;
		const p = this.localToWorld([0.6, -1.1, 2.4 * side]);
		const a = this.angle + rnd.gauss(0.022);
		const ca = Math.cos(a),
			sa = Math.sin(a);
		w.shells.push({
			kind: 'ffar',
			x: p[0],
			y: p[1],
			z: p[2],
			vx: this.vx + ca * ROCKET_SPEED,
			vy: this.vy + sa * ROCKET_SPEED,
			age: 0,
			fuse: 0,
			damage: 0,
			radius: 0,
			owner: 'player',
			trail: 0
		});
		w.fx.muzzleFlash(p[0], p[1], p[2], ca, sa, 1.1, [12, 7, 3]);
		w.fx.gunSmoke(p[0], p[1], p[2], 1.4);
		w.sound.play('missileLaunch', p[0], p[1], 0.45);
	}

	/**
	 * Anti-radiation missile: rides the designated emitter or the strongest one
	 * ahead. With nothing radiating it flies out and keeps listening.
	 */
	private launchArm(w: World, designate: Designation | null): void {
		const u = designate?.unit;
		const emitter = u && isEmitterKind(u) ? u : pickEmitter(w, this.x, this.y, this.angle, false);
		const side = this.missileRail++ % 2 === 0 ? 1 : -1;
		const p = this.localToWorld([0.2, -1.0, 2.0 * side]);
		const dir = Math.cos(this.angle) >= 0 ? 1 : -1;
		const ca = Math.cos(this.angle),
			sa = Math.sin(this.angle);
		launchMissile(w, {
			kind: 'arm',
			x: p[0],
			y: p[1],
			z: p[2],
			angle: this.angle - 0.08 * dir,
			speed: Math.max(55, this.speed * 0.95),
			maxSpeed: 310,
			accel: 200,
			turnRate: 2.6,
			target: emitter ? trackUnit(emitter) : null,
			emitter,
			burn: 6,
			life: 14,
			damage: 0,
			owner: 'player',
			seeker: 'radar',
			blast: BOMBS.arm.blast
		});
		w.fx.muzzleFlash(p[0], p[1], p[2], ca, sa, 1.8, [6, 12, 9]);
		w.fx.gunSmoke(p[0], p[1], p[2], 2.6);
		w.events.message(
			'MAGNUM',
			emitter ? `Riding the ${emitter.def.name.toLowerCase()}` : 'No emitter: seeker listening',
			'info'
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

	/** Whether any system is still damaged. */
	get systemsDamaged(): boolean {
		return COMPONENTS.some((c) => this.systems[c] > 0);
	}

	/** Knocks out (or worsens) a system; announces it the first time it breaks. */
	damageSystem(c: Component, severity: number, w: World): void {
		const was = this.systems[c];
		this.systems[c] = Math.min(1, Math.max(was, severity));
		if (was > 0) return;
		if (c === 'wing') this.wingPull = rnd.sign();
		const info = COMPONENT_INFO[c];
		w.events.message(info.label, `${info.effect} · land to repair`, 'warn');
	}

	private rearm(dt: number, w: World): void {
		// Only a full stop on the runway lets the ground crew get at the airframe.
		const onRunway = this.x > WORLD.runwayMinX && this.x < WORLD.runwayMaxX;
		if (this.landed && onRunway && this.systemsDamaged && !repairSystems(this.systems, dt))
			w.events.message('SYSTEMS REPAIRED', 'Engine, wings and hydraulics working', 'good');
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
		const engine = this.systems.engine;
		if (engine > 0 && frac >= 0.5 && rnd.chance(0.35 + engine * 0.5)) {
			// A smoking engine, even when the armour is holding up.
			const p = this.localToWorld([-3, 0.3, 0]);
			w.fx.trail(p[0], p[1], p[2], 0.8 + engine * 0.6, 0.12, 0.45 + engine * 0.3, 2, 0.15);
		}
		if (this.systems.wing > 0 && rnd.chance(0.5)) {
			// Fuel and vapour streaming from the holed wing.
			const p = this.localToWorld([-1.5, 0, this.def.tip[2] * this.wingPull]);
			w.fx.trail(p[0], p[1], p[2], 0.3, 0.85, 0.3 * this.systems.wing + 0.1, 0.9, 0);
		}
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
		const tail = this.localToWorld(this.def.tailGunAt ?? [-11.6, 0.2, 0]);
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
		const broke = this.hp > 0 ? rollComponentHit(amount, this.def.hp, cause, rnd) : null;
		if (broke) this.damageSystem(broke.component, broke.severity, w);
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

	private crash(w: World, title = 'AIRCRAFT LOST', sub = ''): void {
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
		w.events.message(title, sub, 'warn');
	}
}

/** Tyre chirp and a puff of rubber smoke off each main wheel as they meet the runway. */
function touchdown(w: World, p: Player, g: number): void {
	const hard = Math.min(1, Math.max(0.3, -p.vy / 6));
	w.sound.play('tyre', p.x, g, 0.5 + hard * 0.5);
	const span = Math.min(p.def.radius * 0.3, 3);
	for (const s of [1, -1]) {
		for (let i = 0; i < 3; i++)
			w.fx.trail(p.x - i * 0.8, g + 0.3, span * s, 0.9 + hard * 0.6, 0.8, 0.45 * hard, 1.4, 0.25);
	}
}

/**
 * Nudges a launch angle (by at most `maxTurn`) so a ballistic round with this
 * speed and drag lands on world x `tx`: a few secant steps on the impact point.
 */
export function solveAngle(
	w: World,
	x: number,
	y: number,
	speed: number,
	drag: number,
	a0: number,
	tx: number,
	maxTurn: number
): number {
	const miss = (a: number): number =>
		predictImpact(w, x, y, Math.cos(a) * speed, Math.sin(a) * speed, drag, null).x - tx;
	let prevA = a0 + 0.02;
	let prevErr = miss(prevA);
	let a = a0;
	for (let i = 0; i < 5; i++) {
		const err = miss(a);
		if (Math.abs(err) < 0.4 || err === prevErr) break;
		const next = a - (err * (a - prevA)) / (err - prevErr);
		prevA = a;
		prevErr = err;
		a = clamp(next, a0 - maxTurn, a0 + maxTurn);
	}
	return a;
}
