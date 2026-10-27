/** Cockpit alerts the aircraft can raise, highest priority first. */
export type Alert =
	| 'pullUp'
	| 'missile'
	| 'fire'
	| 'stall'
	| 'lock'
	| 'damage'
	| 'altitude'
	| 'ceiling'
	| 'boundary'
	| 'overheat'
	| 'winchester';

export const ALERT_ORDER: readonly Alert[] = [
	'pullUp',
	'missile',
	'fire',
	'stall',
	'lock',
	'damage',
	'altitude',
	'ceiling',
	'boundary',
	'overheat',
	'winchester'
];

interface AlertSpec {
	/** Clip file (static/audio/voice/<file>.mp3) and the words, for the speech fallback. */
	file: string;
	text: string;
	/** Seconds between repeats while the condition holds; 0 = say once per occurrence. */
	repeat: number;
	/** Warning tone played before the words. */
	tone: 'caution' | 'warning' | 'none';
}

/** Lines, cadence and tones modelled on real fast-jet voice warning systems. */
export const ALERTS: Record<Alert, AlertSpec> = {
	pullUp: { file: 'pull-up', text: 'Pull up. Pull up.', repeat: 1.6, tone: 'none' },
	missile: { file: 'missile', text: 'Missile. Missile.', repeat: 2.4, tone: 'none' },
	fire: { file: 'fire', text: 'Engine fire. Engine fire.', repeat: 4, tone: 'warning' },
	stall: { file: 'stall', text: 'Stall. Stall.', repeat: 1.8, tone: 'none' },
	lock: { file: 'lock', text: 'Warning. Locked on.', repeat: 5, tone: 'warning' },
	damage: { file: 'damage', text: 'Warning. Damage critical.', repeat: 9, tone: 'warning' },
	altitude: { file: 'altitude', text: 'Altitude. Altitude.', repeat: 3, tone: 'caution' },
	ceiling: { file: 'ceiling', text: 'Altitude ceiling.', repeat: 6, tone: 'caution' },
	boundary: { file: 'boundary', text: 'Warning. Leaving combat area.', repeat: 5, tone: 'caution' },
	overheat: { file: 'overheat', text: 'Guns overheat.', repeat: 0, tone: 'caution' },
	winchester: { file: 'winchester', text: 'Winchester.', repeat: 0, tone: 'none' }
};

export type AlertState = Record<Alert, boolean>;

export function noAlerts(): AlertState {
	return Object.fromEntries(ALERT_ORDER.map((a) => [a, false])) as AlertState;
}

/**
 * Decides which callout to speak: only one voice at a time, highest priority
 * first, each repeating on its own cadence while its condition holds, and
 * one-shot alerts only when they newly come on. Pure timing logic — the audio
 * engine does the playing.
 */
export class Announcer {
	private readonly next: Record<Alert, number> = Object.fromEntries(
		ALERT_ORDER.map((a) => [a, 0])
	) as Record<Alert, number>;
	private readonly was = noAlerts();
	private busy = 0;

	/** Advances time; returns the alert to speak now, if any. */
	update(dt: number, s: AlertState, voiceLength = 1.3): Alert | null {
		this.busy -= dt;
		for (const a of ALERT_ORDER) this.next[a] -= dt;
		let pick: Alert | null = null;
		let top = true;
		for (const a of ALERT_ORDER) {
			const on = s[a];
			const fresh = on && !this.was[a];
			this.was[a] = on;
			if (!on) {
				this.next[a] = 0;
				continue;
			}
			// Like a real voice warning system, the most urgent active alert inhibits the rest.
			const allowed = top || ALERTS[a].repeat === 0;
			top = false;
			if (pick || this.busy > 0 || !allowed) continue;
			if (ALERTS[a].repeat === 0 ? fresh : this.next[a] <= 0) pick = a;
		}
		if (!pick) return null;
		this.next[pick] = ALERTS[pick].repeat || Infinity;
		this.busy = voiceLength;
		return pick;
	}

	reset(): void {
		this.busy = 0;
		for (const a of ALERT_ORDER) {
			this.next[a] = 0;
			this.was[a] = false;
		}
	}
}
