<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Player2Hud } from '$lib/game/hud';

	interface Props {
		wing: Player2Hud;
	}

	let { wing }: Props = $props();
	const hpFrac = $derived(Math.max(0, wing.hp / wing.hpMax));
</script>

<!-- Player two's aircraft, mirrored opposite player one's status panel. -->
<section class="wing" class:critical={hpFrac < 0.3 && wing.hp > 0} aria-label="Player two">
	<header>
		<b>P2</b>
		{#if wing.threat}<span class="threat" transition:fade={{ duration: 120 }}>THREAT</span>{/if}
	</header>
	{#if wing.out}
		<p class="note">Shot down · no aircraft left</p>
	{:else if wing.respawn > 0}
		<p class="note">Next airframe in {wing.respawn.toFixed(1)}s</p>
	{:else}
		<div class="gauge">
			<span class="lbl">ARMOR</span>
			<span class="track"
				><span class="fill hp" class:low={hpFrac < 0.3} style:transform="scaleX({hpFrac})"
				></span></span
			>
			<span class="val">{Math.ceil(wing.hp)}</span>
		</div>
		<div class="gauge">
			<span class="lbl">BOOST</span>
			<span class="track"
				><span class="fill boost" style:transform="scaleX({wing.boost})"></span></span
			>
			<span class="val"></span>
		</div>
		<div class="row">
			<span class="weapon" style:--c={wing.weaponColor}
				>{wing.weapon} <b>{wing.weaponCount}</b></span
			>
			{#if wing.missilesMax > 0}<span>MSL <b>{wing.missiles}</b></span>{/if}
			<span>FLR <b>{wing.flares}</b></span>
		</div>
	{/if}
	{#if wing.noPad}
		<p class="pad">Connect a gamepad to fly P2</p>
	{/if}
</section>

<style>
	.wing {
		position: absolute;
		right: 22px;
		bottom: 20px;
		display: grid;
		gap: 7px;
		width: 240px;
		padding: 12px 16px 12px;
		pointer-events: none;
		font-family: var(--body);
		color: var(--ink);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
		background: linear-gradient(225deg, rgba(8, 10, 16, 0.6), rgba(8, 10, 16, 0.25));
		border-right: 2px solid #5fe3a1;
		clip-path: polygon(0 18px, 18px 0, 100% 0, 100% 100%, 0 100%);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	header b {
		font-family: var(--display);
		font-size: 18px;
		letter-spacing: 0.16em;
		color: #5fe3a1;
	}

	.threat {
		font-size: 11px;
		letter-spacing: 0.2em;
		color: var(--danger);
		animation: blink 0.3s linear infinite alternate;
	}

	.gauge {
		display: grid;
		grid-template-columns: 56px 1fr 26px;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		letter-spacing: 0.18em;
	}

	.lbl {
		color: var(--ink-dim);
	}

	.val {
		text-align: right;
		font-family: var(--display);
		font-size: 13px;
	}

	.track {
		position: relative;
		display: block;
		height: 5px;
		background: rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}

	.fill {
		position: absolute;
		inset: 0;
		transform-origin: left;
	}

	.fill.hp {
		background: linear-gradient(90deg, #d8ffd0, var(--good));
	}

	.fill.hp.low {
		background: var(--danger);
	}

	.fill.boost {
		background: linear-gradient(90deg, #d6fbe8, #5fe3a1);
	}

	.row {
		display: flex;
		gap: 14px;
		font-size: 11px;
		letter-spacing: 0.16em;
		color: var(--ink-dim);
	}

	.row b {
		font-family: var(--display);
		font-size: 14px;
		color: var(--ink);
		margin-left: 3px;
	}

	.weapon {
		color: var(--c);
	}

	.note {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--ink-dim);
	}

	.pad {
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.1em;
		color: var(--amber);
	}

	.critical {
		border-right-color: var(--danger);
	}

	@keyframes blink {
		to {
			opacity: 0.35;
		}
	}

	@media (max-width: 900px) {
		.wing {
			transform: scale(0.85);
			transform-origin: right bottom;
		}
	}
</style>
