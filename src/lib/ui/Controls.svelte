<script lang="ts">
	import { fade } from 'svelte/transition';

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

	// Runs in the capture phase so the dialog swallows Esc/Enter before the game
	// (pause toggle) or the title screen (launch) can react to the same key press.
	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Escape' || e.code === 'Enter') {
			e.stopImmediatePropagation();
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydowncapture={onKey} />

<div
	class="veil"
	transition:fade={{ duration: 150 }}
	role="dialog"
	aria-modal="true"
	aria-label="Controls"
>
	<div class="panel">
		<header>
			<h2>Flight manual</h2>
			<button class="close" onclick={onClose} aria-label="Close">✕</button>
		</header>
		<table>
			<tbody>
				{#each ROWS as [what, keys] (what)}
					<tr><th>{what}</th><td>{keys}</td></tr>
				{/each}
			</tbody>
		</table>
		<ul>
			{#each TIPS as t (t)}<li>{t}</li>{/each}
		</ul>
	</div>
</div>

<style>
	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 5, 9, 0.6);
		backdrop-filter: blur(5px);
		z-index: 5;
	}

	.panel {
		width: min(720px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		overflow-y: auto;
		padding: 26px 30px;
		background: var(--panel-strong);
		border-top: 2px solid var(--amber);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}

	.close {
		cursor: pointer;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.15);
		width: 34px;
		height: 34px;
	}

	table {
		width: 100%;
		margin: 18px 0;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 9px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		text-align: left;
		font-size: 16px;
	}

	th {
		font-weight: 500;
		color: var(--ink-dim);
		width: 46%;
	}

	td {
		font-family: var(--display);
		font-size: 14px;
		letter-spacing: 0.06em;
		color: var(--amber);
	}

	ul {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 6px;
		color: var(--ink-dim);
		font-size: 15px;
	}
</style>
