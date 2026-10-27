import type { RadioState } from '../audio/radio';
import type { Player } from './player';
import type { WaveState } from './waves';
import type { World } from './world';

/** What the radio watches for calls worth making. */
export function radioState(
	w: World,
	p: Player | null,
	waveState: WaveState,
	lives: number
): RadioState {
	const alive = !!p && p.alive && !p.dying;
	let enemyAir = 0;
	let inbound = 0;
	for (const a of w.air) if (a.alive) enemyAir++;
	if (p) for (const m of w.missiles) if (m.alive && m.target === p) inbound++;
	return {
		waveState,
		base: w.base.hp / w.base.maxHp,
		baseUnderAttack: w.base.underAttack > 0,
		alive,
		landed: !!p && p.landed,
		inbound,
		lock: alive ? p!.lockProgress : 0,
		enemyAir,
		lives,
		wingman: !!w.wingman && w.wingman.active,
		wingRejoins: w.wingman?.rejoins ?? 0
	};
}
