<script lang="ts">
	import { assets } from '$app/paths';
	import { AIRCRAFT } from '$lib/game/defs-aircraft';
	import { BOMBS } from '$lib/game/defs-bombs';
	import { carriedOf, type Loadout } from '$lib/game/loadout';
	import type { QualityLevel, Settings } from './settings';

	interface Props {
		settings: Settings;
		loadout: Loadout;
		best: number;
		onSortie: () => void;
		onHangar: () => void;
		onQuality: (q: QualityLevel) => void;
		onVolume: (v: number) => void;
		onMusic: (v: number) => void;
		onControls: () => void;
	}

	let {
		settings,
		loadout,
		best,
		onSortie,
		onHangar,
		onQuality,
		onVolume,
		onMusic,
		onControls
	}: Props = $props();

	const selected = $derived(AIRCRAFT[settings.aircraft]);

	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Enter') {
			e.preventDefault();
			onSortie();
		} else if (e.code === 'KeyH') {
			onHangar();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="title">
	<header class="brand">
		<img class="emblem" src="{assets}/brand/logo-512.png" alt="" width="96" height="96" />
		<div class="eyebrow"><span class="dot"></span> Close air support · Dusk theatre</div>
		<h1>
			<span class="death">DEATH</span>
			<span class="from">FROM ABOVE</span>
		</h1>
		<p class="tag">
			Hold the airfield. Break the column. Every bomb you carry is someone's bad day.
		</p>
	</header>

	{#if best > 0}
		<div class="best">
			<span>Best</span>
			<strong>{best.toLocaleString()}</strong>
		</div>
	{/if}

	<aside class="actions">
		<button class="sortie" onclick={onSortie}>
			<span>Sortie</span>
			<small>Enter</small>
		</button>
		<button class="ride" onclick={onHangar}>
			<span class="ride-head">
				<span class="ride-label">Hangar</span>
				<small>H</small>
			</span>
			<strong>{selected.name}</strong>
			<span class="ride-sub">{selected.real ?? selected.role}</span>
			<span class="chips">
				{#each carriedOf(loadout) as b (b)}
					<span style:--c={BOMBS[b].color}>{BOMBS[b].short} ×{loadout[b]}</span>
				{/each}
			</span>
		</button>
		<div class="row">
			<button class="ghost" onclick={onControls}>Controls</button>
			<div class="seg" role="group" aria-label="Graphics quality">
				{#each ['low', 'medium', 'high'] as const as q (q)}
					<button class:on={settings.quality === q} onclick={() => onQuality(q)}>{q}</button>
				{/each}
			</div>
		</div>
		<label class="vol">
			<span>Volume</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={settings.volume}
				oninput={(e) => onVolume(Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</label>
		<label class="vol">
			<span>Music</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={settings.music}
				oninput={(e) => onMusic(Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</label>
	</aside>
</div>

<style>
	.title {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto 1fr auto;
		padding: clamp(20px, 4vw, 56px);
		background:
			linear-gradient(
				90deg,
				rgba(6, 7, 11, 0.78) 0%,
				rgba(6, 7, 11, 0.25) 42%,
				rgba(6, 7, 11, 0) 65%
			),
			linear-gradient(0deg, rgba(6, 7, 11, 0.85) 0%, rgba(6, 7, 11, 0) 38%);
		animation: fade 0.9s ease-out;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	.brand {
		grid-column: 1;
		max-width: 620px;
	}

	.emblem {
		display: block;
		width: clamp(64px, 7vw, 96px);
		height: auto;
		margin-bottom: 10px;
		filter: drop-shadow(0 0 18px rgba(255, 130, 40, 0.35));
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.dot {
		width: 8px;
		height: 8px;
		background: var(--amber-hot);
		box-shadow: 0 0 12px var(--amber-hot);
		animation: blink 1.6s steps(2, start) infinite;
	}

	@keyframes blink {
		to {
			visibility: hidden;
		}
	}

	h1 {
		margin: 14px 0 0;
		font-family: var(--display);
		line-height: 0.82;
		text-shadow: 0 6px 40px rgba(0, 0, 0, 0.6);
	}

	.death {
		display: block;
		font-size: clamp(64px, 11vw, 168px);
		font-weight: 700;
		letter-spacing: -0.01em;
		background: linear-gradient(180deg, #fff6e6 0%, #ffd29a 55%, #ff8a3c 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 28px rgba(255, 130, 40, 0.35));
	}

	.from {
		display: block;
		margin-top: 12px;
		font-size: clamp(22px, 3.2vw, 46px);
		font-weight: 600;
		letter-spacing: 0.42em;
		color: var(--ink);
	}

	.tag {
		margin: 22px 0 0;
		max-width: 440px;
		font-size: 18px;
		line-height: 1.35;
		color: var(--ink-dim);
	}

	.best {
		grid-column: 2;
		grid-row: 1;
		justify-self: end;
		text-align: right;
		font-family: var(--display);
	}

	.best span {
		display: block;
		font-size: 12px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.best strong {
		font-size: 34px;
		color: var(--amber);
	}

	.ride {
		display: grid;
		gap: 2px;
		padding: 14px 16px;
		text-align: left;
		cursor: pointer;
		color: var(--ink);
		background: var(--panel);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-left: 3px solid var(--amber-hot);
		backdrop-filter: blur(6px);
		transition:
			border-color 0.15s,
			background 0.15s,
			transform 0.15s;
	}

	.ride:hover {
		background: var(--panel-strong);
		border-color: var(--line);
		transform: translateX(3px);
	}

	.ride-head {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.ride-head small {
		color: var(--ink-faint);
		letter-spacing: 0.2em;
	}

	.ride strong {
		font-family: var(--display);
		font-size: 26px;
		letter-spacing: 0.12em;
	}

	.ride-sub {
		font-size: 14px;
		color: var(--ink-dim);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
	}

	.chips span {
		font-family: var(--display);
		font-size: 11px;
		letter-spacing: 0.08em;
		padding: 2px 6px;
		color: var(--c);
		border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
	}

	.actions {
		grid-column: 1;
		grid-row: 3;
		align-self: end;
		display: grid;
		gap: 12px;
		width: min(380px, 100%);
	}

	.sortie {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 22px;
		cursor: pointer;
		border: none;
		background: linear-gradient(100deg, #ffb04a, #ff6a24);
		color: #1a0d04;
		font-family: var(--display);
		font-size: 26px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
		box-shadow: 0 0 40px rgba(255, 120, 40, 0.35);
		transition:
			filter 0.15s ease,
			transform 0.15s ease;
	}

	.sortie:hover {
		filter: brightness(1.1);
		transform: translateY(-2px);
	}

	.sortie:active {
		transform: translateY(1px);
	}

	.sortie small {
		font-family: var(--body);
		font-size: 12px;
		letter-spacing: 0.2em;
		opacity: 0.7;
	}

	.row {
		display: flex;
		gap: 8px;
	}

	.ghost,
	.seg button {
		cursor: pointer;
		padding: 8px 12px;
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		background: var(--panel);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--ink-dim);
	}

	.ghost:hover,
	.seg button:hover {
		color: var(--ink);
		border-color: var(--line);
	}

	.seg {
		display: flex;
		flex: 1;
	}

	.seg button {
		flex: 1;
		padding: 8px 6px;
	}

	.seg button.on {
		color: #1a0d04;
		background: var(--amber);
		border-color: var(--amber);
	}

	.vol {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.vol span {
		min-width: 4.6em;
	}

	.vol input {
		accent-color: var(--amber);
	}

	@media (max-width: 980px) {
		.title {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr auto auto;
			overflow-y: auto;
		}

		.best,
		.actions {
			grid-column: 1;
		}

		.best {
			grid-row: 2;
			justify-self: start;
			text-align: left;
		}

		.actions {
			grid-row: 4;
			margin-top: 16px;
		}
	}
</style>
