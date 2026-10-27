import type { ScreenMarker } from '../game/targeting';

export interface TargetingView {
	visible: boolean;
	/** Reticle position in CSS px, or null when no pointer is aiming. */
	cursor: { x: number; y: number } | null;
	/** Focus blend 0..1. */
	focus: number;
	hover: ScreenMarker | null;
	locks: ScreenMarker[];
	/** Direction markers ringing the aircraft, one per incoming missile or locking launcher. */
	threats: ThreatMarker[];
	/** Co-op name tags over each aircraft (empty when flying solo). */
	pilots: PilotTagView[];
}

export interface PilotTagView {
	x: number;
	y: number;
	label: string;
	/** Player two's tag (green). */
	wing: boolean;
	/** The aircraft is out of shot: the tag sits on the screen edge. */
	off: boolean;
}

export interface ThreatMarker {
	kind: 'missile' | 'lock';
	/** Marker position in CSS px. */
	x: number;
	y: number;
	/** Screen bearing from the aircraft to the threat (radians, 0 = right, clockwise). */
	angle: number;
	/** 0..1 urgency. */
	level: number;
	/** Inside flare range: flash. */
	close: boolean;
	/** Range in metres, shown for missiles. */
	dist: number;
}

const SLOTS = 6;
const THREAT_SLOTS = 8;
const PILOT_SLOTS = 2;

/** DOM overlay for the aiming reticle, the target under it and painted locks. */
export class TargetingLayer {
	private readonly reticle: HTMLDivElement;
	private readonly hover: HTMLDivElement;
	private readonly locks: HTMLDivElement[] = [];
	private readonly shown: boolean[] = [];
	private readonly threats: HTMLDivElement[] = [];
	private readonly pilots: HTMLDivElement[] = [];

	constructor(private readonly root: HTMLElement) {
		this.reticle = this.el(
			'tl-reticle',
			'<i class="ring"></i><i class="ticks"></i><i class="dot"></i>'
		);
		this.hover = this.el('tl-hover', '');
		for (let i = 0; i < SLOTS; i++) {
			this.locks.push(this.el('tl-lock', `<i class="diamond"></i><b>${i + 1}</b>`));
			this.shown.push(false);
		}
		for (let i = 0; i < THREAT_SLOTS; i++)
			this.threats.push(this.el('tl-threat', '<i class="chev"></i><b></b>'));
		for (let i = 0; i < PILOT_SLOTS; i++) this.pilots.push(this.el('tl-pilot', ''));
	}

	private el(cls: string, html: string): HTMLDivElement {
		const d = document.createElement('div');
		d.className = cls;
		d.innerHTML = html;
		d.style.display = 'none';
		this.root.appendChild(d);
		return d;
	}

	private place(el: HTMLElement, x: number, y: number, size?: number): void {
		el.style.display = 'block';
		el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
		if (size !== undefined) {
			el.style.width = `${size.toFixed(0)}px`;
			el.style.height = `${size.toFixed(0)}px`;
		}
	}

	render(v: TargetingView): void {
		this.root.style.display = v.visible ? '' : 'none';
		if (!v.visible) return;
		this.root.classList.toggle('focus', v.focus > 0.5);
		if (v.cursor) this.place(this.reticle, v.cursor.x, v.cursor.y);
		else this.reticle.style.display = 'none';
		if (v.hover) this.place(this.hover, v.hover.x, v.hover.y, v.hover.size);
		else this.hover.style.display = 'none';
		for (let i = 0; i < SLOTS; i++) {
			const el = this.locks[i];
			const m = v.locks[i];
			if (!m) {
				el.style.display = 'none';
				this.shown[i] = false;
				continue;
			}
			this.place(el, m.x, m.y, Math.max(26, m.size * 0.75));
			if (!this.shown[i]) {
				// Restart the snap-in animation for a freshly painted lock.
				el.classList.remove('fresh');
				void el.offsetWidth;
				el.classList.add('fresh');
				this.shown[i] = true;
			}
		}
		for (let i = 0; i < THREAT_SLOTS; i++) {
			const el = this.threats[i];
			const t = v.threats[i];
			if (!t) {
				el.style.display = 'none';
				continue;
			}
			this.place(el, t.x, t.y);
			el.className = `tl-threat ${t.kind}${t.close ? ' close' : ''}`;
			el.style.setProperty('--a', `${t.angle.toFixed(3)}rad`);
			el.style.setProperty('--lv', t.level.toFixed(2));
			const label = el.lastElementChild as HTMLElement;
			label.textContent = t.kind === 'missile' ? `${Math.round(t.dist)}m` : 'LOCK';
		}
		for (let i = 0; i < PILOT_SLOTS; i++) {
			const el = this.pilots[i];
			const t = v.pilots[i];
			if (!t) {
				el.style.display = 'none';
				continue;
			}
			this.place(el, t.x, t.y);
			el.className = `tl-pilot${t.wing ? ' wing' : ''}${t.off ? ' off' : ''}`;
			if (el.textContent !== t.label) el.textContent = t.label;
		}
	}
}
