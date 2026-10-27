<script lang="ts">
	import { fade } from 'svelte/transition';
	import { menu, powerOn } from './menu-fx';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const ROWS: [string, string][] = [
		['Steer toward a direction', 'W A S D  /  Arrow keys  /  Left stick'],
		['Machine guns', 'J  /  Z  /  Left mouse  /  RT'],
		['Drop bomb (hold to keep dropping)', 'Space  /  K  /  X  /  Right mouse  /  A'],
		['Guided missiles', 'E  /  U  /  Middle mouse  /  Y'],
		['Aim missiles & guided bombs', 'Mouse reticle  /  Right stick'],
		['Focus — slow motion', 'R  /  I  /  LT'],
		['Select ordnance', '1 – 9 (your rack)  ·  Q / Tab / wheel cycle  /  LB RB'],
		['Flares (break missile locks)', 'F  /  L  /  C  /  B'],
		['Afterburner', 'Shift  /  X button'],
		['Airbrake (wheel brakes on the ground)', 'V  /  View button'],
		['Landing gear up / down', 'B  /  Right stick click'],
		['Wingman: attack my target', 'T  /  D-pad right'],
		['Wingman: cover me', 'G  /  D-pad up'],
		['Wingman: hit the SAMs', 'H  /  D-pad down'],
		['Wingman: return to base & rearm', 'Y  /  D-pad left'],
		['Pause', 'Esc  /  P  /  Start']
	];

	const TIPS = [
		'Every sortie starts on the runway: steer or boost to release the brakes, pull up past take-off speed, then raise the gear with B.',
		'Fly low and slow over your runway to rearm specials and repair. To land, lower the gear first and touch down level.',
		'Steering is directional: press the way you want to fly. Reversing loops you over the top.',
		'The dotted arc shows where your selected bomb will land.',
		'Focus slows time: sweep the reticle across enemies to paint up to six locks, then fire missiles — one per target.',
		'Missiles hit whatever is under the reticle. Guided bombs do too — with nothing under it, they follow the reticle as you move it.',
		'Kills recharge focus while it is off. Without a mouse, focus paints the nearest targets for you.',
		'Destroyed supply trucks and fuel depots hand you extra ordnance.',
		'Radar stations speed up SAM locks — take them out first.',
		'Thunderclap levels everything nearby, including you if you are low.',
		'Flares only work between you and the missile: drop them as it closes from behind, not when it launches.',
		'The nuke comes back once per wave. The airfield will not rearm it.',
		'Your wingman picks his own targets; T sends him at whatever you have locked or under the reticle. Order him onto the SAMs before you go in low, and home with Y when he is shot up.'
	];

	/** Each alternative binding ("Space", "Right mouse", "1 – 9 (your rack)") becomes a keycap. */
	function bindings(keys: string): string[] {
		return keys
			.split(/\s+\/\s+|\s+·\s+/)
			.map((b) => b.trim())
			.filter(Boolean);
	}

	// Runs in the capture phase so the dialog swallows Esc/Enter before the game
	// (pause toggle) or the title screen (launch) can react to the same key press.
	/** Set once closed: the dialog stays deaf while it fades out. */
	let done = false;

	function onKey(e: KeyboardEvent): void {
		if (done) return;
		if (e.code === 'Escape' || e.code === 'Enter') {
			e.stopImmediatePropagation();
			e.preventDefault();
			done = true;
			onClose();
		}
	}
</script>

<svelte:window onkeydowncapture={onKey} />

<div
	class="m-veil"
	transition:fade={{ duration: 150 }}
	role="dialog"
	aria-modal="true"
	aria-label="Controls"
>
	<div class="panel m-panel" in:powerOn use:menu>
		<header>
			<div>
				<p class="m-kicker">Pilot's notes · Rev 4</p>
				<h2>Flight manual</h2>
			</div>
			<button class="m-btn close" data-back onclick={onClose} aria-label="Close"
				><span class="m-key">Esc</span></button
			>
		</header>
		<div class="scroll">
			<dl>
				{#each ROWS as [what, keys], i (what)}
					<div class="row m-rise" style:--i={i * 0.4} style:--d="120ms">
						<dt>{what}</dt>
						<dd>
							{#each bindings(keys) as b, k (k)}
								{#if k > 0}<span class="or" aria-hidden="true">/</span>{/if}
								<span class="kb">{b}</span>
							{/each}
						</dd>
					</div>
				{/each}
			</dl>
			<p class="m-label tips-h">Field notes</p>
			<ol>
				{#each TIPS as t, i (t)}
					<li><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{t}</li>
				{/each}
			</ol>
		</div>
	</div>
</div>

<style>
	.m-veil {
		z-index: 5;
	}

	.panel {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: min(800px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		padding: 24px 0 0 28px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding-right: 28px;
		margin-bottom: 14px;
	}

	h2 {
		margin: 8px 0 0;
		font-family: var(--display);
		font-size: 30px;
		line-height: 1;
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}

	.close {
		padding: 8px 10px;
	}

	.scroll {
		min-height: 0;
		overflow-y: auto;
		padding: 0 28px 26px 0;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 176, 74, 0.35) transparent;
	}

	dl {
		margin: 0;
		display: grid;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
		gap: 16px;
		align-items: center;
		padding: 6px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background 0.2s;
	}

	.row:hover {
		background: linear-gradient(90deg, rgba(255, 176, 74, 0.1), transparent 80%);
	}

	dt {
		font-size: 16px;
		color: var(--ink-dim);
		transition: color 0.2s;
	}

	.row:hover dt {
		color: var(--ink);
	}

	dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
	}

	.kb {
		padding: 2px 7px;
		font-family: var(--display);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--amber);
		background: rgba(0, 0, 0, 0.32);
		border: 1px solid rgba(255, 176, 74, 0.26);
		border-bottom-width: 2px;
		border-radius: 2px;
	}

	.or {
		font-size: 11px;
		color: var(--ink-faint);
	}

	.tips-h {
		display: block;
		margin: 24px 0 10px;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
		font-size: 15px;
		line-height: 1.4;
		color: var(--ink-dim);
	}

	li {
		display: grid;
		grid-template-columns: 30px 1fr;
	}

	li span {
		font-family: var(--display);
		font-size: 11px;
		color: var(--amber);
		padding-top: 3px;
	}
</style>
