import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER } from './defs-aircraft';
import {
	ALLOWED,
	MAX_COUNT,
	WEIGHT,
	adjust,
	canAdd,
	capacityOf,
	sanitize,
	stockLoadout,
	weightOf
} from './loadout';
import { Player } from './player';
import {
	STAR_CREDITS,
	UPGRADES,
	buyUpgrade,
	endlessCredits,
	extraPayload,
	grant,
	levelOf,
	loadOrMigrate,
	loadProgression,
	missionCredits,
	newProgression,
	nextCost,
	payloadBonus,
	sanitizeProgression,
	saveProgression,
	upgradedDef
} from './progression';

afterEach(() => vi.unstubAllGlobals());

const rich = (): ReturnType<typeof newProgression> => grant(newProgression(), 100_000);

describe('hangar upgrades', () => {
	it('starts with no credits and no upgrades', () => {
		const p = newProgression();
		expect(p.credits).toBe(0);
		expect(p.upgrades).toEqual({});
	});

	it('lets every airframe be upgraded from the start', () => {
		const p = rich();
		for (const id of AIRCRAFT_ORDER)
			expect(levelOf(buyUpgrade(p, id, 'armor'), id, 'armor')).toBe(1);
	});

	it('steps upgrades through their levels and stops at max', () => {
		let p = rich();
		const u = UPGRADES.find((x) => x.id === 'armor')!;
		let spent = 0;
		for (let lv = 0; lv < u.costs.length; lv++) {
			expect(nextCost(p, 'kestrel', 'armor')).toBe(u.costs[lv]);
			p = buyUpgrade(p, 'kestrel', 'armor');
			spent += u.costs[lv];
			expect(levelOf(p, 'kestrel', 'armor')).toBe(lv + 1);
		}
		expect(nextCost(p, 'kestrel', 'armor')).toBeNull();
		expect(buyUpgrade(p, 'kestrel', 'armor')).toBe(p);
		expect(p.credits).toBe(100_000 - spent);
		// Upgrades are per aircraft.
		expect(levelOf(p, 'grizzly', 'armor')).toBe(0);
	});

	it('refuses unaffordable levels and missing rails', () => {
		const poor = newProgression();
		expect(buyUpgrade(poor, 'kestrel', 'armor')).toBe(poor);
		const bomber = rich();
		expect(AIRCRAFT.b1.missiles).toBe(0);
		expect(nextCost(bomber, 'b1', 'missiles')).toBeNull();
		expect(buyUpgrade(bomber, 'b1', 'missiles')).toBe(bomber);
		for (const id of AIRCRAFT_ORDER) {
			if (AIRCRAFT[id].gun) continue;
			expect(nextCost(rich(), id, 'guns')).toBeNull();
			expect(upgradedDef(AIRCRAFT[id], { guns: 3 }).gun).toBeNull();
		}
	});

	it('ignores non-positive grants', () => {
		const p = newProgression();
		expect(grant(p, 0)).toBe(p);
		expect(grant(p, -50)).toBe(p);
		expect(grant(p, NaN)).toBe(p);
		expect(grant(p, 12.9).credits).toBe(12);
	});
});

describe('upgraded airframes', () => {
	it('leaves the stock def untouched without upgrades', () => {
		expect(upgradedDef(AIRCRAFT.kestrel, undefined)).toBe(AIRCRAFT.kestrel);
	});

	it('scales armour, engine, guns, flares and missiles', () => {
		const base = AIRCRAFT.kestrel;
		const d = upgradedDef(base, { armor: 2, engine: 1, guns: 3, flares: 2, missiles: 1 });
		expect(d.hp).toBe(Math.round(base.hp * 1.24));
		expect(d.thrust).toBeCloseTo(base.thrust * 1.06);
		expect(d.boost).toBeCloseTo(base.boost * 1.06);
		expect(d.gun!.damage).toBeGreaterThan(base.gun!.damage);
		expect(d.gun!.heatPerShot).toBeLessThan(base.gun!.heatPerShot);
		expect(d.flares).toBe(base.flares + 2);
		expect(d.missiles).toBe(base.missiles + 1);
		// The shared table is not mutated.
		expect(AIRCRAFT.kestrel.hp).toBe(base.hp);
		expect(d.gun).not.toBe(base.gun);
	});

	it('feeds the upgraded stats into the flown aircraft', () => {
		const p = new Player('kestrel', 0, 100, 0, undefined, { armor: 3, flares: 1 });
		expect(p.hp).toBe(Math.round(AIRCRAFT.kestrel.hp * 1.36));
		expect(p.flares).toBe(AIRCRAFT.kestrel.flares + 1);
		expect(new Player('kestrel', 0, 100).hp).toBe(AIRCRAFT.kestrel.hp);
	});

	it('extra racks raise the payload budget the loadout editor allows', () => {
		expect(payloadBonus(29, undefined)).toBe(0);
		expect(payloadBonus(29, { payload: 1 })).toBe(3);
		expect(payloadBonus(10, { payload: 1 })).toBe(2);
		let checked = 0;
		for (const id of AIRCRAFT_ORDER) {
			const stock = stockLoadout(id);
			const p = buyUpgrade(rich(), id, 'payload');
			const extra = extraPayload(p, id);
			expect(extra).toBeGreaterThan(0);
			expect(capacityOf(id, extra)).toBe(capacityOf(id) + extra);
			// Something the racks can take one more of once the extra points are there.
			const bomb = ALLOWED[id].find(
				(b) => (stock[b] ?? 0) < MAX_COUNT[b] && WEIGHT[b] <= extra && !canAdd(id, stock, b)
			);
			if (!bomb) continue;
			expect(canAdd(id, stock, bomb, extra)).toBe(true);
			const bigger = adjust(id, stock, bomb, 1, extra);
			expect(weightOf(bigger)).toBe(weightOf(stock) + WEIGHT[bomb]);
			// The heavier loadout survives a reload with the upgrade, not without it.
			expect(sanitize(id, bigger, extra)).toEqual(bigger);
			expect(sanitize(id, bigger)).toEqual(stock);
			checked++;
		}
		expect(checked).toBeGreaterThan(AIRCRAFT_ORDER.length / 2);
	});
});

describe('earning credits', () => {
	it('pays more for later missions and new stars, not for repeated stars', () => {
		const first = missionCredits({ index: 0, won: true, score: 2500, stars: 3, prevStars: 0 });
		expect(first.total).toBe(100 + 100 + 3 * STAR_CREDITS);
		const replay = missionCredits({ index: 0, won: true, score: 2500, stars: 3, prevStars: 3 });
		expect(replay.total).toBe(200);
		expect(replay.lines.map((l) => l.label)).not.toContain('New stars ×0');
		const better = missionCredits({ index: 0, won: true, score: 2500, stars: 3, prevStars: 1 });
		expect(better.total - replay.total).toBe(2 * STAR_CREDITS);
		const late = missionCredits({ index: 7, won: true, score: 2500, stars: 1, prevStars: 1 });
		expect(late.total).toBeGreaterThan(replay.total);
	});

	it('pays a little for a failed mission', () => {
		const a = missionCredits({ index: 3, won: false, score: 5000, stars: 3, prevStars: 0 });
		expect(a.total).toBe(100);
		expect(missionCredits({ index: 3, won: false, score: 0, stars: 1, prevStars: 0 }).total).toBe(
			0
		);
	});

	it('pays endless runs for score and waves held, in whole credits', () => {
		const a = endlessCredits({ score: 1010, wavesCleared: 3 });
		expect(a.total).toBe(40 + 150);
		expect(a.lines.every((l) => Number.isInteger(l.amount))).toBe(true);
		expect(endlessCredits({ score: 0, wavesCleared: 0 })).toEqual({ lines: [], total: 0 });
	});
});

describe('saved progression', () => {
	it('drops malformed or impossible saves', () => {
		expect(sanitizeProgression(null)).toEqual(newProgression());
		expect(sanitizeProgression('junk')).toEqual(newProgression());
		const p = sanitizeProgression({
			credits: -5,
			earned: 'lots',
			owned: ['a10', 'spitfire', 7],
			upgrades: {
				a10: { armor: 99, guns: 1.7, bogus: 2 },
				wraith: { armor: 1 },
				b1: { missiles: 2 }
			}
		});
		expect(p.credits).toBe(0);
		// Saves from when airframes were bought keep their upgrades; the old fleet list is dropped.
		expect(p).not.toHaveProperty('owned');
		expect(p.upgrades.a10).toEqual({ armor: 3, guns: 1 });
		expect(p.upgrades.wraith).toEqual({ armor: 1 });
		// No rails on the bomber.
		expect(p.upgrades.b1).toBeUndefined();
	});

	it('round-trips through localStorage and degrades without it', () => {
		expect(loadProgression()).toEqual(newProgression());
		saveProgression(rich());
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		const p = buyUpgrade(rich(), 'f16', 'engine');
		saveProgression(p);
		expect(loadProgression()).toEqual(p);
		data.set('dfa.progression', '{not json');
		expect(loadProgression()).toEqual(newProgression());
	});

	it('pays older saves for their stars', () => {
		const data = new Map<string, string>([
			[
				'dfa.campaign',
				JSON.stringify({ 'first-light': { stars: 3, best: 900 }, 'the-crossing': { stars: 2 } })
			]
		]);
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		const p = loadOrMigrate();
		expect(p.credits).toBe(5 * STAR_CREDITS);
		// Once saved, the migration doesn't run again.
		saveProgression(grant(p, 10));
		expect(loadOrMigrate().credits).toBe(5 * STAR_CREDITS + 10);
	});
});
