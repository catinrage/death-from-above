import { describe, expect, it } from 'vitest';
import { WORLD } from './constants';
import { Player } from './player';
import { testWorld } from './test-world';
import { MISSIONS } from './campaign';
import { Tutorial, type TutorialInput } from './tutorial';
import type { World } from './world';

const IDLE: TutorialInput = { focus: false, confirm: false, skip: false };
const DT = 1 / 60;

function setup(): { w: World; t: Tutorial; p: Player } {
	const w = testWorld();
	const p = new Player('kestrel', WORLD.runwayMinX + 40, w.ground(70) + 45, 0.08);
	w.player = p;
	const t = new Tutorial();
	t.start(w);
	return { w, t, p };
}

/** Runs the tutorial until the "well done" pause hands over to the next lesson. */
function settle(w: World, t: Tutorial, inp: TutorialInput = IDLE): void {
	for (let i = 0; i < 180; i++) t.update(w, DT, inp);
}

function lessonTitled(w: World, t: Tutorial, title: string): void {
	for (let guard = 0; t.lesson.title !== title && guard < 20; guard++)
		t.update(w, DT, { ...IDLE, skip: true, confirm: true });
	expect(t.lesson.title).toBe(title);
}

describe('Tutorial', () => {
	it('waits on the welcome card until the pilot continues', () => {
		const { w, t } = setup();
		settle(w, t);
		expect(t.index).toBe(0);
		expect(t.card()).toMatchObject({ step: 1, manual: true });
		// Pad A drops bombs, so only a lesson that waits for it may be confirmed with it.
		t.update(w, DT, { ...IDLE, confirm: true });
		expect(t.index).toBe(1);
		t.update(w, DT, { ...IDLE, confirm: true });
		expect(t.index).toBe(1);
	});

	it('passes the climb lesson from the aircraft altitude', () => {
		const { w, t, p } = setup();
		t.update(w, DT, { ...IDLE, confirm: true });
		expect(t.lesson.title).toBe('Climb');
		p.y = w.ground(p.x) + 60;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBeCloseTo(0.5, 1);
		p.y = w.ground(p.x) + 200;
		t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
		settle(w, t);
		expect(t.lesson.title).toBe('Turn around');
	});

	it('needs a full reversal for the turn lesson', () => {
		const { w, t, p } = setup();
		lessonTitled(w, t, 'Turn around');
		p.vx = 60;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBe(0);
		p.vx = -60;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBe(0.5);
		p.vx = 60;
		t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
	});

	it('places targets that hold position, and passes when they are destroyed', () => {
		const { w, t } = setup();
		lessonTitled(w, t, 'Guns');
		const targets = w.units.filter((u) => t.targets.includes(u.id));
		expect(targets).toHaveLength(4);
		const x0 = targets.map((u) => u.x);
		for (let i = 0; i < 120; i++) {
			t.update(w, DT, IDLE);
			for (const u of w.units) u.x += u.speed * u.dir * DT;
		}
		targets.forEach((u, i) => expect(Math.abs(u.x - x0[i])).toBeLessThan(0.5));
		targets[0].alive = false;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBeCloseTo(0.25);
		for (const u of targets) u.alive = false;
		t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
	});

	it('only credits the bombing lesson once a bomb has been dropped', () => {
		const { w, t, p } = setup();
		lessonTitled(w, t, 'Bombs');
		t.update(w, DT, IDLE);
		for (const u of w.units) if (t.targets.includes(u.id)) u.alive = false;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBe(0);
		p.ammo.gp--;
		t.update(w, DT, IDLE);
		expect(t.bombs).toBe(1);
		expect(t.card().passed).toBe(true);
	});

	it('clears leftover targets when a lesson is skipped', () => {
		const { w, t } = setup();
		lessonTitled(w, t, 'Guns');
		const left = [...t.targets];
		t.update(w, DT, { ...IDLE, skip: true });
		expect(t.lesson.title).toBe('Bombs');
		for (const id of left) expect(w.units.find((u) => u.id === id)?.remove).toBe(true);
	});

	it('teaches flares with a missile trooper who is replaced until he fires', () => {
		const { w, t, p } = setup();
		lessonTitled(w, t, 'Flares');
		const trooper = w.units.find((u) => t.targets.includes(u.id))!;
		expect(trooper.def.kind).toBe('manpads');
		trooper.alive = false;
		t.update(w, DT, IDLE);
		expect(w.units.some((u) => u.alive && u.def.kind === 'manpads')).toBe(true);
		const missile = { alive: true, target: p as object | null };
		w.missiles.push(missile as never);
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBe(0.5);
		missile.target = { x: 0, y: 0 };
		t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
	});

	it('times the afterburner, airbrake and rearm lessons', () => {
		const { w, t, p } = setup();
		lessonTitled(w, t, 'Afterburner and airbrake');
		p.boosting = true;
		settle(w, t);
		expect(t.boostTime).toBeGreaterThan(1);
		p.boosting = false;
		p.brakeLevel = 1;
		for (let i = 0; i < 60 && !t.card().passed; i++) t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
		settle(w, t);
		expect(t.lesson.title).toBe('Rearm');
		p.rearming = true;
		for (let i = 0; i < 200 && !t.card().passed; i++) t.update(w, DT, IDLE);
		expect(t.card().passed).toBe(true);
	});

	it('counts focus and missiles for the targeting lessons', () => {
		const { w, t, p } = setup();
		lessonTitled(w, t, 'Guided missiles');
		t.update(w, DT, IDLE);
		p.missiles--;
		t.update(w, DT, IDLE);
		expect(t.card().progress).toBeCloseTo(0.25);
		lessonTitled(w, t, 'Focus');
		t.update(w, DT, { ...IDLE, focus: true });
		expect(t.card().progress).toBeCloseTo(0.2);
	});

	it('finishes after the last card', () => {
		const { w, t } = setup();
		lessonTitled(w, t, 'Ready for duty');
		expect(t.card().step).toBe(t.total);
		t.update(w, DT, { ...IDLE, confirm: true });
		expect(t.finished).toBe(true);
		t.update(w, DT, { ...IDLE, confirm: true });
		expect(t.finished).toBe(true);
	});
});

describe('wingman lesson', () => {
	it('brings Two in and passes once he is sent in and called back', () => {
		const w = testWorld();
		const p = new Player('kestrel', 600, w.ground(600) + 120, 0);
		w.player = p;
		w.wingman = null;
		const t = new Tutorial();
		t.start(w);
		while (t.card().title !== 'Wingman')
			t.update(w, 1 / 60, { focus: false, confirm: true, skip: true });
		expect(w.wingman).not.toBeNull();
		const wing = w.wingman!;
		const step = t.card().step;
		const jeep = w.units.find((u) => u.alive && u.def.kind === 'jeep') ?? null;
		expect(wing.command(w, 'attack', { unit: jeep, air: null })).toBe(true);
		t.update(w, 1 / 60, { focus: false, confirm: false, skip: false });
		expect(t.card().progress).toBeCloseTo(0.5);
		wing.command(w, 'cover', null);
		for (let i = 0; i < 200; i++)
			t.update(w, 1 / 60, { focus: false, confirm: false, skip: false });
		expect(t.card().step).toBe(step + 1);
	});
});

describe('campaign wingman', () => {
	it('flies the opening mission solo and Two joins from the second', () => {
		expect(MISSIONS[0].solo).toBe(true);
		expect(MISSIONS.slice(1).every((m) => !m.solo)).toBe(true);
	});
});
