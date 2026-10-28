<script lang="ts">
	import { fade } from 'svelte/transition';
	import { AIRCRAFT, AIRCRAFT_ORDER } from '$lib/game/defs-aircraft';
	import type { AircraftId } from '$lib/game/types';
	import { menu, powerOn } from './menu-fx';

	interface Props {
		/** The aircraft sitting on the runway now. */
		current: AircraftId;
		onPick: (id: AircraftId) => void;
		onBack: () => void;
	}

	let { current, onPick, onBack }: Props = $props();
</script>

<div class="m-veil" transition:fade={{ duration: 160 }}>
	<div class="panel m-panel" in:powerOn use:menu={{ nav: true }}>
		<p class="m-kicker">Ground crew standing by</p>
		<h2>Change aircraft</h2>
		<ul>
			{#each AIRCRAFT_ORDER as id (id)}
				{@const a = AIRCRAFT[id]}
				<li>
					<button
						class="craft"
						class:on={id === current}
						data-nav
						disabled={id === current}
						onclick={() => onPick(id)}
					>
						<span class="nm">{a.name}</span>
						<span class="role">{a.role}</span>
						<span class="traits">
							<span class="pro">+ {a.pros[0]}</span>
							<span class="con">− {a.cons[0]}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
		<button class="m-btn back" data-nav data-back onclick={onBack}>Back</button>
		<p class="hint">Your hangar loadout and upgrades come with it · Esc resumes</p>
	</div>
</div>

<style>
	.panel {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto auto;
		gap: 10px;
		width: min(760px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		padding: 22px 22px 16px;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 30px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}

	.craft {
		display: grid;
		gap: 2px;
		width: 100%;
		padding: 8px 10px;
		font: inherit;
		text-align: left;
		color: inherit;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
	}

	.craft:hover:not(:disabled),
	.craft:focus-visible {
		border-color: var(--amber);
		background: rgba(255, 176, 74, 0.08);
	}

	.craft.on {
		cursor: default;
		opacity: 0.55;
	}

	.nm {
		font-family: var(--display);
		font-size: 16px;
		letter-spacing: 0.14em;
	}

	.role {
		font-size: 12px;
		color: var(--ink-dim);
	}

	.traits {
		display: grid;
		font-size: 12px;
	}

	.pro {
		color: var(--amber);
	}

	.con {
		color: #ffb4a8;
	}

	.back {
		justify-self: start;
	}

	.hint {
		margin: 0;
		font-size: 12px;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
	}
</style>
