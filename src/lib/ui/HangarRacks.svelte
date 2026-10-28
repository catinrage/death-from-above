<script lang="ts">
	import { BOMBS } from '$lib/game/defs-bombs';
	import {
		ALLOWED,
		MAX_COUNT,
		WEIGHT,
		adjust,
		canAdd,
		capacityOf,
		stockLoadout,
		weightOf,
		type Loadout
	} from '$lib/game/loadout';
	import {
		UPGRADES,
		extraPayload,
		levelOf,
		nextCost,
		upgradeApplies,
		type Progression,
		type UpgradeId
	} from '$lib/game/progression';
	import type { AircraftId, BombId } from '$lib/game/types';

	interface Props {
		aircraft: AircraftId;
		loadout: Loadout;
		wallet: Progression;
		onLoadout: (l: Loadout) => void;
		onBuyUpgrade: (u: UpgradeId) => void;
	}

	let { aircraft, loadout, wallet, onLoadout, onBuyUpgrade }: Props = $props();

	const extra = $derived(extraPayload(wallet, aircraft));
	const cap = $derived(capacityOf(aircraft, extra));
	const used = $derived(weightOf(loadout));
	const allowed = $derived(ALLOWED[aircraft]);
	const upgrades = $derived(UPGRADES.filter((u) => upgradeApplies(aircraft, u.id)));

	function change(b: BombId, d: number): void {
		const next = adjust(aircraft, loadout, b, d, extra);
		if (next !== loadout) onLoadout(next);
	}
</script>

<div class="ld-head">
	<h3>Loadout</h3>
	<button class="reset" onclick={() => onLoadout(stockLoadout(aircraft))}>Stock</button>
</div>
<div class="payload" style:--fill={Math.min(1, used / cap)} class:full={used >= cap}>
	<span class="bar"><span></span></span>
	<span class="num">{used}<small>/{cap}</small></span>
</div>
<ul class="racks">
	{#each allowed as b, i (b)}
		{@const n = loadout[b] ?? 0}
		<li
			class:empty={n === 0}
			class="m-wipe"
			style:--c={BOMBS[b].color}
			style:--i={i}
			style:--d="250ms"
			style:--f={n / MAX_COUNT[b]}
		>
			<span class="sw"></span>
			<span class="wn">
				<strong title={BOMBS[b].desc}>{BOMBS[b].short}</strong>
				<small class="tip">{BOMBS[b].tip}</small>
				<small>{WEIGHT[b]} pt · max {MAX_COUNT[b]}</small>
			</span>
			<span class="stepper">
				<button onclick={() => change(b, -1)} disabled={n === 0} aria-label="Fewer {BOMBS[b].short}"
					>−</button
				>
				{#key n}<output>{n}</output>{/key}
				<button
					onclick={() => change(b, 1)}
					disabled={!canAdd(aircraft, loadout, b, extra)}
					aria-label="More {BOMBS[b].short}">+</button
				>
			</span>
		</li>
	{/each}
</ul>
<h3>Upgrades</h3>
<ul class="upgrades">
	{#each upgrades as u (u.id)}
		{@const lv = levelOf(wallet, aircraft, u.id)}
		{@const cost = nextCost(wallet, aircraft, u.id)}
		<li>
			<span class="un">
				<strong>{u.name}</strong>
				<small>{u.blurb}</small>
			</span>
			<span class="pips" aria-label="Level {lv} of {u.costs.length}">
				{#each u.costs as _, k (k)}<i class:got={k < lv}></i>{/each}
			</span>
			<button
				class="buy"
				disabled={cost === null || cost > wallet.credits}
				onclick={() => onBuyUpgrade(u.id)}
				aria-label={cost === null ? `${u.name} maxed` : `Buy ${u.name} for ${cost} credits`}
			>
				{cost === null ? 'Max' : `${cost.toLocaleString()}`}
			</button>
		</li>
	{/each}
</ul>

<style>
	button {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
	}

	h3 {
		margin: 4px 0 0;
		font-family: var(--display);
		font-size: 13px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.upgrades {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}

	.upgrades li {
		display: grid;
		grid-template-columns: 1fr auto 64px;
		align-items: center;
		gap: 10px;
		padding: 5px 0 5px 10px;
		background: rgba(255, 255, 255, 0.03);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
	}

	.un {
		display: grid;
	}

	.un strong {
		font-family: var(--display);
		font-size: 13px;
		letter-spacing: 0.1em;
	}

	.un small {
		font-size: 11px;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
	}

	.pips {
		display: flex;
		gap: 3px;
	}

	.pips i {
		width: 8px;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		transform: skewX(-18deg);
	}

	.pips i.got {
		background: var(--amber);
		box-shadow: 0 0 6px var(--amber-glow);
		animation: pip 0.4s var(--m-snap);
	}

	@keyframes pip {
		from {
			transform: skewX(-18deg) scale(2);
			opacity: 0;
		}
	}

	.buy {
		height: 28px;
		margin-right: 6px;
		font-family: var(--display);
		font-size: 13px;
		color: var(--good);
		background: rgba(143, 227, 136, 0.08);
		box-shadow: inset 0 0 0 1px rgba(143, 227, 136, 0.25);
		transition: background 0.2s;
	}

	.buy:hover:not(:disabled) {
		background: rgba(143, 227, 136, 0.22);
	}

	.buy:disabled {
		color: var(--ink-faint);
		box-shadow: none;
		cursor: default;
	}

	.ld-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.reset {
		font-family: var(--display);
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.reset:hover {
		color: var(--amber);
	}

	.payload {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 10px;
	}

	.payload .bar {
		height: 8px;
		background: rgba(255, 255, 255, 0.07);
		clip-path: polygon(0 0, 100% 0, calc(100% - 5px) 100%, 0 100%);
	}

	.payload .bar span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, #6fd18a, #e3d36a);
		transform-origin: left;
		transform: scaleX(var(--fill));
		transition: transform 0.35s var(--m-ease);
	}

	.payload.full .bar span {
		background: linear-gradient(90deg, #e3d36a, var(--amber-hot));
	}

	.num {
		font-family: var(--display);
		font-size: 18px;
		font-variant-numeric: tabular-nums;
	}

	.num small {
		color: var(--ink-faint);
		font-size: 13px;
	}

	/* A rack per weapon: colour stripe, a fill showing how full it is, and a stepper. */
	.racks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}

	.racks li {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: 3px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 5px 6px 5px 0;
		background: rgba(255, 255, 255, 0.03);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
		transition: opacity 0.2s;
	}

	.racks li::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--c) 22%, transparent),
			color-mix(in srgb, var(--c) 4%, transparent)
		);
		transform-origin: left;
		transform: scaleX(var(--f));
		transition: transform 0.35s var(--m-ease);
	}

	.racks li.empty {
		opacity: 0.55;
	}

	.sw {
		align-self: stretch;
		background: var(--c);
		box-shadow: 0 0 8px var(--c);
	}

	.wn {
		display: grid;
	}

	.wn strong {
		font-family: var(--display);
		font-size: 14px;
		letter-spacing: 0.12em;
		color: var(--c);
	}

	.wn small {
		font-size: 11px;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.wn small.tip {
		letter-spacing: 0;
		color: var(--ink-dim);
	}

	.stepper {
		display: flex;
		align-items: center;
	}

	.stepper button {
		width: 28px;
		height: 28px;
		font-family: var(--display);
		font-size: 18px;
		line-height: 1;
		background: rgba(0, 0, 0, 0.3);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
		transition:
			background 0.15s,
			color 0.15s,
			transform 0.2s var(--m-snap);
	}

	.stepper button:hover:not(:disabled) {
		background: rgba(255, 176, 74, 0.25);
		color: var(--amber);
	}

	.stepper button:active:not(:disabled) {
		transform: scale(0.88);
	}

	.stepper button:disabled {
		opacity: 0.25;
		cursor: default;
	}

	output {
		min-width: 30px;
		text-align: center;
		font-family: var(--display);
		font-size: 16px;
		animation: bump 0.35s var(--m-snap);
	}

	@keyframes bump {
		from {
			transform: scale(1.5);
			color: var(--amber);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		output {
			animation: none;
		}
	}
</style>
