<script lang="ts">
	import { assets } from '$app/paths';
	import { onMount } from 'svelte';
	import { AIRCRAFT } from '$lib/game/defs-aircraft';
	import { BOMBS } from '$lib/game/defs-bombs';
	import { carriedOf, type Loadout } from '$lib/game/loadout';
	import type { QualityLevel, Settings } from './settings';
	import Letters from './Letters.svelte';
	import { menu, parallax } from './menu-fx';

	interface Props {
		settings: Settings;
		loadout: Loadout;
		best: number;
		/** Credits to spend in the hangar. */
		credits: number;
		onSortie: () => void;
		onHangar: () => void;
		onQuality: (q: QualityLevel) => void;
		onVolume: (v: number) => void;
		onControls: () => void;
	}

	let {
		settings,
		loadout,
		best,
		credits,
		onSortie,
		onHangar,
		onQuality,
		onVolume,
		onControls
	}: Props = $props();

	const selected = $derived(AIRCRAFT[settings.aircraft]);

	/** Zulu time in the status strip. */
	let clock = $state('');
	onMount(() => {
		const tick = (): void => {
			clock = new Date().toISOString().slice(11, 19) + 'Z';
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	});

	function onKey(e: KeyboardEvent): void {
		if (e.defaultPrevented) return;
		// Enter on an item reached with the arrows presses that item instead.
		const t = e.target;
		if (t instanceof HTMLElement && t.matches('[data-nav]:focus-visible')) return;
		if (e.code === 'Enter') {
			e.preventDefault();
			onSortie();
		} else if (e.code === 'KeyH') {
			onHangar();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="title" use:menu={{ nav: true }}>
	<div class="frame" aria-hidden="true">
		<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
		<div class="strip">
			<span>DFA <b>//</b> TAC-NET</span>
			<span class="link"><i></i> Secure link</span>
			<span class="clock">{clock}</span>
		</div>
	</div>

	<header class="brand" use:parallax={14}>
		<img
			class="emblem m-rise"
			src="{assets}/brand/logo-512.png"
			alt=""
			width="88"
			height="88"
			style:--i="0"
		/>
		<p class="m-kicker m-wipe" style:--d="250ms">Close air support · Dusk theatre</p>
		<h1>
			<span class="death"><Letters text="DEATH" delay={350} stagger={70} /></span>
			<span class="from"><Letters text="FROM ABOVE" delay={800} stagger={32} /></span>
		</h1>
		<p class="tag m-rise" style:--d="1150ms">
			Hold the airfield. Break the column. Every bomb you carry is someone's bad day.
		</p>
	</header>

	<aside class="readouts" use:parallax={6}>
		{#if best > 0}
			<div class="readout m-rise" style:--d="900ms">
				<span class="m-label">Best score</span>
				<strong>{best.toLocaleString()}</strong>
			</div>
		{/if}
		<div class="readout m-rise" style:--d="1000ms">
			<span class="m-label">Credits</span>
			<strong class="cr">{credits.toLocaleString()}<small>cr</small></strong>
		</div>
	</aside>

	<nav class="menu" aria-label="Main menu" use:parallax={8}>
		<button class="m-btn m-primary sortie m-wipe" style:--d="600ms" data-nav onclick={onSortie}>
			<span class="idx" aria-hidden="true">01</span>
			<span class="lbl">Sortie</span>
			<span class="m-chev" aria-hidden="true"><i></i><i></i><i></i></span>
			<span class="m-key">Enter</span>
		</button>
		<button class="m-btn ride m-wipe" style:--d="600ms" style:--i="1" data-nav onclick={onHangar}>
			<span class="idx" aria-hidden="true">02</span>
			<span class="ride-body">
				<span class="ride-head">
					<span class="lbl">Hangar</span>
					<span class="m-key">H</span>
				</span>
				<strong>{selected.name}</strong>
				<span class="ride-sub">{selected.real ?? selected.role}</span>
				<span class="chips">
					{#each carriedOf(loadout) as b (b)}
						<span style:--c={BOMBS[b].color}><i></i>{BOMBS[b].short}<b>×{loadout[b]}</b></span>
					{/each}
				</span>
			</span>
		</button>
		<button
			class="m-btn plain m-wipe"
			style:--d="600ms"
			style:--i="2"
			data-nav
			onclick={onControls}
		>
			<span class="idx" aria-hidden="true">03</span>
			<span class="lbl">Controls</span>
		</button>
	</nav>

	<section class="sys m-panel m-rise" style:--d="1100ms" aria-label="Settings" use:parallax={5}>
		<span class="m-label">Graphics</span>
		<div class="seg" role="group" aria-label="Graphics quality">
			{#each ['low', 'medium', 'high'] as const as q (q)}
				<button class="m-tile" class:on={settings.quality === q} onclick={() => onQuality(q)}
					>{q}</button
				>
			{/each}
		</div>
		<label class="vol">
			<span class="m-label">Volume <b>{Math.round(settings.volume * 100)}</b></span>
			<input
				class="m-range"
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={settings.volume}
				style:--v={settings.volume}
				oninput={(e) => onVolume(Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</label>
		<p class="hint">↑ ↓ select · Enter fly · H hangar</p>
	</section>
</div>

<style>
	.title {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto 1fr auto;
		gap: 16px 24px;
		padding: clamp(40px, 5vh, 64px) clamp(28px, 4vw, 64px) clamp(28px, 4.5vh, 52px);
		background:
			radial-gradient(ellipse 80% 70% at 62% 42%, transparent 40%, rgba(4, 5, 9, 0.7) 100%),
			linear-gradient(90deg, rgba(6, 7, 11, 0.82) 0%, rgba(6, 7, 11, 0.3) 38%, transparent 60%),
			linear-gradient(0deg, rgba(6, 7, 11, 0.85) 0%, transparent 42%);
		animation: fade 0.9s ease-out;
		overflow: hidden;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	/* Screen-edge brackets and the status strip: the menu is a sight picture. */
	.frame {
		position: absolute;
		inset: 14px;
		pointer-events: none;
	}

	.c {
		position: absolute;
		width: 34px;
		height: 34px;
		border: 0 solid rgba(255, 214, 160, 0.4);
		animation: corner 0.9s var(--m-ease) 0.1s backwards;
	}

	.tl {
		left: 0;
		top: 0;
		border-width: 1.5px 0 0 1.5px;
		--fx: 24px;
		--fy: 24px;
	}

	.tr {
		right: 0;
		top: 0;
		border-width: 1.5px 1.5px 0 0;
		--fx: -24px;
		--fy: 24px;
	}

	.bl {
		left: 0;
		bottom: 0;
		border-width: 0 0 1.5px 1.5px;
		--fx: 24px;
		--fy: -24px;
	}

	.br {
		right: 0;
		bottom: 0;
		border-width: 0 1.5px 1.5px 0;
		--fx: -24px;
		--fy: -24px;
	}

	@keyframes corner {
		from {
			opacity: 0;
			transform: translate(var(--fx), var(--fy));
		}
	}

	.strip {
		position: absolute;
		left: 50px;
		right: 50px;
		top: 6px;
		display: flex;
		justify-content: space-between;
		font-family: var(--display);
		font-size: 11px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-faint);
		animation: fade 1s ease-out 0.4s backwards;
	}

	.strip b {
		color: var(--amber);
		font-weight: 500;
	}

	.link {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.link i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--good);
		box-shadow: 0 0 8px var(--good);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}

	.clock {
		font-variant-numeric: tabular-nums;
	}

	/* ---- Brand ---- */

	.brand {
		grid-column: 1;
		grid-row: 1;
		max-width: 680px;
	}

	.emblem {
		display: block;
		width: clamp(56px, 9vh, 88px);
		height: auto;
		margin-bottom: 12px;
		filter: drop-shadow(0 0 18px rgba(255, 130, 40, 0.4));
	}

	h1 {
		margin: 14px 0 0;
		font-family: var(--display);
		line-height: 0.84;
	}

	.death {
		display: block;
		font-size: clamp(72px, min(11vw, 20vh), 176px);
		font-weight: 700;
		letter-spacing: 0.01em;
		filter: drop-shadow(0 0 30px rgba(255, 120, 40, 0.35))
			drop-shadow(0 6px 30px rgba(0, 0, 0, 0.6));
	}

	.death :global(.ch) {
		background: linear-gradient(180deg, #fff8ea 0%, #ffd8a2 50%, #ff8a3c 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.from {
		display: block;
		margin-top: 0.3em;
		font-size: clamp(20px, min(3.1vw, 5.4vh), 46px);
		font-weight: 600;
		letter-spacing: 0.5em;
		color: var(--ink);
		text-shadow: 0 2px 20px rgba(0, 0, 0, 0.7);
	}

	.tag {
		margin: 22px 0 0;
		padding-left: 14px;
		max-width: 440px;
		font-size: 18px;
		line-height: 1.35;
		color: var(--ink-dim);
		border-left: 2px solid var(--line);
	}

	/* ---- Readouts ---- */

	.readouts {
		grid-column: 2;
		grid-row: 1;
		align-self: start;
		display: grid;
		gap: 14px;
		justify-items: end;
		text-align: right;
	}

	.readout {
		display: grid;
		padding-right: 14px;
		border-right: 2px solid var(--amber);
	}

	.readout strong {
		font-family: var(--display);
		font-size: 34px;
		line-height: 1.1;
		color: var(--amber);
		font-variant-numeric: tabular-nums;
		text-shadow: 0 0 20px var(--amber-glow);
	}

	.readout .cr {
		color: var(--good);
		text-shadow: 0 0 20px rgba(143, 227, 136, 0.35);
	}

	.cr small {
		margin-left: 4px;
		font-size: 14px;
		color: var(--ink-faint);
	}

	/* ---- Main menu ---- */

	.menu {
		grid-column: 1;
		grid-row: 3;
		align-self: end;
		display: grid;
		gap: 8px;
		width: min(clamp(380px, 25vw, 520px), 100%);
	}

	.idx {
		font-family: var(--display);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.1em;
		opacity: 0.55;
		align-self: flex-start;
		padding-top: 4px;
	}

	.sortie {
		justify-content: flex-start;
		gap: 16px;
		padding: 18px 20px;
		font-size: 26px;
	}

	.sortie .idx {
		padding-top: 2px;
	}

	.sortie .m-chev {
		margin-right: 4px;
	}

	.ride {
		justify-content: flex-start;
		align-items: flex-start;
		gap: 16px;
		background: var(--m-glass);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}

	.ride-body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.ride-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: var(--amber);
		font-size: 12px;
		letter-spacing: 0.32em;
	}

	.ride strong {
		font-size: 24px;
		letter-spacing: 0.14em;
		line-height: 1.15;
		transition: transform 0.35s var(--m-ease);
	}

	.ride:hover strong,
	.ride:focus-visible strong {
		transform: translateX(4px);
	}

	.ride-sub {
		font-family: var(--body);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: none;
		color: var(--ink-dim);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
	}

	.chips span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 7px 3px 5px;
		font-size: 10px;
		letter-spacing: 0.1em;
		color: var(--ink);
		background: rgba(0, 0, 0, 0.3);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent);
	}

	.chips i {
		width: 3px;
		height: 10px;
		background: var(--c);
		box-shadow: 0 0 6px var(--c);
	}

	.chips b {
		font-weight: 500;
		color: var(--c);
	}

	.plain {
		justify-content: flex-start;
		gap: 16px;
		padding: 11px 20px;
		color: var(--ink-dim);
	}

	/* ---- Settings ---- */

	.sys {
		grid-column: 2;
		grid-row: 3;
		align-self: end;
		display: grid;
		gap: 8px;
		width: 260px;
		padding: 16px 18px 14px;
		--cut: 12px;
	}

	.seg {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		margin-bottom: 6px;
	}

	.seg button {
		padding: 7px 4px;
		justify-items: center;
		font-family: var(--display);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.seg button.on {
		color: var(--amber);
	}

	.vol {
		display: grid;
		gap: 4px;
	}

	.vol b {
		float: right;
		font-weight: 600;
		color: var(--ink-dim);
	}

	.hint {
		margin: 4px 0 0;
		font-size: 12px;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
	}

	@media (max-height: 700px) {
		.tag {
			display: none;
		}

		.emblem {
			margin-bottom: 4px;
		}
	}

	@media (max-height: 560px) {
		.emblem,
		.frame {
			display: none;
		}

		.title {
			padding-top: 24px;
		}

		.chips {
			display: none;
		}
	}

	@media (max-width: 980px) {
		.title {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr auto auto;
			overflow-y: auto;
		}

		.readouts,
		.menu,
		.sys {
			grid-column: 1;
		}

		.readouts {
			grid-row: 2;
			justify-items: start;
			text-align: left;
			grid-auto-flow: column;
		}

		.readout {
			padding: 0 0 0 12px;
			border-right: 0;
			border-left: 2px solid var(--amber);
		}

		.menu {
			grid-row: 4;
		}

		.sys {
			grid-row: 5;
			width: min(420px, 100%);
		}

		.strip {
			display: none;
		}
	}
</style>
