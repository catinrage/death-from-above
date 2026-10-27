<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	interface Props {
		onResume: () => void;
		onRestart: () => void;
		onQuit: () => void;
		onControls: () => void;
	}

	let { onResume, onRestart, onQuit, onControls }: Props = $props();
</script>

<div class="veil" transition:fade={{ duration: 160 }}>
	<div class="panel" transition:scale={{ start: 0.96, duration: 180 }}>
		<h2>Paused</h2>
		<button class="primary" onclick={onResume}>Resume <small>Esc</small></button>
		<button onclick={onRestart}>Restart mission</button>
		<button onclick={onControls}>Controls</button>
		<button onclick={onQuit}>Abort mission</button>
	</div>
</div>

<style>
	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 5, 9, 0.55);
		backdrop-filter: blur(4px) saturate(0.7);
	}

	.panel {
		display: grid;
		gap: 10px;
		min-width: 300px;
		padding: 28px;
		background: var(--panel-strong);
		border-top: 2px solid var(--amber);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
	}

	h2 {
		margin: 0 0 10px;
		font-family: var(--display);
		font-size: 30px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}

	button {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 12px 16px;
		cursor: pointer;
		text-align: left;
		font-size: 17px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: background 0.15s ease;
	}

	button:hover {
		background: rgba(255, 176, 74, 0.12);
		border-color: var(--line);
	}

	.primary {
		background: var(--amber);
		color: #1a0d04;
		font-weight: 700;
		border-color: var(--amber);
	}

	.primary:hover {
		background: #ffc06a;
	}

	small {
		font-size: 12px;
		opacity: 0.7;
	}
</style>
