import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import { NO_INPUT, Player } from './player';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { RadioWatch, type RadioCue } from '../audio/radio';
import { radioState } from './battle-audio';
import { WORLD } from './constants';
import { WaveDirector } from './waves';
import {
	AGM_BLAST,
	nearestFriendly,
	Wingman,
	WING_AAM_DAMAGE,
	WING_GUN_DAMAGE,
	WING_HP,
	WING_MISSILES
} from './wingman';
import type { World } from './world';

const DT = 1 / 60;

function run(w: World, seconds: number, each?: () => boolean | void): void {
	for (let t = 0; t < seconds; t += DT) {
		simulateWorld(w, DT, w.player ? NO_INPUT : null);
		if (each?.()) return;
	}
}

/** A leader flying level over the middle of the map, and a wingman beside it. */
function setup(x = 900, alt = 150): { w: World; p: Player; wing: Wingman } {
	const w = testWorld();
	const p = new Player('kestrel', x, w.ground(x) + alt, 0);
	p.invuln = 1e9;
	w.player = p;
	const wing = new Wingman(x - 40, p.y + 12);
	w.wingman = wing;
	return { w, p, wing };
}

describe('wingman', () => {
	it('starts on the attack and holds formation while there is nothing to hit', () => {
		const { w, p, wing } = setup(600);
		expect(wing.order).toBe('attack');
		let worst = 0;
		run(w, 14, () => {
			if (w.time > 4) worst = Math.max(worst, Math.hypot(p.x - wing.x, p.y - wing.y));
		});
		expect(wing.active).toBe(true);
		expect(wing.order).toBe('attack');
		expect(worst).toBeLessThan(140);
	});

	it('engages enemies by itself without being ordered', () => {
		const { w, wing } = setup(700);
		const truck = w.spawnUnit('truck', 1250, 0);
		truck.speed = 0;
		run(w, 0.5);
		expect(wing.target?.unit).toBe(truck);
		expect(wing.assigned).toBe(false);
		run(w, 40, () => !truck.alive);
		expect(truck.alive).toBe(false);
	});

	it('picks an air defence site over a nearer truck', () => {
		const { w, wing } = setup(700);
		w.spawnUnit('truck', 1000, 0).speed = 0;
		const sam = w.spawnUnit('sam', 1200, -11);
		expect(wing.autoTarget(w)?.unit).toBe(sam);
	});

	it('hits a little lighter than before', () => {
		expect(WING_GUN_DAMAGE).toBeLessThanOrEqual(4);
		expect(WING_AAM_DAMAGE).toBeLessThanOrEqual(25);
		expect(AGM_BLAST.damage).toBeLessThanOrEqual(190);
	});

	it('destroys the target it is ordered to attack, then rejoins', () => {
		const { w, wing } = setup(700);
		const truck = w.spawnUnit('truck', 1300, 0);
		truck.speed = 0;
		expect(wing.command(w, 'attack', { unit: truck, air: null })).toBe(true);
		expect(wing.order).toBe('attack');
		run(w, 40, () => !truck.alive);
		expect(truck.alive).toBe(false);
		run(w, 0.1);
		expect(wing.order).toBe('attack');
		expect(wing.assigned).toBe(false);
	});

	it('goes weapons free on an attack order without a target', () => {
		const { w, wing } = setup();
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		wing.command(w, 'cover');
		expect(wing.command(w, 'attack', null)).toBe(true);
		expect(wing.order).toBe('attack');
		expect(said.join()).toContain('WEAPONS FREE');
	});

	it('stays in formation on a cover order, ignoring ground targets', () => {
		const { w, wing } = setup(700);
		w.spawnUnit('truck', 1000, 0).speed = 0;
		wing.command(w, 'cover');
		run(w, 2);
		expect(wing.order).toBe('cover');
		expect(wing.target).toBeNull();
	});

	it('hunts SAM sites before other air defences and stands down when none are left', () => {
		const { w, wing } = setup(800);
		const flak = w.spawnUnit('flak', 1250, -11);
		const sam = w.spawnUnit('sam', 1500, -11);
		expect(wing.command(w, 'sams')).toBe(true);
		expect(wing.target?.unit).toBe(sam);
		sam.alive = false;
		run(w, 0.1);
		expect(wing.target?.unit).toBe(flak);
		flak.alive = false;
		run(w, 0.1);
		expect(wing.order).toBe('attack');
		wing.command(w, 'sams');
		expect(wing.order).toBe('attack');
	});

	it('returns to base, rearms on a low runway pass and resumes the attack', () => {
		const { w, p, wing } = setup(1400, 160);
		const truck = w.spawnUnit('truck', 1700, 0);
		truck.speed = 0;
		truck.hp = 1e9;
		wing.hp = 20;
		wing.missiles = 0;
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		expect(wing.command(w, 'rearm')).toBe(true);
		expect(wing.order).toBe('rearm');
		let lowest = Infinity;
		let fired = false;
		run(w, 90, () => {
			if (w.missiles.some((m) => m.owner === 'player')) fired = true;
			if (wing.x >= WORLD.runwayMinX && wing.x <= WORLD.runwayMaxX)
				lowest = Math.min(lowest, wing.y - w.ground(wing.x));
			p.x = 1400; // the leader loiters out east
			return wing.order !== 'rearm';
		});
		expect(fired).toBe(false);
		expect(wing.active).toBe(true);
		expect(lowest).toBeLessThan(30);
		expect(wing.order).toBe('attack');
		expect(wing.hp).toBe(WING_HP);
		expect(wing.missiles).toBe(WING_MISSILES);
		expect(said).toContain('TWO: REARMED');
		run(w, 1.5);
		expect(wing.target?.unit).toBe(truck);
	});

	it('breaks off to chase interceptors that come after the leader', () => {
		const { w, p, wing } = setup(1200, 180);
		const bandit = new AirUnit(w.newId(), 'fighter', p.x + 400, p.y + 20);
		w.air.push(bandit);
		run(w, 0.2);
		expect(wing.target?.air).toBe(bandit);
	});

	it('draws enemy fire when it is the closer aircraft', () => {
		const { w, p, wing } = setup(900);
		wing.x = p.x + 600;
		expect(nearestFriendly(w, p.x + 700, p.y)).toBe(wing);
		expect(nearestFriendly(w, p.x - 100, p.y)).toBe(p);
		w.godMode = true;
		expect(nearestFriendly(w, p.x + 700, p.y)).toBeNull();
	});

	it('calls a mayday when shot down and stays down for the rest of the wave', () => {
		const { w, wing } = setup(900);
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		const watch = new RadioWatch();
		watch.update(radioState(w, w.player, 'active', 3));
		wing.hit(w, WING_HP + 1);
		expect(wing.dying).toBe(true);
		expect(said).toContain('TWO IS DOWN');
		const cues: RadioCue[] = watch.update(radioState(w, w.player, 'active', 3));
		expect(cues).toContain('wingmanDown');
		run(w, 20, () => !wing.alive);
		expect(wing.alive).toBe(false);
		expect(wing.command(w, 'cover')).toBe(false);
		run(w, 60);
		expect(wing.active).toBe(false);
	});

	it('sends a replacement in when the next wave starts', () => {
		const { w, wing } = setup(900);
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		const watch = new RadioWatch();
		watch.update(radioState(w, w.player, 'cleared', 3));
		wing.hit(w, WING_HP + 1);
		run(w, 20, () => !wing.alive);
		watch.update(radioState(w, w.player, 'cleared', 3));
		new WaveDirector(1).begin(w, 2);
		expect(wing.active).toBe(true);
		expect(wing.hp).toBe(WING_HP);
		expect(wing.order).toBe('attack');
		expect(wing.x).toBeCloseTo(WORLD.runwayMaxX);
		expect(wing.y).toBeGreaterThan(w.ground(wing.x) + 10);
		expect(said.join()).toContain('BACK ON STATION');
		expect(watch.update(radioState(w, w.player, 'briefing', 3))).toContain('wingBack');
	});

	it('replaces a wingman still falling at the wave start once the wreck lands', () => {
		const { w, wing } = setup(900, 250);
		wing.hit(w, WING_HP + 1);
		expect(wing.reinforce(w)).toBe(true);
		expect(wing.dying).toBe(true);
		run(w, 30, () => wing.active);
		expect(wing.active).toBe(true);
		expect(wing.rejoins).toBe(1);
	});

	it('leaves a healthy wingman alone at the wave start', () => {
		const { w, wing } = setup(900);
		expect(wing.reinforce(w)).toBe(false);
		expect(wing.rejoins).toBe(0);
	});

	it('takes hits from enemy bullets', () => {
		const { w, wing } = setup(900);
		w.bullets.push({
			x: wing.x - 30,
			y: wing.y,
			z: 0,
			vx: 900,
			vy: 0,
			life: 1,
			damage: 10,
			pierce: 0,
			owner: 'enemy',
			tracer: false,
			color: [1, 1, 1],
			size: 0.1,
			explosive: 0
		});
		run(w, 0.1);
		expect(wing.hp).toBeLessThan(WING_HP);
	});
});
