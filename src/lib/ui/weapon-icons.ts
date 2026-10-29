import type { BombId } from '$lib/game/types';

/**
 * Hand-authored side-profile silhouettes for the weapon rack. Every icon lives
 * in a 48x24 viewBox with the nose pointing right (direction of flight).
 *
 * Shape kinds:
 * - `body`  solid fill in currentColor (the weapon's rack colour)
 * - `line`  1.4px stroke in currentColor (rigging, emanations)
 * - `mark`  dark fill painted over a body (bands, insignia, cut-outs)
 */
export type WeaponIconId = BombId | 'aam';
export type IconShapeKind = 'body' | 'line' | 'mark';

export interface IconShape {
	readonly kind: IconShapeKind;
	readonly d: string;
	readonly opacity?: number;
}

export const ICON_VIEWBOX = '0 0 48 24';

export const body = (d: string, opacity?: number): IconShape => ({ kind: 'body', d, opacity });
export const line = (d: string, opacity?: number): IconShape => ({ kind: 'line', d, opacity });
export const mark = (d: string): IconShape => ({ kind: 'mark', d });

const round = (n: number): number => Math.round(n * 100) / 100;

/** Annular sector (radiation-trefoil blade) as a closed path. */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
	const rad = (deg: number): number => (deg * Math.PI) / 180;
	const pt = (r: number, a: number): string =>
		`${round(cx + r * Math.cos(rad(a)))} ${round(cy + r * Math.sin(rad(a)))}`;
	return (
		`M${pt(r0, a0)} L${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} ` +
		`L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`
	);
}

function trefoil(cx: number, cy: number, r0: number, r1: number): IconShape[] {
	const blades = [-120, 0, 120].map((a) => mark(sector(cx, cy, r0, r1, a - 30 - 90, a + 30 - 90)));
	return [...blades, mark(`M${cx - 1} ${cy}a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z`)];
}

/** Classic low-drag bomb profile shared by several stores. */
const BOMB_BODY =
	'M10 12C10 8.6 14 7 22 7H32C39 7 43 9.4 44.5 12C43 14.6 39 17 32 17H22C14 17 10 15.4 10 12Z';
const BOMB_TAIL = 'M11 10.4L5 9.2V14.8L11 13.6Z';
const BOMB_FINS = ['M3 4.5H8.5L12.5 10H7.5Z', 'M3 19.5H8.5L12.5 14H7.5Z'];

export const WEAPON_ICONS: Readonly<Record<WeaponIconId, readonly IconShape[]>> = {
	gp: [
		body(BOMB_BODY),
		body(BOMB_TAIL),
		...BOMB_FINS.map((d) => body(d)),
		mark('M33 7.3H34.6V16.7H33Z'),
		mark('M36.4 7.8H37.4V16.2H36.4Z')
	],
	cluster: [
		body('M12 8H34C40 8 44 10 45 12C44 14 40 16 34 16H12Z'),
		body('M12 9L6 7.5V16.5L12 15Z'),
		body('M3 5H8L11 9H6Z'),
		body('M3 19H8L11 15H6Z'),
		mark('M15 8.4H31V15.6H15Z'),
		body('M17 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z'),
		body('M22 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z'),
		body('M27 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z'),
		body('M18.6 20.4a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z', 0.8),
		body('M25 21.6a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z', 0.6),
		body('M13.2 19.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0Z', 0.45)
	],
	napalm: [
		body(
			'M5 12C7.5 8.3 14 7 22 7H31C38.5 7 43.5 9 46 12C43.5 15 38.5 17 31 17H22C14 17 7.5 15.7 5 12Z'
		),
		body('M7 10.6L2.5 6.5H6L10 9.6Z'),
		mark(
			'M24 16C20.6 14.6 20.6 11.4 23.4 8.4C23.4 10.6 25.4 11 25.6 13C26.6 12 26.8 10.8 26.4 9.8C28.6 11.6 28.8 14.6 24 16Z'
		)
	],
	penetrator: [
		body('M9 12C9 10.4 10.6 9.6 14 9.6H37L46.5 12L37 14.4H14C10.6 14.4 9 13.6 9 12Z'),
		body('M10 10.8L5 10V14L10 13.2Z'),
		body('M2.5 6H7.5L11.5 10.2H7Z'),
		body('M2.5 18H7.5L11.5 13.8H7Z'),
		mark('M36.2 9.9H37.4V14.1H36.2Z'),
		mark('M20 9.9H21V14.1H20Z')
	],
	guided: [
		body(
			'M11 12C11 9.2 14 8 19 8H35C40.5 8 44 10 45.5 12C44 14 40.5 16 35 16H19C14 16 11 14.8 11 12Z'
		),
		body('M12 10.4L6 9.4V14.6L12 13.6Z'),
		body('M2 3.5H7.5L13.5 9.4H8.5Z'),
		body('M2 20.5H7.5L13.5 14.6H8.5Z'),
		body('M33 8.2L36 4H38.6L38 8.2Z'),
		body('M33 15.8L36 20H38.6L38 15.8Z'),
		mark('M39.6 9.1H40.6V14.9H39.6Z'),
		mark('M19 8.3H20.4V15.7H19Z')
	],
	thunder: [
		body(
			'M13 12C13 6.8 18.5 4.5 26 4.5H32C40 4.5 45 8 46.5 12C45 16 40 19.5 32 19.5H26C18.5 19.5 13 17.2 13 12Z'
		),
		body('M14 8.8L6.5 7.8V16.2L14 15.2Z'),
		body('M1.5 1.5H8.5L15 8H8.5Z'),
		body('M1.5 22.5H8.5L15 16H8.5Z'),
		body('M1.5 10.8H7V13.2H1.5Z'),
		mark('M30 4.8H32V19.2H30Z'),
		mark('M34.5 5H36V19H34.5Z')
	],
	chemical: [
		body(BOMB_BODY),
		body(BOMB_TAIL),
		...BOMB_FINS.map((d) => body(d)),
		mark('M27 7.6L32.4 16.4H21.6Z'),
		body('M26.4 10.4H27.6L27.4 13.6H26.6Z'),
		body('M26.4 14.8a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0Z')
	],
	emp: [
		body(
			'M8 12C8 8.8 12 7.4 19 7.4H29C35.5 7.4 39 9.4 40.5 12C39 14.6 35.5 16.6 29 16.6H19C12 16.6 8 15.2 8 12Z'
		),
		body('M9 10.6L3.5 9.4V14.6L9 13.4Z'),
		body('M1.5 5H6.5L10 9.8H5.5Z'),
		body('M1.5 19H6.5L10 14.2H5.5Z'),
		mark('M26.5 7.8L19.6 12.6H23.4L20.6 16.2L28.4 11.2H24.6Z'),
		line('M42.5 8.5C44 10.5 44 13.5 42.5 15.5'),
		line('M45 6C47.4 9.4 47.4 14.6 45 18', 0.6)
	],
	cruise: [
		body('M7 10.4H38C42 10.4 45 11 46.5 12C45 13 42 13.6 38 13.6H7Z'),
		body('M7 10.6L3.5 4.5H6.8L11.5 10.4Z'),
		body('M7 13.4L4.5 18H7.6L11 13.6Z'),
		body('M20 12.4H27L17.5 20H14.5Z'),
		body('M11 13.4H16L15 15.6H11.6Z'),
		mark('M7 10.7H7.8V13.3H7Z')
	],
	ballistic: [
		body('M9 9H33C39.5 9 43.8 10.6 46.5 12C43.8 13.4 39.5 15 33 15H9Z'),
		body('M9.5 9L5 2.5H9.5L15 9Z'),
		body('M9.5 15L5 21.5H9.5L15 15Z'),
		body('M8.5 10.2L1.5 12L8.5 13.8Z', 0.55),
		mark('M22 9.2H23.2V14.8H22Z'),
		mark('M33 9.3H34V14.7H33Z')
	],
	para: [
		body(
			'M7 10C7.6 4.4 15 1.2 24 1.2S40.4 4.4 41 10C38.2 8.6 34.8 8.6 32.5 10C30 8.6 27 8.6 24 10C21 8.6 18 8.6 15.5 10C13.2 8.6 9.8 8.6 7 10Z'
		),
		line('M7.6 10L21.5 18.6M15.5 10L22.6 18.4M32.5 10L25.4 18.4M40.4 10L26.5 18.6', 0.8),
		body('M20.5 18.2H27.5V23H20.5Z'),
		mark('M20.8 20.2H27.2V20.9H20.8Z')
	],
	nuke: [
		body('M13 12C13 6.2 19.5 4 28 4C38 4 44.5 7.4 44.5 12S38 20 28 20C19.5 20 13 17.8 13 12Z'),
		body('M14 8.4L6.5 6.5V17.5L14 15.6Z'),
		body('M2 4H8V5.6H3.6V18.4H8V20H2Z'),
		...trefoil(28.5, 12, 2.3, 6.4)
	],
	rockets: [
		body(
			'M8 6.5H35C37 6.5 38 7.5 38 9V15C38 16.5 37 17.5 35 17.5H8C6 17.5 4.5 16 4.5 12S6 6.5 8 6.5Z'
		),
		body('M15 3.6H25L23.5 6.5H16.5Z'),
		body('M38 7.4H42L46 8.8L42 10.2H38Z'),
		body('M38 10.6H42L46 12L42 13.4H38Z', 0.85),
		body('M38 13.8H42L46 15.2L42 16.6H38Z'),
		mark('M11 6.8H12.2V17.2H11Z'),
		mark('M31 6.8H32.2V17.2H31Z')
	],
	arm: [
		body('M6 10.2H36C41 10.2 44.4 11 46.5 12C44.4 13 41 13.8 36 13.8H6Z'),
		body('M15 10.4H29L29 6.2Z'),
		body('M15 13.6H29L29 17.8Z'),
		body('M6 10.4L5 4.8H8.4L12.5 10.4Z'),
		body('M6 13.6L5 19.2H8.4L12.5 13.6Z'),
		line('M38 7.6C39.2 6.6 40.8 6.6 42 7.6'),
		line('M36.4 5.6C38.6 3.6 41.4 3.6 43.6 5.6', 0.65),
		body('M39.4 8.6a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0Z')
	],
	gunpod: [
		body('M9 7H30C35 7 38 9.4 39 12C38 14.6 35 17 30 17H9C6.5 17 5 15 5 12S6.5 7 9 7Z'),
		body('M14 3.8H25L23.5 7H15.5Z'),
		body('M38 10.2H46.5V11.4H38Z'),
		body('M38 12.6H45.5V13.8H38Z'),
		mark('M18 9.6H19V14.4H18ZM21 9.6H22V14.4H21ZM24 9.6H25V14.4H24Z')
	],
	stick: [
		body(
			'M4 9.6C4 8 6 7.2 9.5 7.2H14C17.5 7.2 19.4 8.4 20 9.6C19.4 10.8 17.5 12 14 12H9.5C6 12 4 11.2 4 9.6Z'
		),
		body(
			'M15 14.4C15 12.8 17 12 20.5 12H25C28.5 12 30.4 13.2 31 14.4C30.4 15.6 28.5 16.8 25 16.8H20.5C17 16.8 15 16 15 14.4Z'
		),
		body(
			'M26 19.2C26 17.6 28 16.8 31.5 16.8H36C39.5 16.8 41.4 18 42 19.2C41.4 20.4 39.5 21.6 36 21.6H31.5C28 21.6 26 20.8 26 19.2Z'
		),
		body('M2.5 6.8L5 8.4V10.8L2.5 12.4Z'),
		body('M13.5 11.6L16 13.2V15.6L13.5 17.2Z'),
		body('M24.5 16.4L27 18V20.4L24.5 22Z')
	],
	frag: [
		body(
			'M12 12C12 9 15 7.6 21 7.6H29C35 7.6 38.5 9.6 40 12C38.5 14.4 35 16.4 29 16.4H21C15 16.4 12 15 12 12Z'
		),
		body('M13 10.4L7 9.4V14.6L13 13.6Z'),
		body('M4 5H9L12.5 9.6H7.5Z'),
		body('M4 19H9L12.5 14.4H7.5Z'),
		body('M40 11.4H46.5V12.6H40Z'),
		mark('M24 7.9H25.6V16.1H24Z'),
		line('M43 15.5L45 19M38.5 17.5L39.5 21.5M46 13.5L47.5 16', 0.7)
	],
	skip: [
		body('M10 5.5H34C36.5 5.5 38 8 38 12S36.5 18.5 34 18.5H10C7.5 18.5 6 16 6 12S7.5 5.5 10 5.5Z'),
		mark('M10.5 5.8H12V18.2H10.5ZM32 5.8H33.5V18.2H32Z'),
		line('M40 20C41.5 16 43 16 44.5 20', 0.8),
		line('M44.5 20C45.4 17.8 46.3 17.8 47.2 20', 0.55)
	],
	glide: [
		body(
			'M8 12C8 10.2 10.5 9.4 15 9.4H36C41 9.4 44.4 10.6 46 12C44.4 13.4 41 14.6 36 14.6H15C10.5 14.6 8 13.8 8 12Z'
		),
		body('M18 10L30 2.5H33.5L26 10Z'),
		body('M18 14L30 21.5H33.5L26 14Z', 0.6),
		body('M9 10.6L3 6H6.6L11.5 9.6Z'),
		body('M9 13.4L3 18H6.6L11.5 14.4Z'),
		mark('M36.5 9.6H37.7V14.4H36.5Z')
	],
	hunter: [
		body(
			'M10 12C10 8.6 13.5 7 20 7H33C39 7 42.5 9.4 44 12C42.5 14.6 39 17 33 17H20C13.5 17 10 15.4 10 12Z'
		),
		body('M11 10.4L5 9.2V14.8L11 13.6Z'),
		body('M3 4.5H8.5L12.5 10H7.5Z'),
		body('M3 19.5H8.5L12.5 14H7.5Z'),
		mark('M24 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z'),
		body('M26.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z'),
		mark('M27.6 7.4H28.4V9.4H27.6ZM27.6 14.6H28.4V16.6H27.6Z')
	],
	mines: [
		body('M4 15C4 13 8 12 14 12S24 13 24 15V17H4Z'),
		body('M11 10.6H17V12.2H11Z'),
		body('M26 15C26 13 30 12 36 12S46 13 46 15V17H26Z'),
		body('M33 10.6H39V12.2H33Z'),
		mark('M4.2 15.6H23.8V16.2H4.2ZM26.2 15.6H45.8V16.2H26.2Z'),
		line('M2 19.5H47', 0.5)
	],
	cryo: [
		body(BOMB_BODY),
		body(BOMB_TAIL),
		...BOMB_FINS.map((d) => body(d)),
		mark('M26.5 8.2H27.5V15.8H26.5Z'),
		mark('M23.4 9.8L30.6 14.2L30.1 15L22.9 10.6Z'),
		mark('M23.4 14.2L30.6 9.8L30.1 9L22.9 13.4Z')
	],
	tesla: [
		body(
			'M10 12C10 9 13.5 7.8 19 7.8H33C38.5 7.8 41.5 9.6 43 12C41.5 14.4 38.5 16.2 33 16.2H19C13.5 16.2 10 15 10 12Z'
		),
		body('M11 10.6L5 9.4V14.6L11 13.4Z'),
		body('M3 5H8.5L12 9.8H7Z'),
		body('M3 19H8.5L12 14.2H7Z'),
		mark('M19 8H20.2V16H19ZM22 8H23.2V16H22ZM25 8H26.2V16H25ZM28 8H29.2V16H28Z'),
		line('M43.5 12L45 9L44 7.5L47 4', 0.9),
		line('M43.5 12L45.5 14.5L44.5 16.5L47 20', 0.65)
	],
	aam: [
		body('M5 10.9H39C42.4 10.9 45 11.4 47 12C45 12.6 42.4 13.1 39 13.1H5Z'),
		body('M5 11L3.5 5.5H7L11.5 11Z'),
		body('M5 13L3.5 18.5H7L11.5 13Z'),
		body('M33 11L34.4 7.6H36.4L37.2 11Z'),
		body('M33 13L34.4 16.4H36.4L37.2 13Z'),
		body('M4.6 11.4L1 12L4.6 12.6Z', 0.55),
		mark('M40.5 11.1H41.3V12.9H40.5Z')
	]
};

export function weaponIcon(id: WeaponIconId): readonly IconShape[] {
	return WEAPON_ICONS[id];
}
