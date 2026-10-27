import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER, AIRCRAFT } from './defs-aircraft';
import {
	ALLOWED,
	MAX_COUNT,
	adjust,
	canAdd,
	capacityOf,
	sanitize,
	stockLoadout,
	weightOf
} from './loadout';
import { Player } from './player';

describe('loadout editor rules', () => {
	it('fits every stock loadout exactly and only with allowed weapons', () => {
		for (const id of AIRCRAFT_ORDER) {
			const stock = AIRCRAFT[id].loadout;
			expect(weightOf(stock)).toBe(capacityOf(id));
			for (const [b, n] of Object.entries(stock)) {
				expect(ALLOWED[id]).toContain(b);
				expect(n).toBeLessThanOrEqual(MAX_COUNT[b as keyof typeof MAX_COUNT]);
			}
		}
	});

	it('trades payload: removing bombs frees room for something heavier', () => {
		let l = stockLoadout('kestrel');
		expect(canAdd('kestrel', l, 'penetrator')).toBe(false);
		for (let i = 0; i < 3; i++) l = adjust('kestrel', l, 'gp', -1);
		expect(canAdd('kestrel', l, 'penetrator')).toBe(true);
		l = adjust('kestrel', l, 'penetrator', 1);
		expect(l.penetrator).toBe(1);
		expect(weightOf(l)).toBeLessThanOrEqual(capacityOf('kestrel'));
		expect(adjust('kestrel', l, 'nuke', 1)).toBe(l);
	});

	it('never goes below zero and drops empty entries', () => {
		const l = adjust('f16', { gp: 1 }, 'gp', -1);
		expect(l).toEqual({});
		expect(adjust('f16', l, 'gp', -1)).toBe(l);
	});

	it('rejects tampered or illegal saved loadouts', () => {
		expect(sanitize('wraith', { nuke: 5 })).toEqual(stockLoadout('wraith'));
		expect(sanitize('wraith', { thunder: 1 })).toEqual(stockLoadout('wraith'));
		expect(sanitize('wraith', 'junk')).toEqual(stockLoadout('wraith'));
		expect(sanitize('wraith', { gp: 2.5 })).toEqual(stockLoadout('wraith'));
		expect(sanitize('wraith', { gp: 4, nuke: 1 })).toEqual({ gp: 4, nuke: 1 });
	});

	it('arms the aircraft with the custom loadout', () => {
		const p = new Player('a10', 0, 100, 0, { gp: 2, para: 3 });
		expect(p.carried).toEqual(['gp', 'para']);
		expect(p.ammo.para).toBe(3);
		expect(p.ammo.cluster).toBe(0);
	});
});
