import type { CommandDef } from './command';

/**
 * How a command game is set up: how hard the enemy commander plays, and any
 * challenge that limits what the player may order. A game runs until one
 * side's base falls; the record is the shortest time to win each setup.
 */

export type Difficulty = 'recruit' | 'regular' | 'veteran' | 'elite' | 'legend';

export interface DifficultyDef {
	id: Difficulty;
	name: string;
	blurb: string;
	/** How many times our income the enemy's war chest fills at (level N earns N times ours). */
	enemyIncome: number;
	/** What the enemy's war chest opens with. */
	enemyFunds: number;
	/** Seconds between the enemy commander's decisions. */
	pace: number;
	/** How sharply the enemy commander plays, 0..1 (see CommandAutopilot). */
	skill: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
	{
		id: 'recruit',
		name: 'Recruit',
		blurb: 'They earn what we earn, and mostly buy whatever comes to hand.',
		enemyIncome: 1,
		enemyFunds: 400,
		pace: 1.2,
		skill: 0.15
	},
	{
		id: 'regular',
		name: 'Regular',
		blurb: 'They earn twice what we do, and start to answer what we field.',
		enemyIncome: 2,
		enemyFunds: 600,
		pace: 0.8,
		skill: 0.4
	},
	{
		id: 'veteran',
		name: 'Veteran',
		blurb: 'Three times our income, counters our army and defends its HQ.',
		enemyIncome: 3,
		enemyFunds: 900,
		pace: 0.5,
		skill: 0.65
	},
	{
		id: 'elite',
		name: 'Elite',
		blurb: 'Four times our income, and it punishes every crowded road.',
		enemyIncome: 4,
		enemyFunds: 1200,
		pace: 0.35,
		skill: 0.85
	},
	{
		id: 'legend',
		name: 'Legend',
		blurb: 'Five times our income, and it never makes the wrong call.',
		enemyIncome: 5,
		enemyFunds: 1600,
		pace: 0.25,
		skill: 1
	}
];

export const DEFAULT_DIFFICULTY: Difficulty = 'veteran';

export type Challenge = 'standard' | 'ground' | 'infantry' | 'noAir' | 'shoestring';

export interface ChallengeDef {
	id: Challenge;
	name: string;
	blurb: string;
	/** Our war chest fills at this share of the usual rate. */
	income: number;
	/** Whether the player may give this order. */
	allows: (def: CommandDef) => boolean;
}

export const CHALLENGES: readonly ChallengeDef[] = [
	{
		id: 'standard',
		name: 'Standard',
		blurb: 'Every order is open.',
		income: 1,
		allows: () => true
	},
	{
		id: 'ground',
		name: 'Ground only',
		blurb: 'Troops and vehicles only: no aircraft, drones or strikes.',
		income: 1,
		allows: (d) => d.group === 'ground'
	},
	{
		id: 'infantry',
		name: 'Infantry only',
		blurb: 'Foot soldiers only: no vehicles, aircraft, drones or strikes.',
		income: 1,
		allows: (d) => d.tab === 'infantry'
	},
	{
		id: 'noAir',
		name: 'No air power',
		blurb: 'No aircraft, drones or paratroopers. Troops, armour and strikes from base.',
		income: 1,
		allows: (d) => d.group !== 'air' && d.group !== 'drone' && d.id !== 'para'
	},
	{
		id: 'shoestring',
		name: 'Shoestring',
		blurb: 'Every order is open, but our war chest fills at half the rate.',
		income: 0.5,
		allows: () => true
	}
];

export const DEFAULT_CHALLENGE: Challenge = 'standard';

export function difficultyDef(id: Difficulty): DifficultyDef {
	return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2];
}

export function challengeDef(id: Challenge): ChallengeDef {
	return CHALLENGES.find((c) => c.id === id) ?? CHALLENGES[0];
}
