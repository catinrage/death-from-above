import { BOMB_ORDER } from './defs-bombs';
import type { UnitKind } from './types';
import { Wingman } from './wingman';
import type { World } from './world';

/** What the HUD shows for the current lesson. */
export interface TutorialCard {
	step: number;
	total: number;
	title: string;
	text: string;
	/** Key caps, e.g. ['W', 'A', 'S', 'D']. */
	keys: string[];
	/** Gamepad equivalent. */
	pad: string;
	/** 0..1 toward finishing the lesson. */
	progress: number;
	/** The lesson waits for Enter rather than an action. */
	manual: boolean;
	/** Short "done" flash between lessons. */
	passed: boolean;
}

interface Lesson {
	title: string;
	text: string;
	keys: string[];
	pad: string;
	manual?: boolean;
	/** Bring the AI wingman into the flight when this lesson starts. */
	joinsWingman?: boolean;
	/** Targets placed when the lesson starts: kind and distance past the airfield. */
	targets?: [UnitKind, number][];
	progress(t: Tutorial, w: World): number;
}

/** Where training targets stand: past the airfield, well short of the river. */
const RANGE_X = 900;
/** Seconds the "lesson passed" flash stays before the next one starts. */
const PASS_TIME = 1.6;

/** Living targets placed for the current lesson, as a fraction destroyed. */
function cleared(t: Tutorial, w: World): number {
	if (t.targets.length === 0) return 0;
	const dead = t.targets.filter((id) => !w.units.some((u) => u.id === id && u.alive)).length;
	return dead / t.targets.length;
}

const LESSONS: Lesson[] = [
	{
		title: 'Welcome, pilot',
		text: 'This flight teaches the controls one at a time. Nothing here can shoot you down for good, so take your time. Each lesson moves on by itself once you have done it.',
		keys: ['Enter'],
		pad: 'A',
		manual: true,
		progress: () => 0
	},
	{
		title: 'Climb',
		text: 'Steering is directional: press the way you want to fly. Hold W and D together to climb at an angle, and get above 120 m. Straight up bleeds speed fast.',
		keys: ['W', 'D'],
		pad: 'Left stick',
		progress: (t, w) => {
			const p = w.player;
			return p ? Math.min(1, Math.max(0, p.y - w.ground(p.x)) / 120) : 0;
		}
	},
	{
		title: 'Turn around',
		text: 'Asking for the opposite heading loops you over the top. Press A to fly back toward the airfield, then D to face the enemy again.',
		keys: ['A', 'D'],
		pad: 'Left stick',
		progress: (t, w) => {
			const p = w.player;
			if (p && p.vx < -20) t.flags.add('reversed');
			if (!t.flags.has('reversed')) return 0;
			return p && p.vx > 20 ? 1 : 0.5;
		}
	},
	{
		title: 'Guns',
		text: 'Infantry and a gun jeep are waiting past the airfield. Dive at them and hold J (or left mouse) to strafe. Short bursts: the guns overheat.',
		keys: ['J', 'LMB'],
		pad: 'RT',
		targets: [
			['rifleman', 0],
			['rifleman', 6],
			['rifleman', 12],
			['jeep', 30]
		],
		progress: cleared
	},
	{
		title: 'Bombs',
		text: 'Trucks on the road. Press Space (or right mouse) to drop a bomb; hold it to keep dropping. The dotted arc shows where they will land.',
		keys: ['Space', 'RMB'],
		pad: 'A',
		targets: [
			['truck', 40],
			['truck', 60],
			['truck', 80]
		],
		progress: (t, w) => (t.bombs > 0 ? cleared(t, w) : 0)
	},
	{
		title: 'Choose your ordnance',
		text: 'Your rack is along the bottom of the screen. Pick a heavier weapon with the number keys, Q / Tab or the mouse wheel, then destroy the tank with it.',
		keys: ['1–9', 'Q', 'Tab'],
		pad: 'LB / RB',
		targets: [['tank', 60]],
		progress: (t, w) => {
			if (w.player && w.player.selected !== 'gp') t.flags.add('selected');
			return t.flags.has('selected') ? 0.25 + 0.75 * cleared(t, w) : 0;
		}
	},
	{
		title: 'Guided missiles',
		text: 'Put the mouse reticle on a vehicle and press E (or middle mouse) to fire a guided missile at it. Without a mouse, targets are picked for you.',
		keys: ['E', 'Mouse'],
		pad: 'Y · right stick',
		targets: [
			['jeep', 20],
			['truck', 50]
		],
		progress: (t, w) => (t.missiles > 0 ? 0.25 + 0.75 * cleared(t, w) : 0)
	},
	{
		title: 'Focus',
		text: 'Press R to slow time. Sweep the reticle across several targets to paint locks, then press E: one missile goes to each lock. Kills outside focus refill the meter.',
		keys: ['R', 'E'],
		pad: 'LT · Y',
		targets: [
			['jeep', 0],
			['jeep', 25],
			['truck', 50],
			['jeep', 75]
		],
		progress: (t, w) => (t.flags.has('focus') ? 0.2 + 0.8 * cleared(t, w) : 0)
	},
	{
		title: 'Flares',
		text: 'A missile trooper is up ahead. Fly toward him and wait for the MISSILE warning, then press F when it reads FLARES NOW. Flares fired too early burn out and the seeker finds you again. Out of flares? Break hard across its path just before it reaches you: a nimble jet can make it overshoot.',
		keys: ['F'],
		pad: 'B',
		targets: [['manpads', 20]],
		progress: (t) => (t.flags.has('decoyed') ? 1 : t.flags.has('inbound') ? 0.5 : 0)
	},
	{
		title: 'Afterburner and airbrake',
		text: 'Hold Shift for the afterburner (it makes you a brighter target for heat seekers). Hold V to deploy the airbrake and slow down.',
		keys: ['Shift', 'V'],
		pad: 'X · View',
		progress: (t) => Math.min(1, t.boostTime / 1.2) * 0.5 + Math.min(1, t.brakeTime / 0.8) * 0.5
	},
	{
		title: 'Rearm',
		text: 'Fly low and slow along the runway to rearm and repair. Touch down level to land. Hold over the runway until the rearm counter fills.',
		keys: ['V', 'S'],
		pad: 'Left stick',
		progress: (t) => Math.min(1, t.rearmTime / 3)
	},
	{
		title: 'Wingman',
		text: 'Two, your wingman, joins you. Lock a target or put the reticle on it and press T to send him in. Then press G to call him back to cover you. H sends him after the air defences.',
		keys: ['T', 'G', 'H'],
		pad: 'D-pad → ↑ ↓',
		targets: [
			['jeep', 0],
			['truck', 30]
		],
		joinsWingman: true,
		progress: (t) => (t.flags.has('wing-attack') ? 0.5 : 0) + (t.flags.has('wing-cover') ? 0.5 : 0)
	},
	{
		title: 'Ready for duty',
		text: 'In a real sortie enemy columns drive at the airfield and shell it when they arrive. Lose the airfield or all three aircraft and the mission fails. Good hunting.',
		keys: ['Enter'],
		pad: 'A',
		manual: true,
		progress: () => 0
	}
];

export interface TutorialInput {
	/** Focus (slow motion) is running. */
	focus: boolean;
	/** Enter or gamepad A this frame: continues a lesson that waits for it. */
	confirm: boolean;
	/** Enter alone (A also drops bombs): skips an action lesson. */
	skip: boolean;
}

/**
 * Scripted training flight: one lesson at a time, each with its own targets
 * and a goal read straight from the world state.
 */
export class Tutorial {
	index = 0;
	/** Training targets for the current lesson. */
	targets: number[] = [];
	readonly flags = new Set<string>();
	bombs = 0;
	missiles = 0;
	boostTime = 0;
	brakeTime = 0;
	rearmTime = 0;
	finished = false;
	private passTimer = 0;
	private lastAmmo = -1;
	private lastMissiles = -1;
	/** Missiles that have locked on to us during this lesson. */
	private readonly chasers = new WeakSet<object>();
	private progressNow = 0;
	/** The wingman's order when last checked: a change means the pilot gave one. */
	private lastOrder: string | null = null;

	get total(): number {
		return LESSONS.length;
	}

	get lesson(): Lesson {
		return LESSONS[this.index];
	}

	start(w: World): void {
		this.index = 0;
		this.finished = false;
		this.enter(w);
	}

	private enter(w: World): void {
		this.flags.clear();
		this.bombs = this.missiles = 0;
		this.boostTime = this.brakeTime = this.rearmTime = 0;
		this.progressNow = 0;
		this.lastAmmo = this.lastMissiles = -1;
		// Leftover targets from a skipped lesson leave with it.
		for (const u of w.units) if (this.targets.includes(u.id)) u.remove = true;
		this.targets = [];
		for (const [kind, dx] of this.lesson.targets ?? []) {
			const u = w.spawnUnit(kind, RANGE_X + dx, kind === 'rifleman' ? (dx % 3) - 1 : 0, -1);
			this.targets.push(u.id);
		}
		if (this.lesson.joinsWingman && !w.wingman && w.player) {
			const p = w.player;
			w.wingman = new Wingman(p.x - 40, p.y + 12);
		}
		this.lastOrder = w.wingman?.order ?? null;
		w.events.message(this.lesson.title.toUpperCase(), '', 'info');
	}

	update(w: World, dt: number, inp: TutorialInput): void {
		if (this.finished) return;
		const order = w.wingman?.order ?? null;
		if (order && order !== this.lastOrder) {
			this.flags.add(`wing-${order}`);
			this.lastOrder = order;
		}
		const p = w.player;
		// Targets stand their ground instead of driving on the airfield.
		for (const u of w.units) {
			if (!u.alive || !this.targets.includes(u.id)) continue;
			u.state = 'hold';
			u.stateTime = 0;
			u.panic = 0;
		}
		if (this.passTimer > 0) {
			this.passTimer -= dt;
			if (this.passTimer <= 0) this.advance(w);
			return;
		}
		if (p && p.alive) {
			const ammo = BOMB_ORDER.reduce((n, id) => n + p.ammo[id], 0);
			if (this.lastAmmo >= 0 && ammo < this.lastAmmo) this.bombs++;
			this.lastAmmo = ammo;
			if (this.lastMissiles >= 0 && p.missiles < this.lastMissiles) this.missiles++;
			this.lastMissiles = p.missiles;
			for (const m of w.missiles) {
				if (!m.alive) continue;
				if (m.target === p) {
					this.chasers.add(m);
					this.flags.add('inbound');
				} else if (this.chasers.has(m) && m.target) {
					// It was chasing us and now follows something else: a flare.
					this.flags.add('decoyed');
				}
			}
			if (p.boosting) this.boostTime += dt;
			if (p.brakeLevel > 0.5) this.brakeTime += dt;
			if (p.rearming) this.rearmTime += dt;
		}
		if (inp.focus) this.flags.add('focus');
		this.respawnTargets(w);
		this.progressNow = this.lesson.progress(this, w);
		if (this.lesson.manual ? inp.confirm : inp.skip) return this.advance(w);
		if (!this.lesson.manual && this.progressNow >= 1) {
			this.passTimer = PASS_TIME;
			w.events.message('WELL DONE', '', 'good');
			w.sound.play('pickup', w.camera.x, w.camera.y, 0.7);
		}
	}

	/** The missile trooper is the one target that must survive until he has fired. */
	private respawnTargets(w: World): void {
		if (this.lesson.title !== 'Flares' || this.flags.has('decoyed')) return;
		const alive = w.units.some((u) => u.alive && this.targets.includes(u.id));
		if (alive) return;
		const u = w.spawnUnit('manpads', RANGE_X + 20, 0, -1);
		this.targets = [u.id];
	}

	private advance(w: World): void {
		this.passTimer = 0;
		if (this.index >= LESSONS.length - 1) {
			this.finished = true;
			return;
		}
		this.index++;
		this.enter(w);
	}

	card(): TutorialCard {
		const l = this.lesson;
		return {
			step: this.index + 1,
			total: LESSONS.length,
			title: l.title,
			text: l.text,
			keys: l.keys,
			pad: l.pad,
			progress: this.passTimer > 0 ? 1 : this.progressNow,
			manual: !!l.manual,
			passed: this.passTimer > 0
		};
	}
}
