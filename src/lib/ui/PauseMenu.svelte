<script lang="ts">
	import { fade } from 'svelte/transition';
	import Letters from './Letters.svelte';
	import { menu, powerOn } from './menu-fx';

	interface Props {
		onResume: () => void;
		onRestart: () => void;
		onQuit: () => void;
		onControls: () => void;
	}

	let { onResume, onRestart, onQuit, onControls }: Props = $props();
</script>

<div class="m-veil" transition:fade={{ duration: 160 }}>
	<div class="panel m-panel" in:powerOn use:menu={{ nav: true }}>
		<p class="m-kicker m-wipe" style:--d="120ms">Comms hold · Time stopped</p>
		<h2><Letters text="Paused" delay={140} stagger={40} /></h2>
		<div class="items">
			<button class="m-btn m-primary m-wipe" style:--d="200ms" data-nav onclick={onResume}>
				<span>Resume</span>
				<span class="m-chev" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="m-key">Esc</span>
			</button>
			<button class="m-btn m-wipe" style:--d="200ms" style:--i="1" data-nav onclick={onRestart}
				>Restart mission</button
			>
			<button class="m-btn m-wipe" style:--d="200ms" style:--i="2" data-nav onclick={onControls}
				>Controls</button
			>
			<button
				class="m-btn abort m-wipe"
				style:--d="200ms"
				style:--i="3"
				data-nav
				data-back
				onclick={onQuit}>Abort mission</button
			>
		</div>
		<p class="hint">↑ ↓ select · Enter confirm</p>
	</div>
</div>

<style>
	.panel {
		display: grid;
		gap: 14px;
		width: min(360px, calc(100vw - 32px));
		padding: 26px 26px 20px;
	}

	h2 {
		margin: 0 0 4px;
		font-family: var(--display);
		font-size: 40px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		text-shadow: 0 0 24px rgba(255, 150, 60, 0.3);
	}

	.items {
		display: grid;
		gap: 6px;
	}

	.items .m-primary {
		font-size: 18px;
	}

	.abort {
		--accent: var(--danger);
		color: #ffb4a8;
	}

	.hint {
		margin: 2px 0 0;
		font-size: 12px;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
	}
</style>
