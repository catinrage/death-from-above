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
import { WaveDirector } from './waves';

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
		const waves = new WaveDirector(1, m.waves);
		const status = t.status(waves);
		expect(status[0]).toMatchObject({ label: 'Destroy tanks', count: '2/6', done: false });
		expect(t.complete(waves)).toBe(false);
	});

	it('counts downed aircraft and a dropped bridge span', () => {
		const w = testWorld();
		const t = new MissionTracker(MISSIONS.find((x) => x.id === 'contested-skies')!);
		const a = new AirUnit(w.newId(), 'heli', 1500, 80);
		w.air.push(a);
		t.update(w);
		expect(t.count(['heli'])).toBe(0);
		a.dying = true;
		t.update(w);
		expect(t.count(['fighter', 'heli'])).toBe(1);
		const b = new MissionTracker(MISSIONS.find((x) => x.id === 'the-crossing')!);
		b.update(w);
		expect(b.bridgeDown).toBe(false);
	});

	it('completes when every objective is met', () => {
		const w = testWorld();
		const m = MISSIONS[0];
		const t = new MissionTracker(m);
		const waves = new WaveDirector(1, m.waves);
		t.update(w);
		expect(t.complete(waves)).toBe(false);
		waves.cleared = 2;
		expect(t.complete(waves)).toBe(true);
		expect(t.status(waves)[0].count).toBe('2/2 waves');
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
		const floor = t.status(new WaveDirector(1, m.waves)).at(-1)!;
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
