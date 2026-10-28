<script lang="ts">
	import { AIRCRAFT, AIRCRAFT_ORDER } from '$lib/game/defs-aircraft';
	import { AIRCRAFT_PRICE, owns, type Progression } from '$lib/game/progression';
	import type { AircraftId } from '$lib/game/types';
	import { parallax } from './menu-fx';

	interface Props {
		aircraft: AircraftId;
		wallet: Progression;
		onSelect: (id: AircraftId) => void;
		onBack: () => void;
	}

	let { aircraft, wallet, onSelect, onBack }: Props = $props();
</script>

<nav class="fleet m-panel m-wipe" aria-label="Aircraft" use:parallax={6}>
	<header>
		<button class="m-btn back" data-back onclick={onBack} aria-label="Back to menu">‹ Menu</button>
		<span class="wallet" title="Credits, earned from campaign missions and endless runs">
			{wallet.credits.toLocaleString()} <small>cr</small>
		</span>
	</header>
	<h2>Hangar</h2>
	<p class="m-label count">Fleet · {wallet.owned.length}/{AIRCRAFT_ORDER.length} owned</p>
	<ul>
		{#each AIRCRAFT_ORDER as id, i (id)}
			{@const a = AIRCRAFT[id]}
			{@const locked = !owns(wallet, id)}
			<li class="m-wipe" style:--i={i} style:--d="150ms">
				<button
					class="craft"
					class:on={id === aircraft}
					class:locked
					onclick={() => onSelect(id)}
					aria-pressed={id === aircraft}
				>
					<span class="idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					<span class="nm">{a.name}</span>
					{#if locked}
						<span class="sub price"
							><i class="lock" aria-hidden="true"></i>{AIRCRAFT_PRICE[id].toLocaleString()} cr</span
						>
					{:else}
						<span class="sub">{a.real ?? a.role}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	<p class="keys"><span class="m-key">↑ ↓</span> choose <span class="m-key">Enter</span> fly</p>
</nav>

<style>
	button {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
	}

	.fleet {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.fleet {
		padding: 16px 0 14px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
	}

	.back {
		padding: 6px 12px;
		font-size: 12px;
		letter-spacing: 0.16em;
		color: var(--ink-dim);
	}

	.wallet {
		white-space: nowrap;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 600;
		color: var(--good);
		text-shadow: 0 0 14px rgba(143, 227, 136, 0.35);
	}

	.wallet small {
		font-size: 12px;
		color: var(--ink-faint);
	}

	h2 {
		margin: 16px 16px 2px;
		font-family: var(--display);
		font-size: 28px;
		line-height: 1;
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}

	.count {
		margin: 0 16px 12px;
	}

	.fleet ul {
		list-style: none;
		margin: 0;
		padding: 0 10px;
		overflow-y: auto;
		scrollbar-width: none;
		display: grid;
		align-content: start;
		gap: 3px;
	}

	.craft {
		position: relative;
		width: 100%;
		display: grid;
		grid-template-columns: 28px 1fr;
		grid-template-rows: auto auto;
		text-align: left;
		padding: 9px 12px 9px 8px;
		overflow: hidden;
		isolation: isolate;
		transition:
			box-shadow 0.25s,
			color 0.2s;
	}

	/* Sweep highlight and corner brackets, like the menu buttons. */
	.craft::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(90deg, rgba(255, 150, 60, 0.22), rgba(255, 150, 60, 0));
		transform: translateX(-101%);
		transition: transform 0.45s var(--m-ease);
	}

	.craft::after {
		content: '';
		position: absolute;
		inset: 2px;
		pointer-events: none;
		color: var(--amber);
		background: var(--m-brackets);
		opacity: 0;
		transform: scale(1.12);
		transition:
			opacity 0.15s,
			transform 0.3s var(--m-snap);
	}

	.craft:hover::before,
	.craft:focus-visible::before {
		transform: translateX(-40%);
	}

	.craft.on::before {
		transform: translateX(0);
	}

	.craft:focus-visible {
		outline: none;
	}

	.craft:focus-visible::after,
	.craft.on::after {
		opacity: 1;
		transform: scale(1);
	}

	.craft.on {
		box-shadow: inset 3px 0 0 var(--amber-hot);
	}

	.idx {
		grid-row: span 2;
		font-family: var(--display);
		font-size: 11px;
		color: var(--ink-faint);
		padding-top: 4px;
		transition: color 0.2s;
	}

	.on .idx {
		color: var(--amber);
	}

	.nm {
		font-family: var(--display);
		font-size: 17px;
		font-weight: 600;
		letter-spacing: 0.12em;
		transition: transform 0.35s var(--m-ease);
	}

	.craft:hover .nm,
	.on .nm {
		transform: translateX(4px);
	}

	.on .nm {
		color: var(--amber);
	}

	.locked .nm {
		color: var(--ink-dim);
	}

	.sub {
		font-size: 13px;
		color: var(--ink-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sub.price {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-faint);
	}

	.lock {
		width: 8px;
		height: 7px;
		margin-top: 3px;
		position: relative;
		border: 1.5px solid currentColor;
		border-radius: 1px;
	}

	.lock::before {
		content: '';
		position: absolute;
		left: 0.5px;
		bottom: 100%;
		width: 4px;
		height: 4px;
		border: 1.5px solid currentColor;
		border-bottom: 0;
		border-radius: 3px 3px 0 0;
	}

	.keys {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: auto 0 0;
		padding: 12px 16px 0;
		font-size: 12px;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
	}
</style>
