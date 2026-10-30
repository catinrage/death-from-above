import { angleDiff, clamp, damp, moveToward, wrapAngle } from '../engine/math';
import { fx as rnd } from '../engine/rng';
import { explode, inBattlePlane } from './combat';
import { WORLD } from './constants';
import { BOMBS, ROCKET_SPEED, ROCKETS_PER_POD, type BlastSpec } from './defs-bombs';
import type { AirUnit } from './enemy-air';
import type { Player } from './player';
import { FlareDrill, launchMissile, spawnBullet } from './projectiles';
import { trackUnit } from './targeting';
import { FlatTurn } from './flat-turn';
import { spread } from './spacing';
import { levelOff, pullUpRoom, safeTurn } from './terrain-floor';
import type { AircraftId, BombId, Trackable, Unit, UnitKind } from './types';
import { dropBomb, predictImpact } from './weapons';
import { bomberAltitude, rackCount, type WingProfile } from './wing-profile';
import type { World } from './world';

/** What the pilot last told the wingman to do. */
export type WingOrder = 'cover' | 'attack' | 'sams' | 'rearm';

/**
 * Anything flying on our side that enemy guns and missiles can go after: the
 * wingman, the commander's aircraft and their kamikaze drones.
 */
export interface AirAlly extends Trackable {
	/** Airborne and fighting (not falling). */
	readonly active: boolean;
	readonly landed: boolean;
	/** Size of the circle enemy fire has to cross to hit it. */
	readonly radius: number;
	hit(w: World, amount: number): void;
}

/** Who the wingman is fighting: one ground unit or one aircraft. */
export interface WingTarget {
	unit: Unit | null;
	air: AirUnit | null;
}

const CALLSIGN = 'TWO';
export const WING_HP = 90;
export const WING_MISSILES = 4;
/** Per-round gun damage (a little lighter than the player's guns). */
export const WING_GUN_DAMAGE = 4;
/** Air-to-air missile hit. */
export const WING_AAM_DAMAGE = 25;
/** Seconds over the runway to repair fully and refill every missile. */
export const WING_REARM_TIME = 4;
/** Seconds to regain one missile. */
const MISSILE_RELOAD = 9;
/** Enemy aircraft this close to the player are engaged while covering. */
const COVER_RADIUS = 650;
/** Formation slot behind and above the leader. */
const SLOT_BACK = 38;
const SLOT_UP = 14;
const CRUISE = 105;
const TURN_RATE = 1.9;
/** How far from the leader the wingman looks for targets of his own. */
const HUNT_RADIUS = 1400;
/** Seconds between looks for a better target while hunting freely. */
const RESCAN = 1.2;
/** Lining up this far beyond the runway end before the low pass. */
const RTB_LINEUP = 130;
/** Height and speed of the slow rearm pass over the runway. */
const PASS_ALT = 12;
const PASS_SPEED = 62;
/** A target must score this much better than the current one before the jet switches to it. */
const SWITCH_MARGIN = 0.6;
/** Infantry is what takes the checkpoints: weighed like any vehicle when picking a target. */
const INFANTRY_DANGER = 1;
/** How much the jet's own distance to a target counts, next to its distance from the front. */
const NEAR_WEIGHT = 0.3;
/** How far past the target a bomber flies before it comes round again. */
const BOMB_OVERRUN = 260;
/** With nothing to do, aircraft fly a level racetrack this far either side of their station. */
const RACETRACK = 220;
/** The gunship's and the drone's circle over the front: height, radius and depth. */
const ORBIT_ALT = 230;
const ORBIT_R = 190;
const DRONE_ALT = 300;
const DRONE_R = 240;
/** The circle's depth as a share of its width. */
const DEPTH = 0.3;
/** The helicopter hovers this far short of its target, this high. */
const HELO_STANDOFF = 240;
const HELO_ALT = 48;
/** Reach of the gunship's and the helicopter's aimed guns. */
const AIMED_RANGE = 520;
/** Commander's aircraft head home for repairs below this share of their hit points. */
const RTB_HP = 0.3;

/** The player's wingman: an F-16 with guns and a few missiles, no bombs. */
export const WING_PROFILE: WingProfile = {
	hp: WING_HP,
	cruise: CRUISE,
	turn: TURN_RATE,
	gun: WING_GUN_DAMAGE,
	aimed: false,
	explosive: 0,
	heavy: false,
	// The player's wingman never runs dry: its gun is unlimited and its missiles come back in the air.
	rounds: Infinity,
	shells: 0,
	missiles: WING_MISSILES,
	rack: {},
	rockets: 0,
	tactic: 'fighter'
};

/** Bombs worth dropping on armour, best first; anything else goes on soft targets. */
const ANTI_ARMOUR: readonly BombId[] = ['penetrator', 'guided', 'hunter', 'skip', 'tesla', 'cryo'];
const ANTI_SOFT: readonly BombId[] = ['cluster', 'napalm', 'frag', 'chemical', 'stick', 'mines'];

const HEAVY_SHELL = { damage: 70, radius: 7, every: 2.6, speed: 330 };

/** Air defences the wingman hunts on a "hit the SAMs" order, most dangerous first. */
const AIR_DEFENCE: Partial<Record<UnitKind, number>> = {
	sam: 0.45,
	cruiser: 0.5,
	radar: 0.6,
	spaag: 0.75,
	flak: 0.8,
	manpads: 1
};

export const AGM_BLAST: BlastSpec = {
	radius: 9,
	damage: 185,
	pierce: 0.85,
	crater: [3, 1],
	size: 0.8,
	shake: 0.2
};

const CRASH: BlastSpec = {
	radius: 12,
	damage: 120,
	pierce: 0.5,
	crater: [4, 1.2],
	size: 1.1,
	shake: 0.3
};

const isLiveTarget = (t: WingTarget | null): t is WingTarget =>
	!!t && (t.unit ? t.unit.alive : !!t.air && t.air.alive && !t.air.dying);

/**
 * A friendly AI fighter that flies with the player. By default it is on the
 * attack, picking the most dangerous target near the leader by itself; the
 * pilot can point it at a target (T), call it back to cover (G), send it after
 * the air defences (H) or home to repair and rearm (Y). Its kills count as the
 * player's. Shot down, it stays down until the next wave, when a replacement
 * climbs out from the airfield.
 */
export class Wingman implements AirAlly {
	x: number;
	y: number;
	z = 0;
	vx = 0;
	vy = 0;
	angle = 0.1;
	roll = 0;
	speed = CRUISE;
	hp = WING_HP;
	alive = true;
	dying = false;
	/** Never sits on the runway: lets ground gunners treat it like the player. */
	readonly landed = false;
	readonly radius = 3.6;
	heat = 1.4;
	flash = 0;
	order: WingOrder = 'attack';
	target: WingTarget | null = null;
	/** True when the pilot picked the target; otherwise the wingman chose it. */
	assigned = false;
	missiles: number;
	/** Bombs and rocket pods left (commander's aircraft; restocked on the runway). */
	readonly rack: Partial<Record<BombId, number>>;
	rockets: number;
	/** Gun rounds and howitzer shells left. */
	rounds: number;
	shells: number;
	readonly profile: WingProfile;
	/** Heading in the ground plane for aircraft that circle (gunship, drone); 0 flies along the road. */
	yaw = 0;
	/** Bombers swing round flat and level instead of looping over. */
	private readonly flat = new FlatTurn();
	/** Propeller and rotor angle. */
	spin = 0;
	/** Orders carried out so far (lets the tutorial notice a repeated order). */
	commands = 0;
	/** Replacements that have joined since the start (the radio announces each). */
	rejoins = 0;
	/** A replacement is due as soon as the falling wreck hits the ground. */
	private rejoinPending = false;
	/** Return to base: flying to the runway, or on the slow pass along it. */
	private rtb: 'inbound' | 'final' = 'inbound';
	/** Direction of the runway pass (+1 east, -1 west). */
	private passDir = -1;
	/** Down low over the runway: the usual ground-clearance floor is relaxed. */
	private lowPass = false;
	private rearmClock = 0;
	private scan = 0;
	/** Attack run or breaking away after one. */
	private phase: 'attack' | 'extend' = 'attack';
	private phaseTime = 0;
	private gunCd = 0;
	private burst = 0;
	private missileCd = 2;
	private reload = 0;
	/** Pops flares at missiles chasing it, when it sees them in time. */
	private readonly drill = new FlareDrill();
	private bombCd = 0;
	private rocketCd = 0;
	private rocketQueue = 0;
	private heavyCd = 0;
	/** Bomber: which way the current run crosses the target. */
	private runDir = 1;
	/** Gunship and drone: angle around the circle. */
	private orbit = 0;
	private rocketGap = 0;
	private orbiting = false;
	/** Why a commander's aircraft last turned for home. */
	homeFor: 'repair' | 'ammo' = 'ammo';
	/** Commander's aircraft go home on their own to repair and rearm. */
	private readonly autoRearm: boolean;
	private spinRate = 0;
	private trail = 0;
	/** One tracking adapter per ground target, so its inbound missiles can be recognised. */
	private tracked: { unit: Unit; track: Trackable } | null = null;
	/** Airframe it is drawn as. */
	readonly aircraft: AircraftId;
	/** Radio name for its calls; null keeps it off the radio (the commander's air units). */
	readonly callsign: string | null;
	/**
	 * With no leader to fly with: where along the road it hunts and orbits
	 * (null: over the airfield).
	 */
	patrol: number | null = null;

	constructor(
		x: number,
		y: number,
		opts: {
			aircraft?: AircraftId;
			callsign?: string | null;
			profile?: WingProfile;
			autoRearm?: boolean;
		} = {}
	) {
		this.x = x;
		this.y = y;
		this.aircraft = opts.aircraft ?? 'f16';
		this.callsign = opts.callsign === undefined ? CALLSIGN : opts.callsign;
		this.profile = opts.profile ?? WING_PROFILE;
		this.autoRearm = !!opts.autoRearm;
		this.hp = this.profile.hp;
		this.speed = this.profile.cruise;
		this.missiles = this.profile.missiles;
		this.rack = { ...this.profile.rack };
		this.rockets = this.profile.rockets;
		this.rounds = this.profile.rounds;
		this.shells = this.profile.shells;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
	}

	get tactic(): WingProfile['tactic'] {
		return this.profile.tactic;
	}

	/** Fully repaired and rearmed. */
	private get topped(): boolean {
		const p = this.profile;
		return (
			this.hp >= p.hp &&
			this.missiles >= p.missiles &&
			this.rockets >= p.rockets &&
			this.rounds >= p.rounds &&
			this.shells >= p.shells &&
			rackCount(this.rack) >= rackCount(p.rack)
		);
	}

	/** A radio call, unless this aircraft keeps quiet. */
	private say(w: World, text: string, sub: string, tone: 'info' | 'warn' | 'good'): void {
		if (this.callsign) w.events.message(`${this.callsign}${text}`, sub, tone);
	}

	/** Airborne and fighting (not falling, not waiting for a replacement). */
	get active(): boolean {
		return this.alive && !this.dying;
	}

	/**
	 * Gives the wingman an order. `target` is the pilot's current pick for
	 * "attack my target"; without one the wingman picks its own. Returns false
	 * when the order can't be carried out (the wingman is down).
	 */
	command(w: World, order: WingOrder, target: WingTarget | null = null): boolean {
		if (!this.active) {
			this.say(w, ' IS DOWN', 'A replacement joins next wave', 'warn');
			return false;
		}
		this.commands++;
		this.setPhase('attack');
		this.assigned = false;
		this.target = null;
		this.lowPass = false;
		if (order === 'rearm') {
			this.order = 'rearm';
			this.rtb = 'inbound';
			this.say(w, ': RTB', 'Heading home to repair and rearm', 'info');
			return true;
		}
		if (order === 'attack') {
			this.order = 'attack';
			if (!isLiveTarget(target)) {
				this.scan = 0;
				this.say(w, ': WEAPONS FREE', 'Picking his own targets', 'info');
				return true;
			}
			this.target = target;
			this.assigned = true;
			const name = target.unit ? target.unit.def.name : 'bandit';
			this.say(w, ': ENGAGING', `Going after the ${name.toLowerCase()}`, 'info');
			return true;
		}
		if (order === 'sams') {
			const next = this.nextAirDefence(w);
			if (!next) {
				this.order = 'attack';
				this.say(w, ': NO AIR DEFENCES', 'Weapons free', 'info');
				return true;
			}
			this.order = 'sams';
			this.target = { unit: next, air: null };
			this.say(w, ': HUNTING SAMS', `Rolling in on the ${next.def.name.toLowerCase()}`, 'info');
			return true;
		}
		this.order = 'cover';
		this.say(w, ': ON YOUR WING', 'Covering you', 'info');
		return true;
	}

	/**
	 * A new wave: if the wingman is down, a replacement climbs out from the
	 * airfield (once the wreck of the last one is on the ground). Returns true
	 * when one is on its way.
	 */
	reinforce(w: World): boolean {
		if (this.active) return false;
		if (this.dying) this.rejoinPending = true;
		else this.relaunch(w);
		return true;
	}

	/** Nearest air defence site, weighted so SAMs and radars come first. */
	nextAirDefence(w: World): Unit | null {
		let best: Unit | null = null;
		let bestScore = Infinity;
		for (const u of w.units) {
			const weight = AIR_DEFENCE[u.def.kind];
			if (!u.alive || weight === undefined || !inBattlePlane(u)) continue;
			if (!w.vision.seen('player', u)) continue;
			if (u.x < WORLD.arenaMinX || u.x > WORLD.arenaMaxX) continue;
			const score = Math.abs(u.x - this.x) * weight;
			if (score < bestScore) {
				bestScore = score;
				best = u;
			}
		}
		return best;
	}

	hit(w: World, amount: number): void {
		if (!this.active || w.godMode) return;
		this.hp -= amount;
		this.flash = 1;
		if (this.hp > 0) return;
		this.dying = true;
		this.spinRate = rnd.sign() * rnd.range(2, 4);
		w.fx.explosion(this.x, this.y, this.z, 0.6, false);
		w.sound.boom(0.75, this.x, this.y, true);
		this.target = null;
		this.lowPass = false;
		this.say(w, ' IS DOWN', 'Mayday · a replacement joins next wave', 'warn');
	}

	update(w: World, dt: number): void {
		this.flash = Math.max(0, this.flash - dt * 4);
		if (!this.alive) return;
		this.spin += dt * 40;
		if (this.dying) return this.fall(w, dt);
		this.gunCd -= dt;
		this.missileCd -= dt;
		this.bombCd -= dt;
		this.rocketCd -= dt;
		this.heavyCd -= dt;
		// The wingman's missiles come back in the air; the commander's aircraft go home for more.
		const regen = !this.autoRearm;
		if (regen && this.missiles < this.profile.missiles && this.order !== 'rearm') {
			this.reload += dt;
			if (this.reload >= MISSILE_RELOAD) {
				this.reload = 0;
				this.missiles++;
			}
		}
		this.checkRearm(w);
		this.retarget(w, dt);
		this.rippleRockets(w, dt);
		const circling = this.tactic === 'gunship' || this.tactic === 'drone';
		if (circling && this.order !== 'rearm' && this.circle(w, dt)) {
			// Flying its circle.
		} else if (this.tactic === 'helo') {
			this.hover(w, dt);
		} else {
			if (this.orbiting) this.leaveOrbit();
			const desired = this.steer(w, dt);
			this.fly(w, dt, desired);
		}
		this.drill.update(w, dt, this, 'enemy');
	}

	/**
	 * A commander's aircraft heads home once it is badly hurt or has spent
	 * what it fights with, and goes back to the front once repaired and rearmed.
	 */
	private checkRearm(w: World): void {
		if (!this.autoRearm || this.order === 'rearm') return;
		const hurt = this.hp < this.profile.hp * RTB_HP;
		if (!hurt && !this.spent()) return;
		this.homeFor = hurt ? 'repair' : 'ammo';
		this.command(w, 'rearm');
	}

	/** Nothing left worth staying for: a bomber's rack, the drone's missiles, everyone else's lot. */
	spent(): boolean {
		const bombs = rackCount(this.rack);
		if (this.tactic === 'bomber') return bombs === 0;
		if (this.tactic === 'drone') return this.missiles === 0;
		const gun = this.profile.gun > 0 && this.rounds > 0;
		return !gun && this.missiles === 0 && bombs === 0 && this.rockets === 0 && this.shells === 0;
	}

	/** Keeps the order's target fresh: reports kills and moves on to the next job. */
	private retarget(w: World, dt: number): void {
		if (this.order === 'rearm') {
			// Heading home: no fights picked on the way.
			this.target = null;
			return;
		}
		if (this.target && !isLiveTarget(this.target)) {
			this.target = null;
			if (this.order === 'sams') {
				const next = this.nextAirDefence(w);
				if (next) {
					this.target = { unit: next, air: null };
					this.say(w, ': SITE DOWN', `Next: the ${next.def.name.toLowerCase()}`, 'good');
				} else {
					this.order = 'attack';
					this.say(w, ': AIR DEFENCES CLEAR', 'Weapons free', 'good');
				}
			} else if (this.order === 'attack' && this.assigned) {
				this.say(w, ': TARGET DESTROYED', 'Picking the next one', 'good');
			}
			this.assigned = false;
			this.scan = 0;
			this.phase = 'attack';
		}
		if (this.order === 'cover') {
			// Bandits near the leader get chased; a dogfight already running keeps going.
			if (this.target?.air) return;
			const threat = this.coverThreat(w);
			this.target = threat ? { unit: null, air: threat } : null;
			return;
		}
		if (this.order !== 'attack' || this.assigned || this.target?.air) return;
		// Hunting freely: bandits after the leader come first, then the worst thing on the ground.
		this.scan -= dt;
		if (this.scan > 0) return;
		this.scan = RESCAN;
		const threat = this.tactic === 'fighter' ? this.coverThreat(w) : null;
		if (threat) {
			this.target = { unit: null, air: threat };
			this.setPhase('attack');
			return;
		}
		const pick = this.autoTarget(w);
		if (!this.target) {
			this.target = pick;
			return;
		}
		// Keep the current target unless something much more pressing has turned up (new
		// troops crossing at the front while it chases a gun far behind their lines).
		const now = this.target.unit;
		if (!now || !pick?.unit || pick.unit === now) return;
		const cx = this.huntCentre(w);
		if (this.targetScore(pick.unit, cx) < this.targetScore(now, cx) * SWITCH_MARGIN) {
			this.target = pick;
			this.setPhase('attack');
		}
	}

	/** Where the jet hunts around: its leader, or the front it was sent to. */
	private huntCentre(w: World): number {
		const p = w.player;
		return p && p.alive && !p.landed ? p.x : (this.patrol ?? this.x);
	}

	/**
	 * How pressing a ground target is (lower first): close to the front and to
	 * the jet, weighted so air defences and siege units come first.
	 */
	private targetScore(u: Unit, cx: number): number {
		const danger =
			AIR_DEFENCE[u.def.kind] ??
			(u.def.boss || u.def.siege > 0 ? 0.8 : u.def.category === 'infantry' ? INFANTRY_DANGER : 1);
		const dist = Math.abs(u.x - cx) + NEAR_WEIGHT * Math.abs(u.x - this.x);
		return (dist * danger) / (1 + u.def.score / 500);
	}

	/**
	 * The target the wingman picks for itself: the closest enemy near the
	 * leader, weighted so air defences, aircraft and siege units come first.
	 */
	autoTarget(w: World): WingTarget | null {
		const cx = this.huntCentre(w);
		let best: WingTarget | null = null;
		let bestScore = Infinity;
		// Bombers, gunships, drones and helicopters leave enemy aircraft to the fighters.
		const tactic = this.tactic;
		const airWeight = tactic === 'fighter' ? 0.5 : tactic === 'attack' ? 2.5 : Infinity;
		for (const a of w.air) {
			if (!a.alive || a.dying || Math.abs(a.x - cx) > HUNT_RADIUS) continue;
			if (!w.vision.seen('player', a)) continue;
			const score =
				(Math.abs(a.x - cx) + NEAR_WEIGHT * Math.hypot(a.x - this.x, a.y - this.y)) * airWeight;
			if (score < bestScore) {
				bestScore = score;
				best = { unit: null, air: a };
			}
		}
		for (const u of w.units) {
			if (!u.alive || !inBattlePlane(u) || Math.abs(u.x - cx) > HUNT_RADIUS) continue;
			if (!w.vision.seen('player', u)) continue;
			if (u.x < WORLD.arenaMinX || u.x > WORLD.arenaMaxX) continue;
			const score = this.targetScore(u, cx);
			if (score < bestScore) {
				bestScore = score;
				best = { unit: u, air: null };
			}
		}
		return best;
	}

	private coverThreat(w: World): AirUnit | null {
		const p = w.player;
		const cx = p && p.alive ? p.x : this.x,
			cy = p && p.alive ? p.y : this.y;
		let best: AirUnit | null = null;
		let bestD = COVER_RADIUS;
		for (const a of w.air) {
			if (!a.alive || a.dying || !w.vision.seen('player', a)) continue;
			const d = Math.hypot(a.x - cx, a.y - cy);
			if (d < bestD) {
				bestD = d;
				best = a;
			}
		}
		return best;
	}

	/** Heading the wingman wants this step, and the speed it wants to fly at. */
	private steer(w: World, dt: number): number {
		this.phaseTime += dt;
		if (this.order === 'rearm') return this.returnToBase(w, dt);
		this.lowPass = false;
		const t = this.target;
		if (this.tactic === 'bomber') return this.bombRun(w, dt, t?.unit ?? null);
		if (t?.air) return this.dogfight(w, dt, t.air);
		if (t?.unit) return this.groundAttack(w, dt, t.unit);
		return this.formation(w, dt);
	}

	private formation(w: World, dt: number): number {
		const p = w.player;
		if (!p || !p.alive || p.landed) {
			// Leader is down or parked (or there is none): orbit over the patrol line or the airfield.
			const cx = this.patrol ?? (WORLD.runwayMinX + WORLD.runwayMaxX) / 2;
			const cy = Math.min(
				w.ground(cx) + (this.tactic === 'bomber' ? bomberAltitude(this.aircraft) : 130),
				WORLD.ceiling - 60
			);
			this.speed = moveToward(this.speed, Math.min(90, this.profile.cruise), 40 * dt);
			// Back and forth across the station at its height, turning round up and over.
			if ((this.x - cx) * this.runDir > RACETRACK) this.runDir = -this.runDir;
			return Math.atan2(clamp(cy - this.y, -60, 60), this.runDir * 90);
		}
		const sp = Math.max(p.speed, 1);
		const fx = p.vx / sp,
			fy = p.vy / sp;
		const sx = p.x - fx * SLOT_BACK,
			sy = p.y - fy * SLOT_BACK + SLOT_UP;
		// Steer at where the slot will be shortly; set speed by how far off the slot itself is.
		const ex = sx - this.x,
			ey = sy - this.y;
		const along = ex * Math.cos(this.angle) + ey * Math.sin(this.angle);
		const want = clamp(p.speed + along * 0.9, 55, 165);
		this.speed = moveToward(this.speed, want, 90 * dt);
		return Math.atan2(ey + p.vy * 0.6, ex + p.vx * 0.6);
	}

	/**
	 * Flies home, lines up beyond the nearer end of the runway and makes a
	 * low, slow pass along it, repairing and rearming while over the tarmac.
	 * Passes again until topped up, then goes back on the attack.
	 */
	private returnToBase(w: World, dt: number): number {
		const lo = WORLD.runwayMinX,
			hi = WORLD.runwayMaxX;
		if (this.rtb === 'inbound') {
			this.lowPass = false;
			const fromEast = this.x > (lo + hi) / 2;
			const ex = fromEast ? hi + RTB_LINEUP : lo - RTB_LINEUP;
			const ey = w.ground(ex) + 35;
			this.speed = moveToward(this.speed, this.profile.cruise, 60 * dt);
			if (Math.abs(this.x - ex) < 30) {
				this.rtb = 'final';
				this.passDir = fromEast ? -1 : 1;
			}
			return Math.atan2(ey - this.y, ex - this.x);
		}
		this.lowPass = true;
		this.speed = moveToward(this.speed, PASS_SPEED, 50 * dt);
		const over = this.x >= lo && this.x <= hi;
		if (over && this.y - w.ground(this.x) < 30) this.service(dt);
		if (this.topped) {
			this.lowPass = false;
			this.order = 'attack';
			this.scan = 0;
			this.setPhase('attack');
			this.say(w, ': REARMED', 'Back in the fight', 'good');
			return this.passDir > 0 ? 0.5 : Math.PI - 0.5;
		}
		const past = this.passDir < 0 ? this.x < lo : this.x > hi;
		if (past && Math.cos(this.angle) * this.passDir > 0) {
			// Overshot before topping up: go round for another pass.
			this.rtb = 'inbound';
			this.lowPass = false;
		}
		const endX = this.passDir < 0 ? lo - 20 : hi + 20;
		const ty = w.ground(clamp(this.x, lo, hi)) + PASS_ALT;
		return Math.atan2(ty - this.y, endX - this.x);
	}

	/** Repairs and reloads while over the runway. */
	private service(dt: number): void {
		const p = this.profile;
		this.hp = Math.min(p.hp, this.hp + (p.hp / WING_REARM_TIME) * dt);
		// Bombs and rocket pods are loaded in one go; missiles go on one at a time.
		Object.assign(this.rack, p.rack);
		this.rockets = p.rockets;
		this.rounds = p.rounds;
		this.shells = p.shells;
		if (this.missiles >= p.missiles) return;
		this.rearmClock += dt;
		if (this.rearmClock >= WING_REARM_TIME / Math.max(1, p.missiles)) {
			this.rearmClock = 0;
			this.missiles++;
		}
	}

	private dogfight(w: World, dt: number, a: AirUnit): number {
		const dx = a.x - this.x,
			dy = a.y - this.y;
		const dist = Math.hypot(dx, dy);
		this.speed = moveToward(this.speed, 120, 90 * dt);
		if (this.phase === 'extend') {
			if (this.phaseTime > 2.4) this.setPhase('attack');
			return this.angle + angleDiff(this.angle, Math.atan2(-dy, -dx)) * 0.4;
		}
		const lead = dist / 640;
		const aim = Math.atan2(a.y + a.vy * lead - this.y, a.x + a.vx * lead - this.x);
		const err = Math.abs(angleDiff(this.angle, aim));
		if (err < 0.14 && dist < 420) this.guns(w);
		if (err < 0.5 && dist > 200 && dist < 700 && this.missileCd <= 0 && this.missiles > 0) {
			this.fireMissile(w, a, 'air');
		}
		if (dist < 90) this.setPhase('extend');
		return aim;
	}

	private groundAttack(w: World, dt: number, u: Unit): number {
		const ty = u.y + u.def.half[1];
		const dx = u.x - this.x,
			dy = ty - this.y;
		const dist = Math.hypot(dx, dy);
		const agl = this.y - w.surface.clearance(this.x);
		this.speed = moveToward(this.speed, this.profile.cruise, 90 * dt);
		if (this.phase === 'extend') {
			// Climb out ahead, then come around for another pass.
			if (this.phaseTime > 2.6 && agl > 90) this.setPhase('attack');
			return Math.cos(this.angle) >= 0 ? 0.55 : Math.PI - 0.55;
		}
		if (Math.abs(dx) > 420) {
			// Run in at height, then roll in.
			const alt = w.ground(u.x) + 150;
			return Math.atan2(alt - this.y, dx);
		}
		const aim = Math.atan2(dy, dx);
		const err = Math.abs(angleDiff(this.angle, aim));
		const inbound = w.missiles.some((m) => m.owner === 'player' && m.target === this.trackOf(u));
		if (err < 0.45 && dist < 620 && this.missileCd <= 0 && this.missiles > 0 && !inbound) {
			this.fireMissile(w, u, 'agm');
		}
		if (err < 0.1 && dist < 380) this.guns(w);
		if (err < 0.12 && dist < 420 && dist > 150) this.fireRockets();
		if (err < 0.5) this.tryBomb(w, u);
		if (dist < 110 || agl < 70) this.setPhase('extend');
		return aim;
	}

	/**
	 * Level bombing: runs across the target at height, laying bombs while the
	 * sight is on it, then flies on, turns and comes back the other way.
	 */
	private bombRun(w: World, dt: number, u: Unit | null): number {
		this.speed = moveToward(this.speed, this.profile.cruise, 40 * dt);
		if (!u) return this.formation(w, dt);
		const alt = Math.min(
			Math.max(w.ground(u.x), w.surface.clearance(this.x)) + bomberAltitude(this.aircraft),
			WORLD.ceiling - 60
		);
		const dx = u.x - this.x;
		if (dx * this.runDir < -BOMB_OVERRUN) this.runDir = -this.runDir;
		this.tryBomb(w, u);
		return Math.atan2(clamp(alt - this.y, -60, 60), this.runDir * 90);
	}

	/**
	 * The gunship and the drone circle over the front (or their target), the
	 * gunship shooting down into it, the drone sending missiles. Returns false
	 * while still flying out to the circle (the usual flight takes it there).
	 */
	private circle(w: World, dt: number): boolean {
		const u = this.target?.unit ?? null;
		const drone = this.tactic === 'drone';
		const r = drone ? DRONE_R : ORBIT_R;
		const cx = u ? u.x : (this.patrol ?? this.x);
		const cy = w.ground(cx) + (drone ? DRONE_ALT : ORBIT_ALT);
		if (!this.orbiting) {
			if (Math.abs(cx - this.x) > r * 1.2 || Math.abs(cy - this.y) > 90) return false;
			// Join the circle where it is now, heading the way it already flies.
			this.orbiting = true;
			this.orbit =
				Math.acos(clamp((this.x - cx) / r, -1, 1)) * (Math.cos(this.angle) >= 0 ? -1 : 1);
			this.yaw = Math.cos(this.angle) >= 0 ? 0 : Math.PI;
		}
		const speed = this.profile.cruise;
		this.speed = speed;
		this.orbit += (speed / r) * dt;
		const x0 = this.x,
			y0 = this.y;
		// Left-hand circle seen from above, squashed in depth so it stays near the road.
		this.x = damp(this.x, cx + Math.cos(this.orbit) * r, 2, dt);
		this.y = damp(this.y, Math.max(cy, w.surface.clearance(this.x) + 60), 0.8, dt);
		this.z = Math.sin(this.orbit) * r * DEPTH;
		this.vx = (this.x - x0) / dt;
		this.vy = (this.y - y0) / dt;
		this.yaw = Math.atan2(-Math.cos(this.orbit) * DEPTH, -Math.sin(this.orbit));
		this.angle = 0;
		this.roll = -0.3;
		if (u) this.circleFire(w, u);
		return true;
	}

	/** Back to flying along the road (heading home, or the circle moved away). */
	private leaveOrbit(): void {
		this.orbiting = false;
		this.angle = Math.cos(this.yaw) >= 0 ? 0 : Math.PI;
		this.roll = Math.cos(this.yaw) >= 0 ? 0 : Math.PI;
		this.yaw = 0;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = 0;
	}

	private circleFire(w: World, u: Unit): void {
		const ty = u.y + u.def.half[1];
		const dist = Math.hypot(u.x - this.x, ty - this.y);
		if (this.tactic === 'drone') {
			if (dist < 800 && this.missileCd <= 0 && this.missiles > 0) this.fireMissile(w, u, 'agm');
			return;
		}
		if (dist > AIMED_RANGE) return;
		this.aimedGuns(w, u.x, ty, dist);
		if (this.shells > 0 && this.heavyCd <= 0) this.heavyShell(w, u.x, ty);
		if (dist < 700 && this.missileCd <= 0 && this.missiles > 0) this.fireMissile(w, u, 'agm');
	}

	/**
	 * The helicopter: hovers short of its target at treetop height, nose on,
	 * firing its chin gun, Hellfires and rocket pods. Home over the runway to rearm.
	 */
	private hover(w: World, dt: number): void {
		const cruise = this.profile.cruise;
		let gx: number, gy: number;
		const u = this.target?.unit ?? null;
		this.z = moveToward(this.z, 0, 4 * dt);
		this.yaw = 0;
		if (this.order === 'rearm') {
			gx = (WORLD.runwayMinX + WORLD.runwayMaxX) / 2;
			gy = w.ground(gx) + PASS_ALT;
			if (Math.abs(gx - this.x) < 25 && this.y - w.ground(this.x) < 22) {
				this.service(dt);
				if (this.topped) {
					this.order = 'attack';
					this.scan = 0;
				}
			}
		} else {
			gx = u ? u.x - HELO_STANDOFF : (this.patrol ?? this.x) - 120;
			gy = w.surface.clearance(this.x) + HELO_ALT;
		}
		// Keep clear of the other helicopters, which head for the same spot.
		const [sx, sy] = spread<Wingman>(this, this.otherHelos(w), (e) => w.escorts.indexOf(e));
		gx += sx * 4;
		gy += sy * 2;
		const wantVx = clamp((gx - this.x) * 0.5, -cruise, cruise);
		const wantVy = clamp((gy - this.y) * 0.8, -15, 15);
		this.vx = moveToward(this.vx, wantVx, 18 * dt);
		this.vy = moveToward(this.vy, wantVy, 12 * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.y = Math.max(this.y, w.surface.clearance(this.x) + 4);
		this.speed = Math.abs(this.vx);
		// Faces its target, or the way it is going when it has none; noses down to fly forward.
		const face = u && this.order !== 'rearm' ? Math.sign(u.x - this.x) || 1 : this.vx < -5 ? -1 : 1;
		const pitch = -clamp((this.vx * face) / cruise, -1, 1) * 0.2;
		this.angle = face > 0 ? pitch : Math.PI - pitch;
		this.roll = face > 0 ? 0 : Math.PI;
		if (!u || this.order === 'rearm') return;
		const ty = u.y + u.def.half[1];
		const dist = Math.hypot(u.x - this.x, ty - this.y);
		if (dist < AIMED_RANGE) this.aimedGuns(w, u.x, ty, dist);
		const inbound = w.missiles.some((m) => m.owner === 'player' && m.target === this.trackOf(u));
		if (dist < 700 && this.missileCd <= 0 && this.missiles > 0 && !inbound)
			this.fireMissile(w, u, 'agm');
		if (dist < 430 && this.rockets > 0 && this.rocketCd <= 0) {
			this.angle = Math.atan2(ty - this.y, u.x - this.x);
			this.fireRockets();
		}
	}

	/** Bomb release: when the predicted impact sits on the target, the best bomb for it goes. */
	private tryBomb(w: World, u: Unit): void {
		if (this.bombCd > 0 || Math.abs(u.x - this.x) > 700) return;
		const id = this.pickBomb(u);
		if (!id) return;
		const def = BOMBS[id];
		const vx = this.vx,
			vy = this.vy;
		const hit = predictImpact(w, this.x, this.y - 1.5, vx, vy, def.drag, null, def.lift);
		const bomber = this.tactic === 'bomber';
		const window = (bomber ? 26 : 7) + def.blast.radius * 0.3;
		if (Math.abs(hit.x - u.x) > window) return;
		// Keep it off our own troops.
		if (w.allies.list.some((a) => a.alive && Math.abs(a.x - hit.x) < def.blast.radius + 6)) return;
		this.rack[id] = (this.rack[id] ?? 0) - 1;
		this.bombCd = bomber ? 0.14 : 0.6;
		dropBomb(w, def, this.x, this.y - 1.5, 0, vx, vy, this.angle);
	}

	private pickBomb(u: Unit): BombId | null {
		const prefer = u.def.category === 'infantry' ? ANTI_SOFT : ANTI_ARMOUR;
		for (const id of prefer) if ((this.rack[id] ?? 0) > 0) return id;
		if ((this.rack.gp ?? 0) > 0) return 'gp';
		for (const k in this.rack) if ((this.rack[k as BombId] ?? 0) > 0) return k as BombId;
		return null;
	}

	/** Queues a pod's worth of rockets, fired along the nose. */
	private fireRockets(): void {
		if (this.rockets <= 0 || this.rocketCd > 0 || this.rocketQueue > 0) return;
		this.rockets--;
		this.rocketQueue = ROCKETS_PER_POD;
		this.rocketCd = rnd.range(2.5, 4);
	}

	private rippleRockets(w: World, dt: number): void {
		if (this.rocketQueue <= 0) return;
		this.rocketGap -= dt;
		if (this.rocketGap > 0) return;
		this.rocketGap = 0.07;
		this.rocketQueue--;
		const a = this.angle + rnd.gauss(0.025);
		const ca = Math.cos(a),
			sa = Math.sin(a);
		w.shells.push({
			kind: 'ffar',
			x: this.x + ca * 2,
			y: this.y - 0.8,
			z: this.z,
			vx: this.vx + ca * ROCKET_SPEED,
			vy: this.vy + sa * ROCKET_SPEED,
			age: 0,
			fuse: 0,
			damage: 0,
			radius: 0,
			owner: 'player',
			trail: 0
		});
		w.fx.muzzleFlash(this.x + ca * 2, this.y - 0.8, this.z, ca, sa, 1, [12, 7, 3]);
		w.sound.play('missileLaunch', this.x, this.y, 0.3);
	}

	/** Turret or side guns: bursts at the target whatever the heading. */
	private aimedGuns(w: World, tx: number, ty: number, dist: number): void {
		if (this.profile.gun <= 0) return;
		const lead = dist / 640;
		const a = Math.atan2(ty + 0.5 * 4 * lead * lead - this.y, tx - this.x);
		this.guns(w, a);
	}

	/** The gunship's howitzer: a heavy shell lobbed onto the target every few seconds. */
	private heavyShell(w: World, tx: number, ty: number): void {
		this.heavyCd = HEAVY_SHELL.every;
		this.shells--;
		const dx = tx - this.x,
			dy = ty - this.y;
		const tof = Math.hypot(dx, dy) / HEAVY_SHELL.speed;
		// Shells fall at 13 m/s² (see updateShells): aim high by the drop.
		const a = Math.atan2(dy + 0.5 * 13 * tof * tof, dx);
		w.shells.push({
			kind: 'tank',
			x: this.x,
			y: this.y - 1,
			z: this.z,
			vx: Math.cos(a) * HEAVY_SHELL.speed,
			vy: Math.sin(a) * HEAVY_SHELL.speed,
			age: 0,
			fuse: Infinity,
			damage: HEAVY_SHELL.damage,
			radius: HEAVY_SHELL.radius,
			owner: 'player',
			trail: 0,
			aimX: tx
		});
		w.fx.muzzleFlash(this.x, this.y - 1, this.z, Math.cos(a), Math.sin(a), 3, [12, 6, 2]);
		w.sound.play('tankGun', this.x, this.y, 0.5);
	}

	private setPhase(phase: 'attack' | 'extend'): void {
		this.phase = phase;
		this.phaseTime = 0;
	}

	/** Our other helicopters in the air. */
	private *otherHelos(w: World): Generator<Wingman> {
		for (const e of w.escorts) if (e !== this && e.active && e.tactic === 'helo') yield e;
	}

	/** Stable tracking adapter for the current ground target. */
	private trackOf(u: Unit): Trackable {
		if (this.tracked?.unit === u) return this.tracked.track;
		const track = trackUnit(u);
		this.tracked = { unit: u, track };
		return track;
	}

	private fly(w: World, dt: number, desired: number): void {
		let target = desired;
		const ground = w.surface.clearance(this.x);
		const right = Math.cos(this.angle) >= 0;
		const rate = this.profile.turn * (this.speed < 80 ? 1.2 : 1);
		// Pull up early enough for this airframe to come out of its dive: bombers turn slowly.
		const room = pullUpRoom(this.angle, this.speed, rate);
		const agl = this.y - ground;
		if (agl < (this.lowPass ? 6 : 45) + room) target = right ? 0.8 : Math.PI - 0.8;
		if (this.y > WORLD.ceiling - 40) target = right ? -0.35 : Math.PI + 0.35;
		if (this.x < WORLD.arenaMinX + 60) target = 0.3;
		if (this.x > WORLD.arenaMaxX + 60) target = Math.PI - 0.3;
		if (
			this.tactic === 'bomber' &&
			(this.flat.active || this.flat.wants(this.angle, target, agl))
		) {
			if (!this.flat.active) this.flat.start(this);
			this.flat.step(this, this.speed, rate, dt);
			return;
		}
		this.z = moveToward(this.z, 0, 20 * dt);
		const low = agl < (2 * this.speed) / rate + 45;
		this.angle = wrapAngle(
			this.angle + clamp(safeTurn(this.angle, target, low), -rate * dt, rate * dt)
		);
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		// Never through the ground: skim it and level off.
		const floor = w.surface.clearance(this.x) + 2;
		if (this.y < floor) {
			this.y = floor;
			this.angle = levelOff(this.angle);
			this.vx = Math.cos(this.angle) * this.speed;
			this.vy = Math.sin(this.angle) * this.speed;
		}
		const c = Math.cos(this.angle);
		this.roll = moveToward(this.roll, c > 0.15 ? 0 : c < -0.15 ? Math.PI : this.roll, dt * 3.5);
		this.trail += dt;
		if (this.trail > 0.04) {
			this.trail = 0;
			if (this.hp < this.profile.hp * 0.4) w.fx.trail(this.x, this.y, this.z, 1, 0.08, 0.7, 2, 0.2);
		}
	}

	/** A burst from the gun: along the nose, or along `aim` for turret and side guns. */
	private guns(w: World, aim = this.angle): void {
		const p = this.profile;
		if (this.gunCd > 0 || p.gun <= 0 || this.rounds <= 0) return;
		this.rounds--;
		const heavy = p.explosive > 0;
		if (this.burst <= 0) this.burst = heavy ? 4 : 10;
		this.burst--;
		this.gunCd = this.burst > 0 ? (heavy ? 0.22 : 0.06) : rnd.range(0.5, 0.9);
		const a = aim + rnd.gauss(heavy ? 0.012 : 0.02);
		const mx = this.x + Math.cos(aim) * 5,
			my = this.y + Math.sin(aim) * 5;
		spawnBullet(w, {
			x: mx,
			y: my,
			z: this.z,
			vx: Math.cos(a) * 700 + this.vx,
			vy: Math.sin(a) * 700 + this.vy,
			life: 1.1,
			damage: p.gun,
			pierce: 0.3,
			owner: 'player',
			tracer: true,
			color: [3, 9, 12],
			size: heavy ? 0.32 : 0.2,
			explosive: p.explosive
		});
		w.fx.muzzleFlash(mx, my, this.z, Math.cos(a), Math.sin(a), heavy ? 1.6 : 0.9, [8, 10, 12]);
		w.sound.play(heavy ? 'aaGun' : 'gun', mx, my, 0.3, heavy ? 0.8 : 1.15);
	}

	private fireMissile(w: World, t: Unit | AirUnit, kind: 'air' | 'agm'): void {
		this.missiles--;
		this.missileCd = kind === 'air' ? rnd.range(6, 9) : rnd.range(3, 4.5);
		const track = kind === 'agm' ? this.trackOf(t as Unit) : (t as AirUnit);
		launchMissile(w, {
			kind,
			x: this.x + Math.cos(this.angle) * 2,
			y: this.y - 1,
			z: 0,
			angle: this.angle,
			speed: Math.max(60, this.speed),
			maxSpeed: kind === 'air' ? 240 : 290,
			accel: 230,
			turnRate: kind === 'air' ? 3 : 4,
			target: track,
			burn: 3,
			life: 7,
			damage: kind === 'air' ? WING_AAM_DAMAGE : 0,
			owner: 'player',
			seeker: kind === 'air' ? 'heat' : 'radar',
			blast: kind === 'agm' ? AGM_BLAST : undefined
		});
	}

	private fall(w: World, dt: number): void {
		this.vy -= 14 * dt;
		this.vx *= Math.exp(-0.3 * dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.angle += this.spinRate * 0.3 * dt;
		this.roll += this.spinRate * dt;
		this.trail += dt;
		if (this.trail > 0.025) {
			this.trail = 0;
			w.fx.trail(this.x, this.y, 0, 1.8, 0.03, 0.85, 4, 0.3);
			w.fx.flame(this.x, this.y, 0, 1.3, 1.1);
		}
		const g = w.surface.clearance(this.x);
		if (this.y > g + 1) return;
		this.alive = false;
		this.dying = false;
		explode(w, this.x, g, 0, CRASH, 'player', { playerScale: 0 });
		w.fires.add(this.x, g, 0, 1.4, 14, { radius: 2.2 });
		if (this.rejoinPending) this.relaunch(w);
	}

	/** A fresh aircraft, already airborne off the end of the runway and climbing out. */
	private relaunch(w: World): void {
		this.rejoinPending = false;
		this.rejoins++;
		this.x = WORLD.runwayMaxX;
		this.y = w.ground(this.x) + 30;
		this.angle = 0.22;
		this.roll = 0;
		this.speed = this.profile.cruise;
		this.vx = Math.cos(this.angle) * this.speed;
		this.vy = Math.sin(this.angle) * this.speed;
		this.hp = this.profile.hp;
		this.alive = true;
		this.dying = false;
		this.flash = 0;
		this.missiles = this.profile.missiles;
		this.order = 'attack';
		this.target = null;
		this.assigned = false;
		this.lowPass = false;
		this.scan = 0;
		this.setPhase('attack');
		this.say(w, ': BACK ON STATION', 'A replacement climbs out to join you', 'good');
	}
}

/**
 * The friendly aircraft an enemy at (x, y) should shoot at: the player (or in
 * co-op, player two) or the wingman, whichever is closer (the player when both are equally placed).
 */
export function nearestFriendly(w: World, x: number, y: number): Player | AirAlly | null {
	if (w.godMode) return null;
	// In co-op, the closer of the two human pilots (enemies only see what their side knows about).
	const pilot = w.nearestPilot(x, y);
	const p = pilot && w.vision.seen('enemy', pilot) ? pilot : null;
	let wing: AirAlly | null = null;
	let dw = Infinity;
	for (const j of w.jets()) {
		if (!j.active || !w.vision.seen('enemy', j)) continue;
		const d = Math.hypot(j.x - x, j.y - y);
		if (d < dw) {
			dw = d;
			wing = j;
		}
	}
	if (!wing) return p;
	if (!p) return wing;
	const dp = Math.hypot(p.x - x, p.y - y);
	return dw < dp * 0.85 ? wing : p;
}

export function updateWingman(w: World, dt: number): void {
	w.wingman?.update(w, dt);
	for (let i = w.escorts.length - 1; i >= 0; i--) {
		const e = w.escorts[i];
		e.update(w, dt);
		// A commander's air unit that went down is gone for good.
		if (!e.alive) w.escorts.splice(i, 1);
	}
}
