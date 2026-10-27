import type { BiomeId } from './biomes';
import type { AirKind } from './enemy-air';
import type { UnitKind } from './types';
import type { WaveDirector, WaveOptions } from './waves';
import type { WeatherSpec } from './weather';
import type { World } from './world';

export type Target = UnitKind | AirKind;

export type Objective =
	| { type: 'waves'; count: number }
	| { type: 'destroy'; kinds: Target[]; count: number; label: string }
	| { type: 'bridge' };

export interface Mission {
	id: string;
	name: string;
	/** One line under the name on the mission card. */
	tagline: string;
	brief: string;
	/** Map the mission is flown on. */
	biome: BiomeId;
	/** Time of day (environment phase) for each wave; the last entry holds for the rest. */
	env: number[];
	/** Weather for each wave, like `env`; omitted = clear with a light breeze. */
	weather?: WeatherSpec[];
	waves: WaveOptions & { last: number };
	objectives: Objective[];
	/** The airfield must stay above this fraction of its strength. */
	baseFloor?: number;
}

/** Campaign missions in order. Each unlocks the next. */
export const MISSIONS: readonly Mission[] = [
	{
		id: 'first-light',
		name: 'First Light',
		tagline: 'Infantry and trucks on the road',
		brief:
			'A light column is probing toward the airfield. Break it up before it reaches the wire. Rearm over the runway between passes.',
		biome: 'temperate',
		env: [0.9],
		waves: {
			last: 2,
			briefings: [
				'Infantry and trucks advancing. Strafe and bomb them on the road',
				'A second column behind the first. Keep them off the airfield'
			]
		},
		objectives: [{ type: 'waves', count: 2 }]
	},
	{
		id: 'the-crossing',
		name: 'The Crossing',
		tagline: 'Cut the bridge',
		brief:
			'Their supply line runs over the steel bridge. Drop a span to strand the column on the far bank, then mop up what made it across.',
		biome: 'desert',
		env: [0.2],
		waves: {
			last: 2,
			offset: 1,
			tweaks: () => ({ lead: { truck: 2.5, jeep: 1.5 } }),
			briefings: [
				'Supply convoy heading for the bridge. Drop a span with bombs',
				'Engineers are rebuilding the bridge. Stop the next convoy'
			]
		},
		objectives: [{ type: 'bridge' }, { type: 'waves', count: 2 }]
	},
	{
		id: 'iron-column',
		name: 'Iron Column',
		tagline: 'Armour in strength',
		brief:
			'An armoured spearhead with mobile AA in tow. Tanks shrug off guns: use bombs, the bunker buster or missiles on their tops.',
		biome: 'jungle',
		env: [1.1],
		weather: [{ kind: 'rain', wind: -6 }],
		waves: {
			last: 2,
			offset: 2,
			// Three tanks a wave so the six-tank goal can always be met.
			tweaks: () => ({
				lead: { tank: 3, apc: 1.5, truck: 0.5, jeep: 0.5 },
				units: ['tank', 'tank', 'tank']
			}),
			briefings: [
				'Tanks leading the column. Hit them from above',
				'Second armoured group with AA escort. Watch the tracers'
			]
		},
		objectives: [
			{ type: 'destroy', kinds: ['tank'], count: 6, label: 'Destroy tanks' },
			{ type: 'waves', count: 2 }
		]
	},
	{
		id: 'flak-alley',
		name: 'Flak Alley',
		tagline: 'Dug-in air defences',
		brief:
			'The enemy has fortified the valley with flak batteries and pillboxes. Take them out so the next strikes can get through.',
		biome: 'snow',
		env: [1.7],
		waves: {
			last: 2,
			offset: 2,
			statics: ['flak', 'flak', 'flak', 'bunker', 'bunker'],
			briefings: [
				'Flak batteries are dug in along the road. Stay low and fast',
				'Reinforcements moving up under the guns'
			]
		},
		objectives: [
			{ type: 'destroy', kinds: ['flak'], count: 3, label: 'Destroy flak batteries' },
			{ type: 'destroy', kinds: ['bunker'], count: 2, label: 'Destroy pillboxes' },
			{ type: 'waves', count: 2 }
		]
	},
	{
		id: 'night-watch',
		name: 'Night Watch',
		tagline: 'Hold until dawn',
		brief:
			'Three waves under cover of darkness. Searchlights will hunt you and the guns shoot straighter when they find you. The airfield must not fall below half strength.',
		biome: 'city',
		env: [2.6, 3, 3.6],
		weather: [
			{ kind: 'clear', wind: 3 },
			{ kind: 'storm', wind: 10 }
		],
		waves: {
			last: 3,
			offset: 3,
			statics: ['searchlight', 'searchlight'],
			briefings: [
				'Movement on the road after dark',
				'Searchlights are up. Kill them to blind the flak',
				'Last push before dawn. Hold the line'
			]
		},
		objectives: [{ type: 'waves', count: 3 }],
		baseFloor: 0.5
	},
	{
		id: 'wild-weasel',
		name: 'Wild Weasel',
		tagline: 'Hunt the SAM sites',
		brief:
			'SAM launchers and their radars are shutting down the sky. Destroy them. Flare when the seeker closes, and kill the radar first to slow their locks.',
		biome: 'snow',
		env: [4.1],
		weather: [{ kind: 'snow', wind: -5 }],
		waves: {
			last: 2,
			offset: 4,
			statics: ['radar', 'radar'],
			tweaks: () => ({ lead: { sam: 3.5, spaag: 1.5 }, units: ['sam', 'sam'] }),
			briefings: [
				'SAM launchers moving up with radar cover. Flares ready',
				'More launchers inbound. Clear the sky'
			]
		},
		objectives: [
			{ type: 'destroy', kinds: ['sam'], count: 4, label: 'Destroy SAM launchers' },
			{ type: 'destroy', kinds: ['radar'], count: 2, label: 'Destroy radar stations' },
			{ type: 'waves', count: 2 }
		]
	},
	{
		id: 'contested-skies',
		name: 'Contested Skies',
		tagline: 'Interceptors and gunships',
		brief:
			'The enemy has committed its air wing. Interceptors will chase you and gunships will rocket the airfield. Shoot them down while you hold the road.',
		biome: 'desert',
		env: [0.4],
		waves: {
			last: 3,
			offset: 4,
			tweaks: (wave) => ({ fighters: 1 + wave, helis: 2 }),
			briefings: [
				'Interceptors scrambled. Turn into them and use your guns',
				'Gunships going for the airfield',
				'Their last squadron is airborne'
			]
		},
		objectives: [
			{ type: 'destroy', kinds: ['fighter', 'heli'], count: 8, label: 'Shoot down aircraft' },
			{ type: 'waves', count: 3 }
		]
	},
	{
		id: 'death-from-above',
		name: 'Death From Above',
		tagline: 'Everything they have left',
		brief:
			'The final offensive: armour, air defence and aircraft all at once, from dusk through the night. Four waves. Keep the airfield standing.',
		biome: 'city',
		env: [1.9, 2.6, 3.2, 4.1],
		waves: {
			last: 4,
			offset: 6,
			statics: ['flak', 'radar'],
			tweaks: (wave) => ({ budget: 1 + wave * 0.05 }),
			briefings: [
				'The offensive begins. Everything is coming',
				'Heavy armour and SAMs behind the first line',
				'Night falls. Their air wing joins the attack',
				'Final wave. Hold the airfield'
			]
		},
		objectives: [{ type: 'waves', count: 4 }],
		baseFloor: 0.4
	}
];

export function missionById(id: string): Mission | undefined {
	return MISSIONS.find((m) => m.id === id);
}

export function nextMission(id: string): Mission | undefined {
	const i = MISSIONS.findIndex((m) => m.id === id);
	return i >= 0 ? MISSIONS[i + 1] : undefined;
}

export interface ObjectiveStatus {
	label: string;
	/** "3/6", or empty for yes/no goals. */
	count: string;
	done: boolean;
	/** A constraint that is broken (fails the mission). */
	failed?: boolean;
}

/**
 * Follows one mission's objectives as the battle plays out. It counts
 * destroyed enemies by scanning the world, so it doesn't care what killed them.
 */
export class MissionTracker {
	/** Destroyed enemies by kind. */
	readonly destroyed: Partial<Record<Target, number>> = {};
	bridgeDown = false;
	/** Lowest the airfield has been, as a fraction. */
	baseLow = 1;
	private readonly seen = new Set<number>();
	/** Ground units last seen alive, so ones cleared away in the same step they died still count. */
	private living = new Map<number, Target>();

	constructor(readonly mission: Mission) {}

	private tally(id: number, kind: Target): void {
		if (this.seen.has(id)) return;
		this.seen.add(id);
		this.destroyed[kind] = (this.destroyed[kind] ?? 0) + 1;
	}

	update(w: World): void {
		const living = new Map<number, Target>();
		for (const u of w.units) {
			if (u.alive) living.set(u.id, u.def.kind);
			else this.tally(u.id, u.def.kind);
		}
		// Gone from the field without us seeing the wreck (e.g. dropped off a broken bridge).
		for (const [id, kind] of this.living) if (!living.has(id)) this.tally(id, kind);
		this.living = living;
		for (const a of w.air) {
			if (!a.alive || a.dying) this.tally(a.id, a.kind);
		}
		if (w.bridge && w.bridge.downCount > 0) this.bridgeDown = true;
		this.baseLow = Math.min(this.baseLow, w.base.hp / w.base.maxHp);
	}

	count(kinds: Target[]): number {
		return kinds.reduce((n, k) => n + (this.destroyed[k] ?? 0), 0);
	}

	status(waves: WaveDirector): ObjectiveStatus[] {
		const out = this.mission.objectives.map((o): ObjectiveStatus => {
			switch (o.type) {
				case 'waves': {
					const n = Math.min(waves.cleared, o.count);
					return { label: 'Hold the airfield', count: `${n}/${o.count} waves`, done: n >= o.count };
				}
				case 'destroy': {
					const n = Math.min(this.count(o.kinds), o.count);
					return { label: o.label, count: `${n}/${o.count}`, done: n >= o.count };
				}
				case 'bridge':
					return { label: 'Drop a bridge span', count: '', done: this.bridgeDown };
			}
		});
		const floor = this.mission.baseFloor;
		if (floor !== undefined) {
			out.push({
				label: `Airfield above ${Math.round(floor * 100)}%`,
				count: '',
				done: this.baseLow >= floor,
				failed: this.baseLow < floor
			});
		}
		return out;
	}

	/** All goals met (constraints are only checked for failure). */
	complete(waves: WaveDirector): boolean {
		return this.status(waves).every((s) => s.done);
	}

	failed(): boolean {
		const floor = this.mission.baseFloor;
		return floor !== undefined && this.baseLow < floor;
	}
}

/** Stars for a won mission: finishing, keeping the airfield healthy, and losing no aircraft. */
export function starsFor(baseFrac: number, aircraftLost: number): number {
	return 1 + (baseFrac >= 0.7 ? 1 : 0) + (aircraftLost === 0 ? 1 : 0);
}

export interface MissionRecord {
	stars: number;
	best: number;
}

export type CampaignProgress = Record<string, MissionRecord>;

const KEY = 'dfa.campaign';

export function loadProgress(): CampaignProgress {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return sanitizeProgress(raw);
	} catch {
		return {};
	}
}

export function sanitizeProgress(raw: unknown): CampaignProgress {
	const out: CampaignProgress = {};
	if (!raw || typeof raw !== 'object') return out;
	for (const m of MISSIONS) {
		const r = (raw as Record<string, unknown>)[m.id];
		if (!r || typeof r !== 'object') continue;
		const { stars, best } = r as Record<string, unknown>;
		if (typeof stars !== 'number' || stars < 1) continue;
		out[m.id] = {
			stars: Math.min(3, Math.floor(stars)),
			best: typeof best === 'number' && best > 0 ? Math.floor(best) : 0
		};
	}
	return out;
}

/** Folds a finished mission into the saved progress, keeping the best result. */
export function recordMission(
	progress: CampaignProgress,
	id: string,
	stars: number,
	score: number
): CampaignProgress {
	const prev = progress[id];
	return {
		...progress,
		[id]: { stars: Math.max(prev?.stars ?? 0, stars), best: Math.max(prev?.best ?? 0, score) }
	};
}

export function saveProgress(p: CampaignProgress): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Best-effort: private browsing may block storage.
	}
}

/** A mission is open once the one before it has been won. */
export function isUnlocked(progress: CampaignProgress, id: string): boolean {
	const i = MISSIONS.findIndex((m) => m.id === id);
	if (i <= 0) return i === 0;
	return !!progress[MISSIONS[i - 1].id];
}
