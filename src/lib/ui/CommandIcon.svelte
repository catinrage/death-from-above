<script lang="ts">
	import type { CommandId } from '$lib/game/command';
	import { commandIcon } from './command-icons';
	import { ICON_VIEWBOX } from './weapon-icons';

	interface Props {
		id: CommandId;
		class?: string;
	}

	let { id, class: cls = '' }: Props = $props();

	const shapes = $derived(commandIcon(id));
</script>

<svg class="command-icon {cls}" viewBox={ICON_VIEWBOX} aria-hidden="true" focusable="false">
	{#each shapes as s, i (i)}
		{#if s.kind === 'line'}
			<path
				d={s.d}
				fill="none"
				stroke="currentColor"
				stroke-width="1.4"
				stroke-linecap="round"
				stroke-linejoin="round"
				opacity={s.opacity}
			/>
		{:else if s.kind === 'mark'}
			<path d={s.d} class="mark" />
		{:else}
			<path d={s.d} fill="currentColor" opacity={s.opacity} />
		{/if}
	{/each}
</svg>

<style>
	.command-icon {
		display: block;
		overflow: visible;
	}

	.mark {
		fill: rgba(6, 8, 14, 0.82);
		stroke: rgba(6, 8, 14, 0.82);
		stroke-width: 0.8;
	}
</style>
