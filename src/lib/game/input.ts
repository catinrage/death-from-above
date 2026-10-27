import type { PilotInput } from './player';
import type { WingOrder } from './wingman';

const STEER = {
	up: ['KeyW', 'ArrowUp'],
	down: ['KeyS', 'ArrowDown'],
	left: ['KeyA', 'ArrowLeft'],
	right: ['KeyD', 'ArrowRight']
};
const FIRE = ['KeyJ', 'KeyZ', 'Mouse0'];
const BOMB = ['Space', 'KeyK', 'KeyX', 'Mouse2'];
const FLARE = ['KeyF', 'KeyL', 'KeyC'];
const BOOST = ['ShiftLeft', 'ShiftRight'];
const BRAKE = ['KeyV'];
const NEXT = ['Tab'];
const PREV = ['KeyQ'];
const PAUSE = ['Escape', 'KeyP'];
const MISSILE = ['KeyE', 'KeyU', 'Mouse1'];
const FOCUS = ['KeyR', 'KeyI'];
/** Wingman orders. */
const ORDERS: [WingOrder, string[]][] = [
	['attack', ['KeyT']],
	['cover', ['KeyG']],
	['sams', ['KeyH']]
];
/** Scroll distance (pixels) that counts as one weapon switch. */
const WHEEL_NOTCH = 60;
/** Seconds after the last mouse movement that the reticle stays pointer-driven. */
const POINTER_TIMEOUT = 4;
/** Right-stick reticle speed in CSS px per second at full deflection. */
const STICK_SPEED = 1100;

/** Standard-mapping gamepad buttons. */
const PAD = {
	a: 0,
	b: 1,
	x: 2,
	y: 3,
	lb: 4,
	rb: 5,
	lt: 6,
	rt: 7,
	view: 8,
	start: 9,
	l3: 10,
	up: 12,
	down: 13,
	right: 15
} as const;

/** Keyboard, mouse and gamepad state with per-frame edge detection. */
export class Input {
	private readonly down = new Set<string>();
	private readonly pressed = new Set<string>();
	private padPrev: boolean[] = [];
	private padNow: boolean[] = [];
	private padAxes: number[] = [0, 0, 0, 0];
	private mouseX = -1;
	private mouseY = -1;
	private pointerTime = -Infinity;
	private stickX = -1;
	private stickY = -1;
	usingPad = false;
	/** True while flying: game keys suppress the browser's default scrolling/focus moves. */
	capture = false;

	private readonly onKeyDown = (e: KeyboardEvent): void => {
		if (e.target instanceof HTMLInputElement) return;
		if (!this.down.has(e.code)) this.pressed.add(e.code);
		this.down.add(e.code);
		this.usingPad = false;
		const gameKey = ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
			e.code
		);
		if (this.capture && gameKey) e.preventDefault();
	};
	private readonly onKeyUp = (e: KeyboardEvent): void => {
		this.down.delete(e.code);
	};
	private readonly onMouseDown = (e: MouseEvent): void => {
		const code = `Mouse${e.button}`;
		if (!this.down.has(code)) this.pressed.add(code);
		this.down.add(code);
		if (e.button === 1) e.preventDefault();
		this.onPointer(e);
	};
	private readonly onPointer = (e: MouseEvent): void => {
		this.mouseX = e.clientX;
		this.mouseY = e.clientY;
		// Only mouse use in flight takes over aiming, not clicking through menus.
		if (!this.capture) return;
		this.pointerTime = performance.now();
		this.stickX = -1;
	};
	private readonly onMouseUp = (e: MouseEvent): void => {
		this.down.delete(`Mouse${e.button}`);
	};
	private readonly onBlur = (): void => {
		this.down.clear();
	};
	private readonly onContext = (e: Event): void => e.preventDefault();
	/** Scroll accumulated toward the next weapon switch, and switches waiting to be read. */
	private wheelAcc = 0;
	private wheelSteps = 0;
	private readonly onWheel = (e: WheelEvent): void => {
		if (!this.capture) return;
		e.preventDefault();
		// Pixel, line and page deltas all normalised to about one mouse notch = 100.
		const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 600 : 1;
		this.wheelAcc += e.deltaY * scale;
		if (Math.abs(this.wheelAcc) >= WHEEL_NOTCH) {
			this.wheelSteps += Math.sign(this.wheelAcc);
			this.wheelAcc = 0;
		}
	};

	attach(target: Window, canvas: HTMLElement): void {
		target.addEventListener('keydown', this.onKeyDown);
		target.addEventListener('keyup', this.onKeyUp);
		target.addEventListener('blur', this.onBlur);
		canvas.addEventListener('mousedown', this.onMouseDown);
		target.addEventListener('mouseup', this.onMouseUp);
		target.addEventListener('mousemove', this.onPointer);
		canvas.addEventListener('contextmenu', this.onContext);
		target.addEventListener('wheel', this.onWheel, { passive: false });
	}

	detach(target: Window, canvas: HTMLElement): void {
		target.removeEventListener('keydown', this.onKeyDown);
		target.removeEventListener('keyup', this.onKeyUp);
		target.removeEventListener('blur', this.onBlur);
		canvas.removeEventListener('mousedown', this.onMouseDown);
		target.removeEventListener('mouseup', this.onMouseUp);
		target.removeEventListener('mousemove', this.onPointer);
		canvas.removeEventListener('contextmenu', this.onContext);
		target.removeEventListener('wheel', this.onWheel);
	}

	private any(codes: readonly string[]): boolean {
		return codes.some((c) => this.down.has(c));
	}

	private anyPressed(codes: readonly string[]): boolean {
		return codes.some((c) => this.pressed.has(c));
	}

	private pad(i: number): boolean {
		return !!this.padNow[i];
	}

	private padPressed(i: number): boolean {
		return !!this.padNow[i] && !this.padPrev[i];
	}

	/** Polls the first connected gamepad (standard mapping). */
	poll(): void {
		this.padPrev = this.padNow;
		this.padNow = [];
		const pads =
			typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
		const gp = Array.from(pads ?? []).find((p) => p && p.connected);
		if (!gp) {
			this.padAxes = [0, 0, 0, 0];
			return;
		}
		this.padNow = gp.buttons.map((b) => b.pressed || b.value > 0.5);
		this.padAxes = [gp.axes[0] ?? 0, gp.axes[1] ?? 0, gp.axes[2] ?? 0, gp.axes[3] ?? 0];
		if (this.padNow.some(Boolean) || Math.hypot(this.padAxes[0], this.padAxes[1]) > 0.3)
			this.usingPad = true;
	}

	pausePressed(): boolean {
		return this.anyPressed(PAUSE) || this.padPressed(PAD.start);
	}

	/** Toggle focus (slow motion). */
	focusPressed(): boolean {
		return this.anyPressed(FOCUS) || this.padPressed(PAD.lt);
	}

	/** Wingman order given this frame (T / G / H, or the d-pad: right, up, down). */
	orderPressed(): WingOrder | null {
		for (const [order, keys] of ORDERS) if (this.anyPressed(keys)) return order;
		if (this.padPressed(PAD.right)) return 'attack';
		if (this.padPressed(PAD.up)) return 'cover';
		if (this.padPressed(PAD.down)) return 'sams';
		return null;
	}

	/** Number key pressed this frame as a 0-based rack slot (keys 1–9). */
	slotPressed(): number | null {
		for (let i = 0; i < 9; i++) if (this.pressed.has(`Digit${i + 1}`)) return i;
		return null;
	}

	/** Launch guided missiles. */
	missilePressed(): boolean {
		return this.anyPressed(MISSILE) || this.padPressed(PAD.y);
	}

	/**
	 * The aiming reticle in CSS px. The mouse drives it directly; the right
	 * stick pushes a virtual cursor. `active` is false once both go idle, so
	 * keyboard-only pilots fall back to automatic targeting.
	 */
	cursor(dtReal: number, cssW: number, cssH: number): { x: number; y: number; active: boolean } {
		const rx = this.padAxes[2],
			ry = this.padAxes[3];
		if (Math.hypot(rx, ry) > 0.2) {
			if (this.stickX < 0) {
				this.stickX = this.mouseX >= 0 ? this.mouseX : cssW * 0.6;
				this.stickY = this.mouseY >= 0 ? this.mouseY : cssH * 0.6;
			}
			this.stickX = Math.min(cssW, Math.max(0, this.stickX + rx * STICK_SPEED * dtReal));
			this.stickY = Math.min(cssH, Math.max(0, this.stickY + ry * STICK_SPEED * dtReal));
			this.pointerTime = performance.now();
		}
		const usingStick = this.stickX >= 0;
		const x = usingStick ? this.stickX : this.mouseX;
		const y = usingStick ? this.stickY : this.mouseY;
		const active = x >= 0 && (performance.now() - this.pointerTime) / 1000 < POINTER_TIMEOUT;
		return { x, y, active };
	}

	enterPressed(): boolean {
		return this.pressed.has('Enter');
	}

	confirmPressed(): boolean {
		return this.pressed.has('Enter') || this.padPressed(PAD.a);
	}

	pilot(): PilotInput {
		let sx = 0,
			sy = 0;
		if (this.any(STEER.right)) sx += 1;
		if (this.any(STEER.left)) sx -= 1;
		if (this.any(STEER.up)) sy += 1;
		if (this.any(STEER.down)) sy -= 1;
		const [ax, ay] = this.padAxes;
		if (Math.hypot(ax, ay) > 0.3) {
			sx = ax;
			sy = -ay;
		}
		const select: PilotInput['select'] = null;
		let cycle = 0;
		if (this.anyPressed(NEXT) || this.padPressed(PAD.rb)) cycle = 1;
		if (this.anyPressed(PREV) || this.padPressed(PAD.lb)) cycle = -1;
		// Mouse wheel: down is the next weapon, up the previous one, one slot per frame.
		if (cycle === 0 && this.wheelSteps !== 0) {
			cycle = Math.sign(this.wheelSteps);
			this.wheelSteps -= cycle;
		}
		return {
			steerX: sx,
			steerY: sy,
			boost: this.any(BOOST) || this.pad(PAD.x) || this.pad(PAD.l3),
			brake: this.any(BRAKE) || this.pad(PAD.view),
			fire: this.any(FIRE) || this.pad(PAD.rt),
			bomb: this.any(BOMB) || this.pad(PAD.a),
			bombPressed: this.anyPressed(BOMB) || this.padPressed(PAD.a),
			flare: this.anyPressed(FLARE) || this.padPressed(PAD.b),
			cycle,
			select,
			missiles: null,
			designate: null
		};
	}

	endFrame(): void {
		this.pressed.clear();
	}
}
