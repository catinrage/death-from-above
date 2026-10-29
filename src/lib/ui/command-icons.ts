import type { CommandId } from '$lib/game/command';
import { body, line, mark, WEAPON_ICONS, type IconShape } from './weapon-icons';

/**
 * Side-profile silhouettes for the commander's order bar, drawn like the
 * weapon rack's (48x24, facing the enemy). Strikes reuse the weapon icons.
 */

/** A standing soldier centred on x, with a rifle held forward. */
function soldier(x: number): IconShape[] {
	return [
		body(`M${x - 2.2} 4.6a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z`),
		body(`M${x - 2.6} 7.8H${x + 2.6}L${x + 2.2} 15H${x - 2.2}Z`),
		body(
			`M${x - 2.2} 15L${x - 3.2} 22.5H${x - 1.3}L${x} 17.4L${x + 1.3} 22.5H${x + 3.2}L${x + 2.2} 15Z`
		),
		line(`M${x + 1} 10.6L${x + 8} 9.4`)
	];
}

const wheel = (x: number, y: number, r: number): IconShape =>
	body(`M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`);

const hub = (x: number, y: number): IconShape =>
	mark(`M${x - 1.2} ${y}a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z`);

/** A shell falling toward the bottom right. */
function shell(x: number, y: number): IconShape {
	return body(
		`M${x} ${y}L${x + 6} ${y + 3}C${x + 9} ${y + 4.6} ${x + 9} ${y + 7} ${x + 6.4} ${y + 6.6}L${x - 1.2} ${y + 3.2}Z`
	);
}

const ICONS: Record<CommandId, readonly IconShape[]> = {
	rifles: [...soldier(10), ...soldier(21), ...soldier(32)],
	antiTank: [
		...soldier(14).slice(0, 3),
		body('M7 7.2H29V9.6H7Z'),
		body('M29 6.4H33V10.4H29Z'),
		...soldier(34).slice(0, 3),
		body('M27 7.2H47V9.6H27Z')
	],
	mortars: [
		body('M13 19.5L31 3.5L33.6 6.2L15.6 22.2Z'),
		body('M8 21.2H23V23.4H8Z'),
		line('M27 9.5L33 22'),
		line('M27 9.5L23.5 22', 0.7),
		shell(36, 1)
	],
	jeep: [
		body('M3 15.5H45L43 10H31L28 6.5H18L15.5 10H6Z'),
		wheel(12, 17.5, 4),
		wheel(36, 17.5, 4),
		hub(12, 17.5),
		hub(36, 17.5),
		line('M24 6.5L34 3')
	],
	lightTank: [
		body('M5 15H43L39.5 20.5H8.5Z'),
		body('M16 9.5H30L32 15H14Z'),
		body('M30 11.2H45V12.8H30Z'),
		mark('M10 17.3H38V18.2H10Z')
	],
	tank: [
		body('M2.5 14.5H45.5L40.5 21.5H7.5Z'),
		body('M12 7.5H31L34.5 14.5H10Z'),
		body('M31 9.8H47.5V12H31Z'),
		body('M18 5.6H24V7.6H18Z'),
		mark('M8 17.5H40V18.6H8Z')
	],
	aa: [
		body('M3 15H45L41 21H7Z'),
		body('M16 9.5H31L33 15H14Z'),
		line('M25 10L39 1.5'),
		line('M27.5 11L41.5 2.5'),
		mark('M9 17.6H39V18.5H9Z')
	],
	rockets: [
		body('M3 12.5H17V7H24L28 12.5H45V17.5H3Z'),
		body('M19 11.5L39 3.5L41 7.5L21 15.5Z'),
		mark('M24.5 10L36.5 5.2M25.3 12L37.3 7.2'),
		wheel(10, 18.5, 3.5),
		wheel(36, 18.5, 3.5),
		hub(10, 18.5),
		hub(36, 18.5)
	],
	fighter: [
		body('M2 12L8 10.2H30L43 11.4L47 12L43 12.6L30 13.8H8Z'),
		body('M5 10.4L3.5 3H8L13.5 10.4Z'),
		body('M16 12.8H28L22 18.5H18Z'),
		mark('M33 11H38L36.5 11.8H33Z')
	],
	striker: [
		body('M3 11H40L46.5 12.2L40 13.6H3Z'),
		body('M3 11L1.5 4H5L8.5 11Z'),
		body('M9 6.8H20C21.2 6.8 21.6 7.8 21.6 8.6S21.2 10.4 20 10.4H9Z'),
		body('M18 13.4H29L26.5 19.5H20.5Z'),
		mark('M41 11.6H43.5V12.6H41Z')
	],
	barrage: [shell(4, 2), shell(16, 8), shell(28, 14), line('M38 21L41 18M44 22L45 19', 0.7)],
	cruise: WEAPON_ICONS.cruise,
	carpet: WEAPON_ICONS.stick,
	ballistic: WEAPON_ICONS.ballistic,
	nuke: WEAPON_ICONS.nuke
};

export function commandIcon(id: CommandId): readonly IconShape[] {
	return ICONS[id];
}
