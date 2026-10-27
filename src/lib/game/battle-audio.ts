import type { ThreatInput } from '../audio/music';
import type { RadioState } from '../audio/radio';
import type { Player } from './player';
import type { WaveState } from './waves';
import type { World } from './world';

/** Range (m) inside which an enemy counts as close to the aircraft. */
const NEAR = 520;

/** What the dynamic score reacts to right now. */
export function threatInput(w: World, p: Player | null, waveState: WaveState): ThreatInput {
	const alive = !!p && p.alive && !p.dying;
	let near = 0;
	let enemyAir = 0;
	let inbound = 0;
	if (p) {
		for (const u of w.units) if (u.alive && Math.abs(u.x - p.x) < NEAR) near++;
		for (const a of w.air) {
			if (!a.alive) continue;
			enemyAir++;
			if (Math.hypot(a.x - p.x, a.y - p.y) < NEAR) near++;
		}
		for (const m of w.missiles) if (m.alive && m.target === p) inbound++;
	}
	return {
		hostiles: w.hostilesAlive(),
		near,
		enemyAir,
		inbound,
		lock: alive ? p!.lockProgress : 0,
		hp: alive ? p!.hp / p!.def.hp : 0,
		baseUnderAttack: w.base.underAttack > 0,
		waveActive: waveState === 'active',
		alive
	};
}

/** What the radio watches for calls worth making. */
export function radioState(
	w: World,
	p: Player | null,
	waveState: WaveState,
	lives: number
): RadioState {
	const t = threatInput(w, p, waveState);
	return {
		waveState,
		base: w.base.hp / w.base.maxHp,
		baseUnderAttack: t.baseUnderAttack,
		alive: t.alive,
		landed: !!p && p.landed,
		inbound: t.inbound,
		lock: t.lock,
		enemyAir: t.enemyAir,
		lives
	};
}
