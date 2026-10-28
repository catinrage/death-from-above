import { cubicOut } from 'svelte/easing';
import type { Action } from 'svelte/action';
import type { TransitionConfig } from 'svelte/transition';

/** What a menu interaction sounds like. */
export type MenuSound = 'hover' | 'select' | 'back';

type SoundSink = (kind: MenuSound) => void;

let sink: SoundSink | null = null;

/** GameShell routes menu blips to the audio engine's interface bus. */
export function setMenuSound(fn: SoundSink | null): void {
	sink = fn;
}

export function blip(kind: MenuSound): void {
	sink?.(kind);
}

export function reducedMotion(): boolean {
	return (
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Things a menu treats as a selectable item. */
const ITEM = 'button, [role="button"], [role="tab"], [role="radio"], input[type="range"]';

/** Items the arrow keys and a gamepad step through. */
const NAV = '[data-nav]';

function navItems(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(NAV)).filter(
		(el) =>
			!(el as HTMLButtonElement).disabled &&
			el.getAttribute('aria-disabled') !== 'true' &&
			el.offsetParent !== null
	);
}

/** Open menus, newest last: only the top one answers the arrows and the gamepad. */
const roots: HTMLElement[] = [];

function step(root: HTMLElement, d: number): void {
	const items = navItems(root);
	if (items.length === 0) return;
	const i = items.indexOf(document.activeElement as HTMLElement);
	const next = i < 0 ? (d > 0 ? 0 : items.length - 1) : (i + d + items.length) % items.length;
	items[next].focus({ focusVisible: true } as FocusOptions);
	blip('hover');
}

function onWindowKey(e: KeyboardEvent): void {
	const root = roots[roots.length - 1];
	if (!root || e.defaultPrevented) return;
	if (e.code === 'ArrowDown') step(root, 1);
	else if (e.code === 'ArrowUp') step(root, -1);
	else return;
	e.preventDefault();
}

// Gamepad: D-pad or left stick steps, A presses, B backs out (as Escape does).
let padFrame = 0;
let prevPad: boolean[] = [];
let stickHeld = 0;

function pollPad(): void {
	padFrame = requestAnimationFrame(pollPad);
	const root = roots[roots.length - 1];
	const pads = navigator.getGamepads ? Array.from(navigator.getGamepads() ?? []) : [];
	const pad = pads.find((p) => p && p.connected);
	if (!root || !pad) return;
	const down = pad.buttons.map((b) => b.pressed);
	const edge = (i: number): boolean => !!down[i] && !prevPad[i];
	prevPad = down;
	const y = pad.axes[1] ?? 0;
	const stick = Math.abs(y) > 0.6 ? Math.sign(y) : 0;
	const stickEdge = stick !== 0 && stick !== stickHeld;
	stickHeld = stick;
	if (edge(13) || (stickEdge && stick > 0)) step(root, 1);
	else if (edge(12) || (stickEdge && stick < 0)) step(root, -1);
	else if (edge(0)) {
		const el = document.activeElement as HTMLElement | null;
		if (el && root.contains(el) && el.matches(ITEM)) el.click();
		else step(root, 1);
	} else if (edge(1)) {
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
	}
}

function register(root: HTMLElement): void {
	if (roots.length === 0) {
		window.addEventListener('keydown', onWindowKey);
		if (typeof requestAnimationFrame !== 'undefined') padFrame = requestAnimationFrame(pollPad);
	}
	roots.push(root);
}

function unregister(root: HTMLElement): void {
	const i = roots.indexOf(root);
	if (i >= 0) roots.splice(i, 1);
	if (roots.length === 0) {
		window.removeEventListener('keydown', onWindowKey);
		cancelAnimationFrame(padFrame);
		prevPad = [];
	}
}

interface MenuOptions {
	/** Arrow keys and the gamepad step through `[data-nav]` items. */
	nav?: boolean;
}

/**
 * Wires a menu up: hover and click blips on every item, and (with `nav`)
 * arrow-key and gamepad navigation through the items marked `data-nav`.
 */
export const menu: Action<HTMLElement, MenuOptions | undefined> = (node, opts) => {
	let last: Element | null = null;
	const over = (e: PointerEvent): void => {
		const item = (e.target as Element).closest?.(ITEM);
		if (item === last) return;
		last = item;
		if (item && !(item as HTMLButtonElement).disabled) blip('hover');
	};
	const click = (e: MouseEvent): void => {
		const item = (e.target as Element).closest?.(ITEM);
		if (!item || (item as HTMLButtonElement).disabled) return;
		blip(item.matches('[data-back]') ? 'back' : 'select');
	};
	node.addEventListener('pointerover', over);
	node.addEventListener('click', click);
	if (opts?.nav) register(node);
	return {
		destroy() {
			node.removeEventListener('pointerover', over);
			node.removeEventListener('click', click);
			if (opts?.nav) unregister(node);
		}
	};
};

/**
 * Drifts an element against the mouse, a few pixels at most, so the menu
 * floats over the battlefield. Uses the `translate` property so it composes
 * with transform animations.
 */
export const parallax: Action<HTMLElement, number> = (node, depth = 10) => {
	if (reducedMotion()) return;
	let tx = 0,
		ty = 0,
		x = 0,
		y = 0,
		frame = 0,
		last = 0;
	// Time-based easing that settles (and stops) within a second at any frame rate.
	const tick = (now: number): void => {
		const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
		last = now;
		const k = 1 - Math.exp(-dt / 0.14);
		x += (tx - x) * k;
		y += (ty - y) * k;
		const settled = Math.max(Math.abs(tx - x), Math.abs(ty - y)) * depth < 0.3;
		if (settled) {
			x = tx;
			y = ty;
		}
		node.style.translate = `${(x * depth).toFixed(1)}px ${(y * depth).toFixed(1)}px`;
		frame = settled ? 0 : requestAnimationFrame(tick);
		if (settled) last = 0;
	};
	const move = (e: PointerEvent): void => {
		tx = -(e.clientX / innerWidth - 0.5) * 2;
		ty = -(e.clientY / innerHeight - 0.5) * 2;
		if (!frame) frame = requestAnimationFrame(tick);
	};
	window.addEventListener('pointermove', move);
	return {
		update(d: number) {
			depth = d;
		},
		destroy() {
			window.removeEventListener('pointermove', move);
			cancelAnimationFrame(frame);
		}
	};
};

/** A panel powering on: a bright sliver that opens up and settles. */
export function powerOn(
	_node: Element,
	{ delay = 0, duration = 380 }: { delay?: number; duration?: number } = {}
): TransitionConfig {
	if (reducedMotion()) return { duration: 0 };
	return {
		delay,
		duration,
		css: (t) => {
			const e = cubicOut(t);
			return `opacity:${Math.min(1, t * 2.5)};transform:scale(${0.97 + 0.03 * e}, ${0.02 + 0.98 * e});filter:brightness(${1 + (1 - e) * 1.6})`;
		}
	};
}

/** Counts up to a number, for scores on the debrief. */
export function countUp(
	to: number,
	set: (v: number) => void,
	{ delay = 0, duration = 1100 }: { delay?: number; duration?: number } = {}
): () => void {
	if (reducedMotion() || to <= 0) {
		set(to);
		return () => {};
	}
	let frame = 0;
	const start = performance.now() + delay;
	const tick = (): void => {
		const t = Math.min(1, Math.max(0, (performance.now() - start) / duration));
		set(Math.round(to * (1 - Math.pow(1 - t, 3))));
		if (t < 1) frame = requestAnimationFrame(tick);
	};
	set(0);
	frame = requestAnimationFrame(tick);
	return () => cancelAnimationFrame(frame);
}
