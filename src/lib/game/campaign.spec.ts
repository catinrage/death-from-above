import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	isUnlocked,
	loadProgress,
	MISSIONS,
	MissionTracker,
	missionById,
	nextMission,
	recordMission,
	sanitizeProgress,
	saveProgress,
	starsFor
} from './campaign';
import { AirUnit } from './enemy-air';
import { testWorld } from './test-world';
import { UNITS } from './defs-units';
import { planWave } from './waves';

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (k) => data.get(k) ?? null,
		key: (i) => [...data.keys()][i] ?? null,
		removeItem: (k) => void data.delete(k),
		setItem: (k, v) => void data.set(k, String(v))
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('missions', () => {
	it('have unique ids and only target real enemies', () => {
		const ids = new Set(MISSIONS.map((m) => m.id));
		expect(ids.size).toBe(MISSIONS.length);
		for (const m of MISSIONS) {
			expect(m.env.length).toBeGreaterThan(0);
			for (const o of m.objectives) {
				if (o.type !== 'destroy') continue;
				for (const k of o.kinds) expect(k === 'fighter' || k === 'heli' || k in UNITS).toBe(true);
			}
		}
	});

	it('get harder as the campaign goes on', () => {
		const strength = MISSIONS.map((m) => (m.waves.offset ?? 0) + m.waves.last);
		for (let i = 1; i < strength.length; i++)
			expect(strength[i]).toBeGreaterThanOrEqual(strength[i - 1]);
	});

	it('chain one after another', () => {
		expect(missionById('first-light')?.name).toBe('First Light');
		expect(nextMission('first-light')?.id).toBe(MISSIONS[1].id);
		expect(nextMission(MISSIONS[MISSIONS.length - 1].id)).toBeUndefined();
		expect(missionById('nope')).toBeUndefined();
	});
});

describe('mission objectives', () => {
	it('always fields enough targets to meet every destroy goal', () => {
		for (const m of MISSIONS) {
			for (const o of m.objectives) {
				if (o.type !== 'destroy') continue;
				for (let seed = 1; seed <= 200; seed++) {
					let n = 0;
					for (let wave = 1; wave <= m.waves.last; wave++) {
						// A field already full of emplacements: only guaranteed ones get dug in.
						const plan = planWave(
							wave + (m.waves.offset ?? 0),
							seed,
							99,
							null,
							m.waves.tweaks?.(wave) ?? {},
							wave === 1 ? (m.waves.statics ?? []) : []
						);
						n += plan.orders.filter((s) => (o.kinds as string[]).includes(s.kind)).length;
						n += plan.statics.filter((s) => o.kinds.includes(s.kind)).length;
					}
					expect(n, `${m.id}: ${o.label}, seed ${seed}`).toBeGreaterThanOrEqual(o.count);
				}
			}
		}
	});
});

describe('MissionTracker', () => {
	it('counts destroyed enemies by kind, whatever killed them', () => {
		const w = testWorld();
		const m = MISSIONS.find((x) => x.id === 'iron-column')!;
		const t = new MissionTracker(m);
		const tanks = [0, 1, 2].map((i) => w.spawnUnit('tank', 1200 + i * 30, 0));
		w.spawnUnit('jeep', 1400, 0);
		tanks[0].alive = false;
		tanks[1].alive = false;
		t.update(w);
		t.update(w);
		expect(t.count(['tank'])).toBe(2);
		expect(t.count(['jeep'])).toBe(0);
		const status = t.status();
		expect(status[0]).toMatchObject({ label: 'Destroy tanks', count: '2/6', done: false });
		expect(t.complete()).toBe(false);
	});

	it('counts a unit that was cleared away in the same step it died', () => {
		const w = testWorld();
		const t = new MissionTracker(MISSIONS.find((x) => x.id === 'iron-column')!);
		const tank = w.spawnUnit('tank', 1200, 0);
		t.update(w);
		tank.alive = false;
		w.units.splice(w.units.indexOf(tank), 1);
		t.update(w);
		t.update(w);
		expect(t.count(['tank'])).toBe(1);
	});

	it('counts downed aircraft', () => {
		const w = testWorld();
		const t = new MissionTracker(MISSIONS.find((x) => x.id === 'contested-skies')!);
		const a = new AirUnit(w.newId(), 'heli', 1500, 80);
		w.air.push(a);
		t.update(w);
		expect(t.count(['heli'])).toBe(0);
		a.dying = true;
		t.update(w);
		expect(t.count(['fighter', 'heli'])).toBe(1);
	});

	it('completes when every objective is met', () => {
		const w = testWorld();
		const m = MISSIONS[0];
		const t = new MissionTracker(m);
		w.war.start(w, m.war);
		t.update(w);
		expect(t.complete()).toBe(false);
		w.war.hq.damage(w, w.war.hq.maxHp);
		t.update(w);
		expect(t.complete()).toBe(true);
		expect(t.status()[0]).toMatchObject({ label: 'Destroy the enemy HQ', done: true });
	});

	it('counts the most checkpoints held at once, even after some are lost', () => {
		const w = testWorld();
		const m = MISSIONS.find((x) => x.id === 'spearhead')!;
		const t = new MissionTracker(m);
		w.war.start(w, m.war);
		t.update(w);
		expect(t.status()[0]).toMatchObject({ count: '1/3', done: false });
		for (const c of w.war.checkpoints.slice(0, 3)) c.owner = 'player';
		t.update(w);
		w.war.checkpoints[2].owner = 'enemy';
		t.update(w);
		expect(t.status()[0]).toMatchObject({ count: '3/3', done: true });
	});

	it('ends every mission at the enemy HQ', () => {
		for (const m of MISSIONS) expect(m.objectives.some((o) => o.type === 'hq')).toBe(true);
	});

	it('fails when the airfield drops below the floor, even if it is repaired', () => {
		const w = testWorld();
		const m = MISSIONS.find((x) => x.baseFloor !== undefined)!;
		const t = new MissionTracker(m);
		t.update(w);
		expect(t.failed()).toBe(false);
		w.base.hp = w.base.maxHp * (m.baseFloor! - 0.05);
		t.update(w);
		w.base.hp = w.base.maxHp;
		t.update(w);
		expect(t.failed()).toBe(true);
		const floor = t.status().at(-1)!;
		expect(floor.failed).toBe(true);
	});
});

describe('campaign progress', () => {
	it('awards up to three stars', () => {
		expect(starsFor(1, 0)).toBe(3);
		expect(starsFor(0.5, 0)).toBe(2);
		expect(starsFor(0.9, 2)).toBe(2);
		expect(starsFor(0.2, 1)).toBe(1);
	});

	it('unlocks each mission after the one before it is won', () => {
		expect(isUnlocked({}, MISSIONS[0].id)).toBe(true);
		expect(isUnlocked({}, MISSIONS[1].id)).toBe(false);
		const p = recordMission({}, MISSIONS[0].id, 1, 500);
		expect(isUnlocked(p, MISSIONS[1].id)).toBe(true);
		expect(isUnlocked(p, MISSIONS[2].id)).toBe(false);
		expect(isUnlocked(p, 'unknown')).toBe(false);
	});

	it('keeps the best stars and score across replays', () => {
		let p = recordMission({}, 'first-light', 3, 400);
		p = recordMission(p, 'first-light', 1, 900);
		expect(p['first-light']).toEqual({ stars: 3, best: 900 });
	});

	it('sanitizes stored progress', () => {
		expect(sanitizeProgress(null)).toEqual({});
		expect(
			sanitizeProgress({
				'first-light': { stars: 7, best: 12.7 },
				'the-crossing': { stars: 0, best: 10 },
				bogus: { stars: 2, best: 1 },
				'iron-column': 'x'
			})
		).toEqual({ 'first-light': { stars: 3, best: 12 } });
	});

	it('saves and loads through localStorage, and survives without it', () => {
		expect(loadProgress()).toEqual({});
		saveProgress({ 'first-light': { stars: 2, best: 10 } });
		vi.stubGlobal('localStorage', memoryStorage());
		saveProgress({ 'first-light': { stars: 2, best: 10 } });
		expect(loadProgress()).toEqual({ 'first-light': { stars: 2, best: 10 } });
	});
});
