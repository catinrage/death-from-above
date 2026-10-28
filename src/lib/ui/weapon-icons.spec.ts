import { describe, expect, it } from 'vitest';
import { BOMBS } from '$lib/game/defs-bombs';
import { ICON_VIEWBOX, WEAPON_ICONS, weaponIcon, type WeaponIconId } from './weapon-icons';

const PATH_RE = /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s-]+$/;

describe('weapon icons', () => {
	it('has an icon for every bomb def', () => {
		for (const id of Object.keys(BOMBS)) {
			expect(WEAPON_ICONS[id as WeaponIconId], id).toBeDefined();
		}
	});

	it('covers the air-to-air missile slot', () => {
		expect(weaponIcon('aam').length).toBeGreaterThan(0);
	});

	it('every icon has a filled body and valid path data', () => {
		for (const [id, shapes] of Object.entries(WEAPON_ICONS)) {
			expect(
				shapes.some((s) => s.kind === 'body'),
				id
			).toBe(true);
			for (const s of shapes) {
				expect(s.d, id).toMatch(PATH_RE);
				expect(s.d).not.toMatch(/NaN|undefined/);
			}
		}
	});

	it('icons are visually distinct', () => {
		const sigs = Object.values(WEAPON_ICONS).map((shapes) => shapes.map((s) => s.d).join('|'));
		expect(new Set(sigs).size).toBe(sigs.length);
	});

	it('uses a 2:1 side-profile viewBox', () => {
		expect(ICON_VIEWBOX).toBe('0 0 48 24');
	});
});
