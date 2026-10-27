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
const GEAR = ['KeyB'];
/** Wingman orders. */
const ORDERS: [WingOrder, string[]][] = [
	['attack', ['KeyT']],
	['cover', ['KeyG']],
	['sams', ['KeyH']],
	['rearm', ['KeyY']]
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
	r3: 11,
	up: 12,
	down: 13,
	left: 14,
	right: 15
} as const;

/** One gamepad's buttons and sticks, with edge detection. */
class Pad {
	prev: boolean[] = [];
	now: boolean[] = [];
	axes: number[] = [0, 0, 0, 0];

	read(gp: Gamepad | undefined): void {
		this.prev = this.now;
		if (!gp) {
			this.now = [];
			this.axes = [0, 0, 0, 0];
			return;
		}
		this.now = gp.buttons.map((b) => b.pressed || b.value > 0.5);
		this.axes = [gp.axes[0] ?? 0, gp.axes[1] ?? 0, gp.axes[2] ?? 0, gp.axes[3] ?? 0];
	}

	held(i: number): boolean {
		return !!this.now[i];
	}

	pressed(i: number): boolean {
		return !!this.now[i] && !this.prev[i];
	}

	active(): boolean {
		return this.now.some(Boolean) || Math.hypot(this.axes[0], this.axes[1]) > 0.3;
	}

	/** Flight controls from this pad alone (no selection or targeting). */
	pilot(): PilotInput {
		const [ax, ay] = this.axes;
		const steer = Math.hypot(ax, ay) > 0.3;
		return {
			steerX: steer ? ax : 0,
			steerY: steer ? -ay : 0,
			boost: this.held(PAD.x) || this.held(PAD.l3),
			brake: this.held(PAD.view),
			fire: this.held(PAD.rt),
			bomb: this.held(PAD.a),
			bombPressed: this.pressed(PAD.a),
			flare: this.pressed(PAD.b),
			cycle: this.pressed(PAD.lb) ? -1 : this.pressed(PAD.rb) ? 1 : 0,
			select: null,
			missiles: null,
			designate: null,
			gear: this.pressed(PAD.r3)
		};
	}
}

/**
 * Keyboard, mouse and gamepad state with per-frame edge detection.
 *
 * Solo, the keyboard, mouse and first gamepad all fly the one aircraft. In
 * local co-op (`coop`) the first gamepad flies player two instead, and the
 * player keeps the keyboard and mouse (plus a second gamepad, if one is
 * plugged in).
 */
export class Input {
	private readonly down = new Set<string>();
	private readonly pressed = new Set<string>();
	/** First connected gamepad: the solo pilot's, or player two's in co-op. */
	private readonly pad = new Pad();
	/** Second connected gamepad: the player's in co-op. */
	private readonly pad2 = new Pad();
	private mouseX = -1;
	private mouseY = -1;
	private pointerTime = -Infinity;
	private stickX = -1;
	private stickY = -1;
	usingPad = false;
	/** Local two-player co-op: the first gamepad belongs to player two. */
	coop = false;
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

	/** The gamepad that flies the player's aircraft: the first one solo, the second in co-op. */
	private get own(): Pad {
		return this.coop ? this.pad2 : this.pad;
	}

	/** Polls the first two connected gamepads (standard mapping). */
	poll(): void {
		const pads =
			typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
		const connected = Array.from(pads ?? []).filter((p): p is Gamepad => !!p && p.connected);
		this.pad.read(connected[0]);
		this.pad2.read(connected[1]);
		if (this.own.active()) this.usingPad = true;
	}

	/** A gamepad is connected to fly player two. */
	p2Ready(): boolean {
		return (
			typeof navigator !== 'undefined' &&
			!!navigator.getGamepads &&
			Array.from(navigator.getGamepads() ?? []).some((p) => p && p.connected)
		);
	}

	pausePressed(): boolean {
		return this.anyPressed(PAUSE) || this.pad.pressed(PAD.start) || this.pad2.pressed(PAD.start);
	}

	/** Toggle focus (slow motion). Either co-op pilot can call it: it slows the whole battle. */
	focusPressed(): boolean {
		return (
			this.anyPressed(FOCUS) || this.pad.pressed(PAD.lt) || (this.coop && this.pad2.pressed(PAD.lt))
		);
	}

	/** Wingman order given this frame (T / G / H / Y, or the d-pad: right, up, down, left). */
	orderPressed(): WingOrder | null {
		for (const [order, keys] of ORDERS) if (this.anyPressed(keys)) return order;
		if (this.own.pressed(PAD.right)) return 'attack';
		if (this.own.pressed(PAD.up)) return 'cover';
		if (this.own.pressed(PAD.down)) return 'sams';
		if (this.own.pressed(PAD.left)) return 'rearm';
		return null;
	}

	/** Number key pressed this frame as a 0-based rack slot (keys 1–9). */
	slotPressed(): number | null {
		for (let i = 0; i < 9; i++) if (this.pressed.has(`Digit${i + 1}`)) return i;
		return null;
	}

	/** Launch guided missiles. */
	missilePressed(): boolean {
		return this.anyPressed(MISSILE) || this.own.pressed(PAD.y);
	}

	/** Player two's flight controls, from the first gamepad. */
	p2Pilot(): PilotInput {
		return this.pad.pilot();
	}

	/** Player two launches guided missiles. */
	p2MissilePressed(): boolean {
		return this.pad.pressed(PAD.y);
	}

	/**
	 * The aiming reticle in CSS px. The mouse drives it directly; the right
	 * stick pushes a virtual cursor. `active` is false once both go idle, so
	 * keyboard-only pilots fall back to automatic targeting.
	 */
	cursor(dtReal: number, cssW: number, cssH: number): { x: number; y: number; active: boolean } {
		const rx = this.own.axes[2],
			ry = this.own.axes[3];
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
		return this.pressed.has('Enter') || this.pad.pressed(PAD.a);
	}

	pilot(): PilotInput {
		let sx = 0,
			sy = 0;
		if (this.any(STEER.right)) sx += 1;
		if (this.any(STEER.left)) sx -= 1;
		if (this.any(STEER.up)) sy += 1;
		if (this.any(STEER.down)) sy -= 1;
		const pad = this.own.pilot();
		if (pad.steerX !== 0 || pad.steerY !== 0) {
			sx = pad.steerX;
			sy = pad.steerY;
		}
		const select: PilotInput['select'] = null;
		let cycle = 0;
		if (this.anyPressed(NEXT) || pad.cycle > 0) cycle = 1;
		if (this.anyPressed(PREV) || pad.cycle < 0) cycle = -1;
		// Mouse wheel: down is the next weapon, up the previous one, one slot per frame.
		if (cycle === 0 && this.wheelSteps !== 0) {
			cycle = Math.sign(this.wheelSteps);
			this.wheelSteps -= cycle;
		}
		return {
			steerX: sx,
			steerY: sy,
			boost: this.any(BOOST) || pad.boost,
			brake: this.any(BRAKE) || pad.brake,
			fire: this.any(FIRE) || pad.fire,
			bomb: this.any(BOMB) || pad.bomb,
			bombPressed: this.anyPressed(BOMB) || pad.bombPressed,
			flare: this.anyPressed(FLARE) || pad.flare,
			cycle,
			select,
			missiles: null,
			designate: null,
			gear: this.anyPressed(GEAR) || pad.gear
		};
	}

	endFrame(): void {
		this.pressed.clear();
	}
}
