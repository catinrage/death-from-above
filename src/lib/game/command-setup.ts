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
	/** How much faster than ours the enemy's war chest fills. */
	enemyIncome: number;
	/** What the enemy's war chest opens with. */
	enemyFunds: number;
	/** Seconds between the enemy commander's decisions. */
	pace: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
	{
		id: 'recruit',
		name: 'Recruit',
		blurb: 'Their chest fills no faster than ours, and they are slow to decide.',
		enemyIncome: 1,
		enemyFunds: 400,
		pace: 1.4
	},
	{
		id: 'regular',
		name: 'Regular',
		blurb: 'A little more money than us, and a steady hand.',
		enemyIncome: 1.3,
		enemyFunds: 500,
		pace: 0.8
	},
	{
		id: 'veteran',
		name: 'Veteran',
		blurb: 'The standard war: their weaker army is paid for by a bigger chest.',
		enemyIncome: 1.6,
		enemyFunds: 600,
		pace: 0.5
	},
	{
		id: 'elite',
		name: 'Elite',
		blurb: 'Twice our income, and quick to punish a crowded road.',
		enemyIncome: 2,
		enemyFunds: 900,
		pace: 0.35
	},
	{
		id: 'legend',
		name: 'Legend',
		blurb: 'They outspend us more than two to one and never stop to think.',
		enemyIncome: 2.5,
		enemyFunds: 1400,
		pace: 0.25
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
