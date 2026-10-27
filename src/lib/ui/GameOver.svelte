<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { GameOverStats } from '$lib/game/hud';

	interface Props {
		stats: GameOverStats;
		onRetry: () => void;
		onTitle: () => void;
	}

	let { stats, onRetry, onTitle }: Props = $props();

	const minutes = $derived(Math.floor(stats.time / 60));
	const seconds = $derived(
		Math.floor(stats.time % 60)
			.toString()
			.padStart(2, '0')
	);

	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Enter') onRetry();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="veil" transition:fade={{ duration: 400 }}>
	<div class="content" in:fly={{ y: 24, duration: 500, delay: 250 }}>
		<p class="kicker">Mission failed</p>
		<h2>{stats.reason}</h2>
		<div class="score">
			<span>Final score</span>
			<strong>{stats.score.toLocaleString()}</strong>
			{#if stats.newBest}<em>New personal best</em>{:else}<em class="dim"
					>Best {stats.best.toLocaleString()}</em
				>{/if}
		</div>
		<dl>
			<div>
				<dt>Wave reached</dt>
				<dd>{stats.wave}</dd>
			</div>
			<div>
				<dt>Kills</dt>
				<dd>{stats.kills}</dd>
			</div>
			<div>
				<dt>Longest chain</dt>
				<dd>{stats.bestCombo}</dd>
			</div>
			<div>
				<dt>Time in theatre</dt>
				<dd>{minutes}:{seconds}</dd>
			</div>
		</dl>
		<div class="actions">
			<button class="primary" onclick={onRetry}>Fly again <small>Enter</small></button>
			<button onclick={onTitle}>Back to hangar</button>
		</div>
	</div>
</div>

<style>
	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: radial-gradient(ellipse at center, rgba(40, 6, 4, 0.55), rgba(4, 5, 9, 0.88));
	}

	.content {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 10px;
		padding: 24px;
	}

	.kicker {
		margin: 0;
		font-size: 15px;
		letter-spacing: 0.5em;
		text-transform: uppercase;
		color: var(--danger);
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: clamp(30px, 5vw, 60px);
		letter-spacing: 0.08em;
		text-shadow: 0 0 40px rgba(255, 60, 30, 0.4);
	}

	.score {
		display: grid;
		margin-top: 18px;
	}

	.score span {
		font-size: 13px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.score strong {
		font-family: var(--display);
		font-size: 64px;
		line-height: 1.1;
		color: var(--amber);
		text-shadow: 0 0 30px var(--amber-glow);
	}

	.score em {
		font-style: normal;
		font-size: 14px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--good);
	}

	.score em.dim {
		color: var(--ink-faint);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(4, auto);
		gap: 28px;
		margin: 24px 0 8px;
	}

	dt {
		font-size: 12px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	dd {
		margin: 4px 0 0;
		font-family: var(--display);
		font-size: 28px;
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-top: 16px;
	}

	button {
		cursor: pointer;
		padding: 14px 22px;
		font-size: 17px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	button:hover {
		border-color: var(--line);
		background: rgba(255, 176, 74, 0.1);
	}

	.primary {
		background: var(--amber);
		border-color: var(--amber);
		color: #1a0d04;
		font-weight: 700;
	}

	.primary:hover {
		background: #ffc06a;
	}

	small {
		margin-left: 10px;
		font-size: 12px;
		opacity: 0.7;
	}

	@media (max-width: 700px) {
		dl {
			grid-template-columns: repeat(2, auto);
		}
	}
</style>
