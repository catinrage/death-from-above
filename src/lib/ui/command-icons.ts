import type { CommandId } from '$lib/game/command';
import { body, line, mark, WEAPON_ICONS, type IconShape } from './weapon-icons';

/**
 * Side-profile silhouettes for the commander's order bar, drawn like the
 * weapon rack's (48x24, facing the enemy). Strikes reuse the weapon icons;
 * aircraft share a handful of outlines (jet, prop plane, heavy, helicopter).
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

/** A soldier kneeling with a launcher on the shoulder, pointing up and ahead. */
function aimingUp(x: number): IconShape[] {
	return [
		body(`M${x - 2.2} 7a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z`),
		body(`M${x - 2.6} 10H${x + 2.6}L${x + 2.4} 16.5H${x - 2.4}Z`),
		body(`M${x - 2.4} 16.5L${x - 3.4} 22.5H${x + 3.6}L${x + 2.4} 16.5Z`),
		body(`M${x - 6} 12.6L${x + 9} 3.2L${x + 10.2} 5.1L${x - 4.8} 14.5Z`)
	];
}

/** A soldier lying prone with a long rifle. */
function prone(x: number, y: number): IconShape[] {
	return [
		body(`M${x + 10} ${y - 2.2}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z`),
		body(`M${x} ${y - 1.6}H${x + 11}L${x + 11} ${y + 0.8}H${x}Z`),
		line(`M${x + 11} ${y - 2.6}L${x + 22} ${y - 3.2}`)
	];
}

/** A plain side-on jet: fuselage, fin and a wing below. */
function jet(swept: number, fat = 0): IconShape[] {
	return [
		body(`M2 ${11 - fat}L8 ${9.6 - fat}H30L42 11.2L47 12L42 12.8L30 ${14 + fat}H8L2 ${13 + fat}Z`),
		body(`M4 ${10 - fat}L${2.5 + swept} 3H${7 + swept}L13 ${10 - fat}Z`),
		body(`M${15 + swept} 13.2H${27 + swept}L${21 + swept} 19H${17 + swept}Z`),
		mark('M32 10.8H37L35.6 11.6H32Z')
	];
}

/** A propeller aircraft: round nose, prop disc, fixed or gull wing. */
function propPlane(gull: boolean): IconShape[] {
	return [
		body('M4 10.5L9 9.5H33C38 9.5 41 10.4 41.5 12C41 13.6 38 14.5 33 14.5H9L4 13.5Z'),
		body('M5 10L3.5 4H8L12 10Z'),
		gull ? body('M17 13.6L21 18.5L28 16.4L31 13.6Z') : body('M17 13.6H31L27 18H20Z'),
		line('M43.2 6.5V17.5'),
		gull ? line('M20 18.5L19 21.5M28 16.5L29 21.5', 0.8) : mark('M33 10.5H36L35 11.3H33Z')
	];
}

/** A twin-boom heavy: wide body, high wing, a row of props. */
function heavy(props: number, swept = 0): IconShape[] {
	const out = [
		body('M2 10L7 8H36C41 8 44.5 10 46 12C44.5 14 41 15.5 36 15.5H7L2 13.5Z'),
		body(`M4 8.5L${2 + swept} 1.5H${7 + swept}L12 8.5Z`),
		body(`M${16 + swept} 8.6H${32 + swept}L${26 + swept} 4.6H${20 + swept}Z`)
	];
	for (let i = 0; i < props; i++) out.push(line(`M${30 - i * 5 + swept} 3.5V8.5`, 0.8));
	return out;
}

const NEW_ICONS = {
	assault: [
		...soldier(8),
		...aimingUp(22).slice(0, 3),
		body('M15 12.5H31V14.6H15Z'),
		...soldier(36)
	],
	platoon: [6, 14, 22, 30, 38].flatMap((x) => soldier(x).slice(0, 3)),
	aaTeam: [...soldier(9), ...aimingUp(30)],
	snipers: [...prone(4, 11), ...prone(14, 20)],
	medics: [
		...soldier(10).slice(0, 3),
		...soldier(24).slice(0, 3),
		body('M33 8H38V12H42V17H38V21H33V17H29V12H33Z'),
		mark('M34.4 9.4H36.6V13.4H40.6V15.6H36.6V19.6H34.4V15.6H30.4V13.4H34.4Z')
	],
	apc: [
		body('M3 16H44L42 9H34L31 6.5H10L5 9Z'),
		body('M21 4.5H29V6.6H21Z'),
		body('M28 5H40V6.2H28Z'),
		wheel(9, 18, 3.3),
		wheel(18, 18, 3.3),
		wheel(27, 18, 3.3),
		wheel(36, 18, 3.3),
		hub(9, 18),
		hub(18, 18),
		hub(27, 18),
		hub(36, 18)
	],
	column: [
		body('M2 18H22L20 22H4Z'),
		body('M7 14.5H16L17.5 18H6Z'),
		body('M15 15.4H24V16.4H15Z'),
		body('M22 11H45L41.5 15.5H25.5Z'),
		body('M28 6.5H38.5L41 11H26.5Z'),
		body('M38.5 7.8H47.5V9.2H38.5Z')
	],
	behemoth: [
		body('M1.5 13.5H46.5L42 21.5H6Z'),
		body('M8 6H33L37 13.5H6Z'),
		body('M33 6.8H47.5V8.6H33Z'),
		body('M33 9.6H47.5V11.4H33Z'),
		body('M4 7.5H8V13.5H4Z'),
		mark('M8 17H40V18.2H8Z')
	],
	sam: [
		body('M3 15.5H44V12H31L28 8H22V12H3Z'),
		body('M6 11L34 1.5L35.5 4.5L7.5 14Z'),
		mark('M10 9.5L31 2.5M11 11.6L32 4.6'),
		wheel(9, 18.5, 3.4),
		wheel(30, 18.5, 3.4),
		wheel(38, 18.5, 3.4),
		hub(9, 18.5),
		hub(30, 18.5),
		hub(38, 18.5)
	],
	howitzer: [
		body('M4 18L20 15.5L22 17.5L6 21Z'),
		body('M16 12H28V17H16Z'),
		body('M21 13L44 3.5L45 5.5L22.5 15.5Z'),
		body('M17 10H27V12H17Z'),
		wheel(22, 18.5, 4),
		hub(22, 18.5)
	],
	fpv: [
		body('M16 11H32V14H16Z'),
		body('M8 9.5H40V10.8H8Z'),
		body('M6 7.8H14V8.8H6Z'),
		body('M34 7.8H42V8.8H34Z'),
		body('M18 14H30L28 18H20Z'),
		body('M27 18H33L35 19.5L33 21H27Z'),
		mark('M29 12H31V13H29Z')
	],
	delta: [
		body('M4 12L10 10.6H38L46 12L38 13.4H10Z'),
		body('M14 13L36 11.5L36 16L18 17.5Z'),
		body('M6 10.6L3.5 4.5H7L10 10.6Z'),
		line('M2 8V16')
	],
	f16: jet(0),
	wraith: [
		body('M2 12L14 9H34L47 12L34 15H14Z'),
		body('M6 9.6L5 4H9.5L14 9.6Z'),
		body('M14 14.4H30L24 19H18Z'),
		mark('M30 10.8H36L34.6 11.6H30Z')
	],
	f4: [...jet(1, 0.6), body('M6 13.2L4 18H8L11 13.2Z')],
	// Canted twin fins read as a second, offset fin behind the first.
	f22: [...jet(0.5), body('M8 9.6L6 4.6H9.5L13 9.6Z')],
	f35: [...jet(0, 0.7), body('M8 9L6.5 5H9.5L12.5 9Z')],
	su24: [...jet(-1.5, 1), body('M16 9.6L13 7.4H22L24 9.6Z')],
	// The Flanker's sting pokes out behind its engines.
	su27: [...jet(0.5, 0.4), body('M0 11.6H3V12.6H0Z'), body('M8 9.6L6 4H9L12 9.6Z')],
	kestrel: [...jet(-1), body('M30 14H40L38 16.5H32Z')],
	a10: [
		body('M3 11H40L46.5 12.2L40 13.6H3Z'),
		body('M3 11L1.5 4H5L8.5 11Z'),
		body('M9 6.8H20C21.2 6.8 21.6 7.8 21.6 8.6S21.2 10.4 20 10.4H9Z'),
		body('M18 13.4H29L26.5 19.5H20.5Z'),
		mark('M41 11.6H43.5V12.6H41Z')
	],
	su25: [...jet(-2, 0.8), body('M18 15H22V19H18Z'), body('M24 15H28V19H24Z')],
	grizzly: [...jet(-2, 1.4), body('M42 11.5H47.5V12.6H42Z')],
	stuka: propPlane(true),
	a1: propPlane(false),
	apache: [
		body('M8 11L16 9H34C38 9 41 11 41.5 13.5L38 17H22L16 13.5H8Z'),
		body('M2 10H9V12.5H2Z'),
		body('M1.5 6.5H4.5L5 11H2Z'),
		line('M6 4.5H44'),
		body('M27 4.5H29V9H27Z'),
		body('M42 14.5H46.5V15.7H42Z'),
		mark('M32 10.4H38L39.6 13H33Z')
	],
	mq9: [
		body('M4 11.4L10 10.5H32C38 10.5 41.5 11 43 12.2C41.5 13.6 38 14 32 14H10L4 13.2Z'),
		body('M36 10.8C38 8 41.5 8 43 10.6Z'),
		line('M6 11L3 6M6 13L3 18'),
		body('M14 11.6H40V12.6H14Z'),
		line('M2 9V15', 0.8)
	],
	ac130: heavy(2),
	albatross: [...heavy(0, 2), body('M8 15.5H38V17H8Z')],
	b1: [
		body('M2 11.5L8 10H34C40 10 44 11 47 12.6L44 13.6H8L2 13Z'),
		body('M4 10.5L2.5 3H7L12 10.5Z'),
		body('M18 13.4L30 12L36 17.5H31Z'),
		body('M14 13.6H20V16.2H14Z'),
		mark('M36 10.6H41L40 11.4H36Z')
	],
	tu95: [
		body('M2 11L8 9.6H36C41 9.6 44 10.6 46 12C44 13.4 41 14.4 36 14.4H8L2 13Z'),
		body('M4 9.8L2.5 3H7L12 9.8Z'),
		body('M16 13.6L30 12.4L36 17.6H30Z'),
		line('M27 15.5V19.5M33 16V20', 0.8)
	]
} satisfies Partial<Record<CommandId, readonly IconShape[]>>;

const ICONS: Record<CommandId, readonly IconShape[]> = {
	...NEW_ICONS,
	rifles: [...soldier(10), ...soldier(21), ...soldier(32)],
	mgTeam: [
		...soldier(12),
		...soldier(30),
		body('M14 9.2H27V10.8H14Z'),
		body('M32 9.2H45V10.8H32Z'),
		line('M24 11L26 15M42 11L44 15', 0.7)
	],
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
	ifv: [
		body('M4 13H40L44 16.5L40.5 21H7.5L4 17Z'),
		body('M16 8H28L30 13H14Z'),
		body('M28 9.6H42V11H28Z'),
		body('M15 6H22V8H15Z'),
		mark('M9 17.5H38V18.4H9Z')
	],
	tankDestroyer: [
		body('M4 16H42L38.5 21H7.5Z'),
		body('M14 12.5H28L30 16H12Z'),
		body('M28 13.4H47V14.8H28Z'),
		body('M39 12.9H42V15.3H39Z'),
		mark('M9 18.2H37V19H9Z')
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
	barrage: [shell(4, 2), shell(16, 8), shell(28, 14), line('M38 21L41 18M44 22L45 19', 0.7)],
	cruise: WEAPON_ICONS.cruise,
	carpet: WEAPON_ICONS.stick,
	ballistic: WEAPON_ICONS.ballistic,
	para: WEAPON_ICONS.para,
	nuke: WEAPON_ICONS.nuke
};

export function commandIcon(id: CommandId): readonly IconShape[] {
	return ICONS[id];
}
