import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSIONS, type CampaignProgress } from './campaign';
import {
	advance,
	canStrike,
	frontX,
	loadStrikes,
	missionX,
	sanitizeStrikes,
	saveStrike,
	SECTORS,
	sectorOf,
	sectorSpan,
	sectorState,
	STRIKE_IDS,
	withStrike
} from './campaign-map';
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

const won = (n: number): CampaignProgress =>
	Object.fromEntries(MISSIONS.slice(0, n).map((m) => [m.id, { stars: 1, best: 0 }]));

/** Everything a mission fields over all its waves, for one seed. */
function field(m: (typeof MISSIONS)[number], seed: number): string[] {
	const out: string[] = [];
	for (let wave = 1; wave <= m.waves.last; wave++) {
		const plan = planWave(
			wave + (m.waves.offset ?? 0),
			seed,
			99,
			null,
			m.waves.tweaks?.(wave) ?? {},
			wave === 1 ? (m.waves.statics ?? []) : []
		);
		out.push(...plan.orders.map((o) => o.kind), ...plan.statics.map((s) => s.kind));
	}
	return out;
}

describe('sectors', () => {
	it('cover every mission once, in campaign order', () => {
		expect(SECTORS.flatMap((s) => s.missions)).toEqual(MISSIONS.map((m) => m.id));
		for (const m of MISSIONS) expect(sectorOf(m.id)?.missions).toContain(m.id);
	});

	it('tile the map without gaps', () => {
		let x = 0;
		for (const s of SECTORS) {
			const [a, b] = sectorSpan(s);
			expect(a).toBeCloseTo(x);
			expect(b).toBeGreaterThan(a);
			x = b;
		}
		expect(x).toBeCloseTo(1);
	});

	it('place each mission inside its sector', () => {
		for (const s of SECTORS) {
			const [a, b] = sectorSpan(s);
			for (const id of s.missions) {
				expect(missionX(id)).toBeGreaterThan(a);
				expect(missionX(id)).toBeLessThan(b);
			}
		}
	});
});

describe('front line', () => {
	it('starts at the home airfield and reaches the far edge when the campaign is won', () => {
		expect(frontX({})).toBe(0);
		expect(frontX(won(MISSIONS.length))).toBe(1);
	});

	it('moves past each mission as it is won', () => {
		for (let n = 1; n <= MISSIONS.length; n++) {
			expect(advance(won(n))).toBe(n);
			expect(frontX(won(n))).toBeGreaterThan(missionX(MISSIONS[n - 1].id));
			if (n < MISSIONS.length) expect(frontX(won(n))).toBeLessThan(missionX(MISSIONS[n].id));
		}
	});

	it('only counts wins in a row from the start', () => {
		expect(advance({ [MISSIONS[2].id]: { stars: 3, best: 0 } })).toBe(0);
	});

	it('marks sectors behind it held, the one it runs through contested and the rest enemy', () => {
		expect(SECTORS.map((s) => sectorState(s, {}))).toEqual([
			'contested',
			'enemy',
			'enemy',
			'enemy',
			'enemy'
		]);
		// First Light won: the front sits at the edge of the river sector.
		expect(SECTORS.map((s) => sectorState(s, won(1)))).toEqual([
			'held',
			'contested',
			'enemy',
			'enemy',
			'enemy'
		]);
		expect(SECTORS.map((s) => sectorState(s, won(2)))[1]).toBe('contested');
		expect(SECTORS.every((s) => sectorState(s, won(MISSIONS.length)) === 'held')).toBe(true);
	});
});

describe('strikes', () => {
	it('are offered from the second mission on', () => {
		expect(canStrike(MISSIONS[0].id)).toBe(false);
		for (const m of MISSIONS.slice(1)) expect(canStrike(m.id)).toBe(true);
		expect(canStrike('nope')).toBe(false);
	});

	it('leave a mission alone when none is picked', () => {
		const m = MISSIONS[2];
		expect(withStrike(m, null)).toBe(m);
	});

	it('each thin out what they target', () => {
		const count = (ks: string[], of: string[]): number => ks.filter((k) => of.includes(k)).length;
		const sum = (id: string, strike: (typeof STRIKE_IDS)[number] | null, of: string[]): number => {
			const m = withStrike(
				MISSIONS.find((x) => x.id === id)!,
				strike
			);
			let n = 0;
			for (let seed = 1; seed <= 40; seed++) n += count(field(m, seed), of);
			return n;
		};
		const armour = ['tank', 'apc'];
		expect(sum('flak-alley', 'depot', armour)).toBeLessThan(sum('flak-alley', null, armour));
		const all = ['truck', 'jeep', 'tank', 'apc', 'spaag', 'sam', 'artillery', 'rifleman'];
		expect(sum('night-watch', 'bridge', all)).toBeLessThan(sum('night-watch', null, all) * 0.9);
		const air = ['sam', 'spaag', 'fighter', 'heli'];
		expect(sum('death-from-above', 'radar', air)).toBeLessThan(sum('death-from-above', null, air));
	});

	it('change nothing about a first wave when cutting reinforcements', () => {
		const m = MISSIONS[4];
		const hit = withStrike(m, 'bridge');
		expect(hit.waves.tweaks?.(1)).toEqual(m.waves.tweaks?.(1) ?? {});
	});

	it('keep every destroy goal reachable', () => {
		for (const strike of STRIKE_IDS) {
			for (const base of MISSIONS) {
				const m = withStrike(base, strike);
				for (const o of m.objectives) {
					if (o.type !== 'destroy') continue;
					for (let seed = 1; seed <= 100; seed++) {
						const n = count(field(m, seed), o.kinds);
						expect(n, `${m.id} + ${strike}: ${o.label}, seed ${seed}`).toBeGreaterThanOrEqual(
							o.count
						);
					}
				}
			}
		}
		function count(ks: string[], of: string[]): number {
			return ks.filter((k) => of.includes(k)).length;
		}
	});
});

describe('strike plan', () => {
	it('keeps only known strikes on missions that can take one', () => {
		expect(sanitizeStrikes(null)).toEqual({});
		expect(
			sanitizeStrikes({
				[MISSIONS[0].id]: 'depot',
				[MISSIONS[1].id]: 'radar',
				[MISSIONS[2].id]: 'nuke',
				ghost: 'depot'
			})
		).toEqual({ [MISSIONS[1].id]: 'radar' });
	});

	it('saves and clears picks', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		expect(loadStrikes()).toEqual({});
		saveStrike(MISSIONS[1].id, 'bridge');
		saveStrike(MISSIONS[3].id, 'depot');
		expect(loadStrikes()).toEqual({ [MISSIONS[1].id]: 'bridge', [MISSIONS[3].id]: 'depot' });
		saveStrike(MISSIONS[1].id, null);
		expect(loadStrikes()).toEqual({ [MISSIONS[3].id]: 'depot' });
	});

	it('survives broken storage', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => '{bad',
			setItem: () => {
				throw new Error('full');
			}
		});
		expect(loadStrikes()).toEqual({});
		expect(saveStrike(MISSIONS[1].id, 'radar')).toEqual({ [MISSIONS[1].id]: 'radar' });
	});
});
