import { EDGE_DEFAULTS, type EdgeKind, type EdgeMarker } from '../game/edge-markers';

/** Chevron size (CSS px) for the farthest and the nearest enemy. */
const SIZE_FAR = 10;
const SIZE_NEAR = 14;
/** Opacity for the farthest and the nearest enemy. */
const ALPHA_FAR = 0.35;
const ALPHA_NEAR = 0.5;

/**
 * Small, faint chevrons on the screen edge pointing at off-screen enemies.
 * The nodes are created once and only their transform and opacity change.
 */
export class EdgeLayer {
	private readonly nodes: HTMLDivElement[] = [];
	private readonly kinds: (EdgeKind | null)[] = [];
	private readonly shown: boolean[] = [];

	constructor(root: HTMLElement, slots = EDGE_DEFAULTS.max) {
		for (let i = 0; i < slots; i++) {
			const d = document.createElement('div');
			d.className = 'tl-edge';
			d.innerHTML = '<i></i>';
			d.style.display = 'none';
			root.appendChild(d);
			this.nodes.push(d);
			this.kinds.push(null);
			this.shown.push(false);
		}
	}

	render(markers: readonly EdgeMarker[]): void {
		for (let i = 0; i < this.nodes.length; i++) {
			const el = this.nodes[i];
			const m = markers[i];
			if (!m) {
				if (this.shown[i]) {
					el.style.display = 'none';
					this.shown[i] = false;
				}
				continue;
			}
			if (!this.shown[i]) {
				el.style.display = 'block';
				this.shown[i] = true;
			}
			if (this.kinds[i] !== m.kind) {
				el.className = `tl-edge ${m.kind}`;
				this.kinds[i] = m.kind;
			}
			// A merged group reads a touch heavier than a lone enemy.
			const near = Math.min(1, m.near + (m.count > 1 ? 0.15 : 0));
			const scale = (SIZE_FAR + (SIZE_NEAR - SIZE_FAR) * near) / SIZE_NEAR;
			el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px) rotate(${m.angle.toFixed(3)}rad) scale(${scale.toFixed(3)})`;
			el.style.opacity = (ALPHA_FAR + (ALPHA_NEAR - ALPHA_FAR) * near).toFixed(2);
		}
	}
}
