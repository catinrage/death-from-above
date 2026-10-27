<script lang="ts">
	import { AIRCRAFT, AIRCRAFT_ORDER } from '$lib/game/defs-aircraft';
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
		AIRCRAFT_PRICE,
		UPGRADES,
		extraPayload,
		levelOf,
		nextCost,
		owns,
		upgradeApplies,
		upgradedDef,
		type Progression,
		type UpgradeId
	} from '$lib/game/progression';
	import type { AircraftId, BombId } from '$lib/game/types';

	interface Props {
		/** The aircraft on show: the one you fly, or one you haven't bought yet. */
		aircraft: AircraftId;
		/** Loadout of the aircraft you fly. */
		loadout: Loadout;
		wallet: Progression;
		onSelect: (id: AircraftId) => void;
		onLoadout: (l: Loadout) => void;
		onBuyAircraft: (id: AircraftId) => void;
		onBuyUpgrade: (u: UpgradeId) => void;
		onBack: () => void;
		onSortie: () => void;
	}

	let {
		aircraft,
		loadout: flown,
		wallet,
		onSelect,
		onLoadout,
		onBuyAircraft,
		onBuyUpgrade,
		onBack,
		onSortie
	}: Props = $props();

	const STATS = [
		{ key: 'speed', label: 'Speed' },
		{ key: 'armor', label: 'Armour' },
		{ key: 'payload', label: 'Payload' },
		{ key: 'agility', label: 'Agility' }
	] as const;

	const owned = $derived(owns(wallet, aircraft));
	const price = $derived(AIRCRAFT_PRICE[aircraft]);
	const def = $derived(upgradedDef(AIRCRAFT[aircraft], wallet.upgrades[aircraft]));
	const extra = $derived(extraPayload(wallet, aircraft));
	const cap = $derived(capacityOf(aircraft, extra));
	/** An aircraft not yet bought shows its stock racks, read-only. */
	const loadout = $derived(owned ? flown : stockLoadout(aircraft));
	const used = $derived(weightOf(loadout));
	const allowed = $derived(ALLOWED[aircraft]);
	const upgrades = $derived(UPGRADES.filter((u) => upgradeApplies(aircraft, u.id)));

	function change(b: BombId, d: number): void {
		const next = adjust(aircraft, loadout, b, d, extra);
		if (next !== loadout) onLoadout(next);
	}

	function onKey(e: KeyboardEvent): void {
		const i = AIRCRAFT_ORDER.indexOf(aircraft);
		const n = AIRCRAFT_ORDER.length;
		if (e.code === 'Escape') onBack();
		else if (e.code === 'Enter') {
			if (owned) onSortie();
		} else if (e.code === 'ArrowDown' || e.code === 'KeyS') onSelect(AIRCRAFT_ORDER[(i + 1) % n]);
		else if (e.code === 'ArrowUp' || e.code === 'KeyW') onSelect(AIRCRAFT_ORDER[(i + n - 1) % n]);
		else return;
		e.preventDefault();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="hangar">
	<nav class="fleet" aria-label="Aircraft">
		<header>
			<button class="back" onclick={onBack} aria-label="Back to menu">‹ Menu</button>
			<h2>Hangar</h2>
			<span class="wallet" title="Credits, earned from campaign missions and endless runs">
				{wallet.credits.toLocaleString()} <small>cr</small>
			</span>
		</header>
		<ul>
			{#each AIRCRAFT_ORDER as id, i (id)}
				{@const a = AIRCRAFT[id]}
				{@const locked = !owns(wallet, id)}
				<li>
					<button
						class:on={id === aircraft}
						class:locked
						onclick={() => onSelect(id)}
						aria-pressed={id === aircraft}
					>
						<span class="idx">{String(i + 1).padStart(2, '0')}</span>
						<span class="nm">{a.name}</span>
						{#if locked}
							<span class="sub price">{AIRCRAFT_PRICE[id].toLocaleString()} cr</span>
						{:else}
							<span class="sub">{a.real ?? a.role}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<p class="keys">↑ ↓ choose · Enter fly · Esc back</p>
	</nav>

	<section class="stage" aria-live="polite">
		<div class="callsign">
			<span class="role">{def.role}</span>
			<h1>{def.name}</h1>
			{#if def.real}<span class="real">{def.real}</span>{/if}
		</div>
	</section>

	<aside class="spec">
		<p class="blurb">{def.blurb}</p>
		<dl class="bars">
			{#each STATS as s (s.key)}
				<div>
					<dt>{s.label}</dt>
					<dd><span style:--v={def.stats[s.key]}></span></dd>
				</div>
			{/each}
		</dl>
		<dl class="facts">
			<div>
				<dt>Armour</dt>
				<dd>{def.hp}</dd>
			</div>
			<div>
				<dt>Flares</dt>
				<dd>{def.flares}</dd>
			</div>
			<div>
				<dt>Missiles</dt>
				<dd>{def.missiles}</dd>
			</div>
			<div>
				<dt>Boost</dt>
				<dd>{def.boostFx === 'smokyBurner' ? 'afterburner' : def.boostFx}</dd>
			</div>
		</dl>

		{#if owned}
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
		{/if}

		<div class="ld-head">
			<h3>Loadout</h3>
			{#if owned}
				<button class="reset" onclick={() => onLoadout(stockLoadout(aircraft))}>Stock</button>
			{/if}
		</div>
		<div class="payload" style:--fill={used / cap} class:full={used >= cap}>
			<span class="bar"><span></span></span>
			<span class="num">{used}<small>/{cap}</small></span>
		</div>
		<ul class="racks">
			{#each allowed as b (b)}
				{@const n = loadout[b] ?? 0}
				<li class:empty={n === 0} style:--c={BOMBS[b].color}>
					<span class="sw"></span>
					<span class="wn">
						<strong>{BOMBS[b].short}</strong>
						<small>{WEIGHT[b]} pt · max {MAX_COUNT[b]}</small>
					</span>
					<span class="stepper">
						<button
							onclick={() => change(b, -1)}
							disabled={!owned || n === 0}
							aria-label="Fewer {BOMBS[b].short}">−</button
						>
						<output>{n}</output>
						<button
							onclick={() => change(b, 1)}
							disabled={!owned || !canAdd(aircraft, loadout, b, extra)}
							aria-label="More {BOMBS[b].short}">+</button
						>
					</span>
				</li>
			{/each}
		</ul>
		{#if owned}
			<button class="go" onclick={onSortie}>
				<span>Take off</span>
				<small>Enter</small>
			</button>
		{:else}
			<button class="go" disabled={wallet.credits < price} onclick={() => onBuyAircraft(aircraft)}>
				<span>Buy</span>
				<small>
					{wallet.credits < price
						? `${(price - wallet.credits).toLocaleString()} cr short`
						: `${price.toLocaleString()} cr`}
				</small>
			</button>
		{/if}
	</aside>
</div>

<style>
	.hangar {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: minmax(200px, 250px) 1fr minmax(300px, 360px);
		gap: clamp(12px, 2vw, 28px);
		padding: clamp(14px, 2.5vw, 32px);
		background:
			linear-gradient(90deg, rgba(6, 7, 11, 0.86) 0%, rgba(6, 7, 11, 0.2) 24%, transparent 40%),
			linear-gradient(270deg, rgba(6, 7, 11, 0.9) 0%, rgba(6, 7, 11, 0.25) 30%, transparent 46%);
		animation: in 0.35s ease-out;
	}

	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.fleet,
	.spec {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 14px;
		margin-bottom: 12px;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 22px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}

	button {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
	}

	.back {
		font-family: var(--display);
		font-size: 13px;
		letter-spacing: 0.14em;
		color: var(--ink-dim);
		padding: 4px 0;
	}

	.back:hover {
		color: var(--amber);
	}

	.fleet ul {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: grid;
		gap: 2px;
	}

	.fleet li button {
		width: 100%;
		display: grid;
		grid-template-columns: 30px 1fr;
		grid-template-rows: auto auto;
		text-align: left;
		padding: 9px 12px 9px 10px;
		border-left: 2px solid transparent;
		transition:
			background 0.15s,
			border-color 0.15s,
			padding 0.15s;
	}

	.fleet li button:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.fleet li button.on {
		background: linear-gradient(90deg, rgba(255, 150, 60, 0.18), rgba(255, 150, 60, 0));
		border-left-color: var(--amber-hot);
		padding-left: 16px;
	}

	.idx {
		grid-row: span 2;
		font-family: var(--display);
		font-size: 12px;
		color: var(--ink-faint);
		padding-top: 3px;
	}

	.nm {
		font-family: var(--display);
		font-size: 17px;
		letter-spacing: 0.12em;
	}

	.on .nm {
		color: var(--amber);
	}

	.locked .nm {
		color: var(--ink-dim);
	}

	.sub.price {
		color: var(--ink-faint);
	}

	.sub.price::before {
		content: '🔒 ';
		font-size: 11px;
	}

	.wallet {
		margin-left: auto;
		white-space: nowrap;
		font-family: var(--display);
		font-size: 17px;
		color: var(--good);
	}

	.wallet small {
		font-size: 12px;
		color: var(--ink-faint);
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
		background: var(--panel);
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
	}

	.pips i.got {
		background: var(--amber);
		box-shadow: 0 0 6px var(--amber-glow);
	}

	.buy {
		height: 28px;
		margin-right: 6px;
		font-family: var(--display);
		font-size: 13px;
		color: var(--good);
		background: rgba(255, 255, 255, 0.05);
	}

	.buy:hover:not(:disabled) {
		background: rgba(143, 227, 136, 0.18);
	}

	.buy:disabled {
		color: var(--ink-faint);
		cursor: default;
	}

	.sub {
		font-size: 13px;
		color: var(--ink-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.keys {
		margin: auto 0 0;
		padding-top: 10px;
		font-size: 12px;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
	}

	.stage {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		pointer-events: none;
	}

	.callsign {
		text-align: center;
	}

	.callsign .role {
		font-size: 13px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.callsign h1 {
		margin: 2px 0 0;
		font-family: var(--display);
		font-size: clamp(34px, 5vw, 64px);
		letter-spacing: 0.12em;
		line-height: 1;
		text-shadow: 0 4px 30px rgba(0, 0, 0, 0.6);
	}

	.callsign .real {
		display: inline-block;
		margin-top: 6px;
		font-size: 15px;
		letter-spacing: 0.08em;
		color: var(--ink-dim);
	}

	.spec {
		overflow-y: auto;
		scrollbar-width: none;
		gap: 12px;
	}

	.blurb {
		margin: 0;
		font-size: 17px;
		line-height: 1.3;
		color: var(--ink-dim);
	}

	dl {
		margin: 0;
	}

	.bars {
		display: grid;
		gap: 6px;
	}

	.bars div,
	.facts div {
		display: grid;
		grid-template-columns: 74px 1fr;
		align-items: center;
	}

	dt {
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	dd {
		margin: 0;
	}

	.bars dd {
		height: 4px;
		background: rgba(255, 255, 255, 0.08);
	}

	.bars dd span {
		display: block;
		height: 100%;
		width: calc(var(--v) * 100%);
		background: linear-gradient(90deg, var(--amber), var(--amber-hot));
		box-shadow: 0 0 10px var(--amber-glow);
		transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 16px;
		padding: 10px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.facts dd {
		font-family: var(--display);
		font-size: 15px;
		text-transform: capitalize;
	}

	.ld-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	h3 {
		margin: 0;
		font-family: var(--display);
		font-size: 15px;
		letter-spacing: 0.28em;
		text-transform: uppercase;
	}

	.reset {
		font-size: 12px;
		letter-spacing: 0.16em;
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
		width: calc(var(--fill) * 100%);
		background: linear-gradient(90deg, #6fd18a, #e3d36a);
		transition: width 0.2s ease;
	}

	.payload.full .bar span {
		background: linear-gradient(90deg, #e3d36a, var(--amber-hot));
	}

	.num {
		font-family: var(--display);
		font-size: 18px;
	}

	.num small {
		color: var(--ink-faint);
		font-size: 13px;
	}

	.racks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}

	.racks li {
		display: grid;
		grid-template-columns: 4px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 6px 8px 6px 0;
		background: var(--panel);
		transition: opacity 0.15s;
	}

	.racks li.empty {
		opacity: 0.55;
	}

	.sw {
		align-self: stretch;
		background: var(--c);
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
		background: rgba(255, 255, 255, 0.05);
	}

	.stepper button:hover:not(:disabled) {
		background: rgba(255, 176, 74, 0.25);
		color: var(--amber);
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
	}

	.go {
		margin-top: auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		font-family: var(--display);
		font-size: 22px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: #1a0d04;
		background: linear-gradient(90deg, var(--amber), var(--amber-hot));
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
		box-shadow: 0 0 30px var(--amber-glow);
		flex-shrink: 0;
	}

	.go small {
		font-size: 11px;
		letter-spacing: 0.2em;
		opacity: 0.7;
	}

	.go:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.go:disabled {
		filter: grayscale(0.8) brightness(0.6);
		cursor: default;
	}

	@media (max-width: 860px) {
		.hangar {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			overflow-y: auto;
		}

		.stage {
			display: none;
		}
	}
</style>
