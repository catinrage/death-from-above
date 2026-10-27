import { describe, expect, it } from 'vitest';
import { AirUnit } from './enemy-air';
import { NO_INPUT, Player } from './player';
import { simulateWorld } from './simulate';
import { testWorld } from './test-world';
import { nearestFriendly, Wingman, WING_HP, WING_RESPAWN } from './wingman';
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
	it('holds formation on the leader while covering', () => {
		const { w, p, wing } = setup(600);
		let worst = 0;
		run(w, 14, () => {
			if (w.time > 4) worst = Math.max(worst, Math.hypot(p.x - wing.x, p.y - wing.y));
		});
		expect(wing.active).toBe(true);
		expect(wing.order).toBe('cover');
		expect(worst).toBeLessThan(140);
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
		expect(wing.order).toBe('cover');
		expect(wing.target).toBeNull();
	});

	it('refuses an attack order without a target', () => {
		const { w, wing } = setup();
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		expect(wing.command(w, 'attack', null)).toBe(false);
		expect(wing.order).toBe('cover');
		expect(said.join()).toContain('NO TARGET');
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
		expect(wing.order).toBe('cover');
		expect(wing.command(w, 'sams')).toBe(false);
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

	it('goes down under fire and a replacement comes back later', () => {
		const { w, wing } = setup(900);
		const said: string[] = [];
		w.events = { ...w.events, message: (t) => said.push(t) };
		wing.hit(w, WING_HP + 1);
		expect(wing.dying).toBe(true);
		expect(said).toContain('WINGMAN DOWN');
		run(w, 20, () => !wing.alive);
		expect(wing.alive).toBe(false);
		expect(wing.command(w, 'cover')).toBe(false);
		run(w, WING_RESPAWN + 0.5);
		expect(wing.active).toBe(true);
		expect(wing.hp).toBe(WING_HP);
		expect(said.join()).toContain('BACK ON STATION');
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
