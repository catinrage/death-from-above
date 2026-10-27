<script lang="ts">
	import { onMount } from 'svelte';
	import { startSandbox } from '$lib/dev/sandbox';

	let canvas: HTMLCanvasElement;
	let error = $state('');

	onMount(() => {
		try {
			return startSandbox(canvas);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});
</script>

<canvas bind:this={canvas}></canvas>
{#if error}<pre class="err">{error}</pre>{/if}

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		display: block;
		background: #000;
	}
	.err {
		position: fixed;
		inset: 1rem;
		color: #f88;
		white-space: pre-wrap;
		font-size: 12px;
	}
</style>
