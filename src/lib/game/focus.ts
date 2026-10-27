import { damp, lerp } from '../engine/math';

/** Real-time seconds a full meter lasts in focus. */
const DURATION = 4.5;
/** Real-time seconds to refill an empty meter. */
const RECHARGE = 18;
/** Minimum charge needed to enter focus. */
const MIN_CHARGE = 0.15;
/** World speed while focused. */
export const FOCUS_TIME_SCALE = 0.25;

export type FocusEvent = 'start' | 'stop' | null;

/**
 * Bullet time. Toggling it slows the world to a quarter speed while a meter
 * drains in real time; kills top the meter up. `blend` eases the effect in and
 * out so time, colour grading and audio don't snap.
 */
export class Focus {
	active = false;
	meter = 1;
	blend = 0;

	/** Advances by real (unscaled) time. Returns 'start' / 'stop' on transitions. */
	update(dtReal: number, toggle: boolean, allowed: boolean): FocusEvent {
		let event: FocusEvent = null;
		if (toggle) {
			if (this.active) event = this.stop();
			else if (allowed && this.meter >= MIN_CHARGE) event = this.start();
		}
		if (this.active) {
			this.meter = Math.max(0, this.meter - dtReal / DURATION);
			if (this.meter <= 0 || !allowed) event = this.stop();
		} else {
			this.meter = Math.min(1, this.meter + dtReal / RECHARGE);
		}
		this.blend = damp(this.blend, this.active ? 1 : 0, 9, dtReal);
		return event;
	}

	/** Kills feed the meter (not while it is draining). */
	reward(amount: number): void {
		if (!this.active) this.meter = Math.min(1, this.meter + amount);
	}

	/** Multiplier for simulation time. */
	timeScale(): number {
		return lerp(1, FOCUS_TIME_SCALE, this.blend);
	}

	reset(): void {
		this.active = false;
		this.meter = 1;
		this.blend = 0;
	}

	private start(): FocusEvent {
		this.active = true;
		return 'start';
	}

	private stop(): FocusEvent {
		if (!this.active) return null;
		this.active = false;
		return 'stop';
	}
}
