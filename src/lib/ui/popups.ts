interface Popup {
	el: HTMLDivElement;
	x: number;
	y: number;
	age: number;
	life: number;
	active: boolean;
}

export type PopupKind = 'score' | 'supply' | 'big' | 'penalty';

/** Floating score text anchored to world positions, drawn as pooled DOM nodes. */
export class PopupLayer {
	private readonly pool: Popup[] = [];

	constructor(private readonly root: HTMLElement) {}

	spawn(text: string, sub: string, x: number, y: number, kind: PopupKind = 'score'): void {
		let p = this.pool.find((q) => !q.active);
		if (!p) {
			if (this.pool.length >= 40) return;
			const el = document.createElement('div');
			el.className = 'popup';
			this.root.appendChild(el);
			p = { el, x: 0, y: 0, age: 0, life: 1, active: false };
			this.pool.push(p);
		}
		p.el.className = `popup ${kind}`;
		p.el.innerHTML = '';
		const main = document.createElement('span');
		main.className = 'pts';
		main.textContent = text;
		p.el.appendChild(main);
		if (sub) {
			const s = document.createElement('span');
			s.className = 'sub';
			s.textContent = sub;
			p.el.appendChild(s);
		}
		p.x = x;
		p.y = y;
		p.age = 0;
		p.life = kind === 'big' || kind === 'penalty' ? 2 : 1.3;
		p.active = true;
		p.el.style.display = 'block';
	}

	update(dt: number, project: (x: number, y: number) => [number, number] | null): void {
		for (const p of this.pool) {
			if (!p.active) continue;
			p.age += dt;
			p.y += dt * 9;
			if (p.age >= p.life) {
				p.active = false;
				p.el.style.display = 'none';
				continue;
			}
			const s = project(p.x, p.y);
			if (!s) continue;
			const t = p.age / p.life;
			const scale = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(t, 0.5) * 0.3;
			p.el.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
			p.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
		}
	}

	clear(): void {
		for (const p of this.pool) {
			p.active = false;
			p.el.style.display = 'none';
		}
	}
}
