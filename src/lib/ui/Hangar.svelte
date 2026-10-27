<script lang="ts">
	import { AIRCRAFT, AIRCRAFT_ORDER } from '$lib/game/defs-aircraft';
	import { stockLoadout, type Loadout } from '$lib/game/loadout';
	import {
		AIRCRAFT_PRICE,
		owns,
		upgradedDef,
		type Progression,
		type UpgradeId
	} from '$lib/game/progression';
	import type { AircraftId } from '$lib/game/types';
	import HangarFleet from './HangarFleet.svelte';
	import HangarRacks from './HangarRacks.svelte';
	import Letters from './Letters.svelte';
	import { blip, menu, parallax } from './menu-fx';

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
	/** An aircraft not yet bought shows its stock racks, read-only. */
	const loadout = $derived(owned ? flown : stockLoadout(aircraft));

	function onKey(e: KeyboardEvent): void {
		const i = AIRCRAFT_ORDER.indexOf(aircraft);
		const n = AIRCRAFT_ORDER.length;
		if (e.code === 'Escape') {
			blip('back');
			onBack();
		} else if (e.code === 'Enter') {
			if (owned) {
				blip('select');
				onSortie();
			}
		} else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
			blip('hover');
			onSelect(AIRCRAFT_ORDER[(i + 1) % n]);
		} else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
			blip('hover');
			onSelect(AIRCRAFT_ORDER[(i + n - 1) % n]);
		} else return;
		e.preventDefault();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="hangar" use:menu>
	<HangarFleet {aircraft} {wallet} {onSelect} {onBack} />

	<section class="stage" aria-live="polite">
		{#key def.name}
			<div class="callsign">
				<span class="m-kicker role">{def.role}</span>
				<h1><Letters text={def.name} stagger={40} /></h1>
				{#if def.real}<span class="real m-rise" style:--d="300ms">{def.real}</span>{/if}
			</div>
		{/key}
		<div class="sight" aria-hidden="true">
			<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
			<span class="tag">{owned ? 'Ready' : 'Not owned'}</span>
		</div>
	</section>

	<aside class="spec m-panel m-rise" style:--d="120ms" use:parallax={6}>
		<div class="scroll">
			{#key aircraft}
				<p class="blurb">{def.blurb}</p>
				<dl class="bars">
					{#each STATS as s, i (s.key)}
						<div>
							<dt>{s.label}</dt>
							<dd style:--v={def.stats[s.key]} style:--i={i}>
								<span class="fill"></span>
								<b>{Math.round(def.stats[s.key] * 100)}</b>
							</dd>
						</div>
					{/each}
				</dl>
			{/key}
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

			<HangarRacks {aircraft} {loadout} {owned} {wallet} {onLoadout} {onBuyUpgrade} />
		</div>
		{#if owned}
			<button class="m-btn m-primary go" onclick={onSortie}>
				<span>Take off</span>
				<span class="m-chev" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="m-key">Enter</span>
			</button>
		{:else}
			<button
				class="m-btn m-primary go"
				disabled={wallet.credits < price}
				onclick={() => onBuyAircraft(aircraft)}
			>
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
		grid-template-columns: clamp(220px, 16vw, 340px) 1fr clamp(310px, 22vw, 460px);
		gap: clamp(12px, 2vw, 28px);
		padding: clamp(14px, 2.5vw, 32px);
		background:
			linear-gradient(90deg, rgba(6, 7, 11, 0.7) 0%, transparent 30%),
			linear-gradient(270deg, rgba(6, 7, 11, 0.75) 0%, transparent 34%),
			radial-gradient(ellipse 60% 55% at 50% 52%, transparent 55%, rgba(4, 5, 9, 0.55) 100%);
		animation: in 0.5s ease-out;
	}

	@keyframes in {
		from {
			opacity: 0;
		}
	}

	button {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
	}

	/* ---- Fleet ---- */

	.spec {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* ---- Stage: callsign over the showcased aircraft ---- */

	.stage {
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		pointer-events: none;
	}

	.callsign {
		display: grid;
		justify-items: center;
		text-align: center;
	}

	.callsign .role {
		animation: fadein 0.6s ease-out backwards;
	}

	@keyframes fadein {
		from {
			opacity: 0;
		}
	}

	.callsign h1 {
		margin: 8px 0 0;
		font-family: var(--display);
		font-size: clamp(36px, min(5vw, 9vh), 72px);
		letter-spacing: 0.14em;
		line-height: 1;
		text-shadow:
			0 0 30px rgba(255, 140, 50, 0.25),
			0 4px 30px rgba(0, 0, 0, 0.6);
	}

	.callsign .real {
		margin-top: 8px;
		font-size: 15px;
		letter-spacing: 0.1em;
		color: var(--ink-dim);
	}

	/* Brackets framing the aircraft on show. */
	.sight {
		position: absolute;
		left: 50%;
		top: 52%;
		width: min(58%, 520px);
		aspect-ratio: 2.1;
		translate: -50% -50%;
		animation: sight 0.8s var(--m-ease) 0.2s backwards;
	}

	@keyframes sight {
		from {
			opacity: 0;
			transform: scale(1.25);
		}
	}

	.c {
		position: absolute;
		width: 26px;
		height: 26px;
		border: 0 solid rgba(255, 214, 160, 0.45);
	}

	.tl {
		left: 0;
		top: 0;
		border-width: 1.5px 0 0 1.5px;
	}

	.tr {
		right: 0;
		top: 0;
		border-width: 1.5px 1.5px 0 0;
	}

	.bl {
		left: 0;
		bottom: 0;
		border-width: 0 0 1.5px 1.5px;
	}

	.br {
		right: 0;
		bottom: 0;
		border-width: 0 1.5px 1.5px 0;
	}

	.tag {
		position: absolute;
		left: 50%;
		bottom: -26px;
		translate: -50% 0;
		font-family: var(--display);
		font-size: 11px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	/* ---- Spec sheet ---- */

	.spec {
		padding: 18px 18px 16px;
		gap: 12px;
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.blurb {
		margin: 0;
		font-size: 17px;
		line-height: 1.3;
		color: var(--ink-dim);
		animation: fadein 0.5s ease-out backwards;
	}

	dl {
		margin: 0;
	}

	.bars {
		display: grid;
		gap: 7px;
	}

	.bars div,
	.facts div {
		display: grid;
		grid-template-columns: 74px 1fr;
		align-items: center;
	}

	dt {
		font-family: var(--display);
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	dd {
		margin: 0;
	}

	/* Segmented bars that charge up from empty for each aircraft. */
	.bars dd {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 30px;
		align-items: center;
		gap: 8px;
	}

	.bars dd::before {
		content: '';
		grid-area: 1 / 1;
		height: 7px;
		background: repeating-linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.08) 0 8px,
			transparent 8px 10px
		);
	}

	.fill {
		grid-area: 1 / 1;
		height: 7px;
		background: linear-gradient(90deg, var(--amber-hot), var(--amber) 70%, #ffe0a8);
		mask: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px);
		-webkit-mask: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px);
		filter: drop-shadow(0 0 5px var(--amber-glow));
		transform-origin: left;
		transform: scaleX(var(--v));
		animation: charge 0.9s var(--m-ease) backwards;
		animation-delay: calc(var(--i) * 80ms);
	}

	@keyframes charge {
		from {
			transform: scaleX(0);
		}
	}

	.bars b {
		font-family: var(--display);
		font-size: 12px;
		font-weight: 500;
		text-align: right;
		color: var(--ink-dim);
	}

	.facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 16px;
		padding: 10px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.facts dd {
		font-family: var(--display);
		font-size: 15px;
		text-transform: capitalize;
	}

	.go {
		flex-shrink: 0;
	}

	.go .m-chev {
		margin-left: auto;
	}

	.go small {
		font-family: var(--body);
		font-size: 12px;
		letter-spacing: 0.16em;
		opacity: 0.8;
	}

	@media (max-width: 860px) {
		.hangar {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto;
			overflow-y: auto;
		}

		.stage {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fill,
		.sight {
			animation: none;
		}
	}
</style>
