<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { missionById } from '$lib/game/campaign';
	import {
		canStrike,
		loadStrikes,
		saveStrike,
		sectorOf,
		STRIKE_IDS,
		STRIKES,
		type StrikeId
	} from '$lib/game/campaign-map';
	import type { GameOverStats, ModeStart } from '$lib/game/hud';

	interface Props {
		stats: GameOverStats;
		onRetry: () => void;
		onTitle: () => void;
		/** Fly something else straight away (next mission, or the campaign after training). */
		onLaunch: (start: ModeStart) => void;
	}

	let { stats, onRetry, onTitle, onLaunch }: Props = $props();

	const won = $derived(stats.outcome === 'complete');
	const next = $derived(stats.nextMission ? missionById(stats.nextMission) : undefined);
	/** After a win, the strike to fly ahead of the next mission. */
	const striking = $derived(won && stats.mode === 'campaign' && !!next && canStrike(next.id));
	// svelte-ignore state_referenced_locally
	let strike = $state<StrikeId | null>(next ? (loadStrikes()[next.id] ?? null) : null);
	const nextSector = $derived(next ? sectorOf(next.id) : undefined);

	function pickStrike(id: StrikeId): void {
		if (!next) return;
		strike = strike === id ? null : id;
		saveStrike(next.id, strike);
	}
	/** The Enter / primary action. */
	const primary = $derived.by((): { label: string; run: () => void } => {
		if (won && stats.mode === 'tutorial')
			return {
				label: 'Start the campaign',
				run: () => onLaunch({ mode: 'campaign', mission: 'first-light' })
			};
		if (won && next)
			return {
				label: `Next: ${next.name}`,
				run: () => onLaunch({ mode: 'campaign', mission: next.id, strike })
			};
		return {
			label: won ? 'Fly it again' : stats.mode === 'endless' ? 'Fly again' : 'Retry',
			run: onRetry
		};
	});
	const kicker = $derived(
		stats.mode === 'tutorial'
			? won
				? 'Training complete'
				: 'Training'
			: stats.mode === 'campaign'
				? won
					? `${stats.title} · mission complete`
					: `${stats.title} · mission failed`
				: 'Endless · run over'
	);

	const minutes = $derived(Math.floor(stats.time / 60));
	const seconds = $derived(
		Math.floor(stats.time % 60)
			.toString()
			.padStart(2, '0')
	);

	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Enter') primary.run();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="veil" class:won transition:fade={{ duration: 400 }}>
	<div class="content" in:fly={{ y: 24, duration: 500, delay: 250 }}>
		<p class="kicker">{kicker}</p>
		<h2>{stats.reason}</h2>
		{#if stats.mode === 'campaign' && won && stats.starNotes}
			<ul class="stars">
				{#each stats.starNotes as n, i (i)}
					<li class:got={n.got} style:--d="{0.5 + i * 0.25}s">
						<i>★</i>
						<span>{n.label}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if stats.mode !== 'tutorial'}
			<div class="score">
				<span>{stats.mode === 'campaign' ? 'Mission score' : 'Final score'}</span>
				<strong>{stats.score.toLocaleString()}</strong>
				{#if stats.newBest}<em>New personal best</em>
				{:else if stats.best > 0}<em class="dim">Best {stats.best.toLocaleString()}</em>{/if}
				{#if stats.mode === 'endless' && stats.rank}
					<em class="rank">#{stats.rank} on your leaderboard</em>
				{/if}
			</div>
		{/if}
		<dl>
			<div>
				<dt>{stats.mode === 'tutorial' ? 'Lessons' : 'Wave reached'}</dt>
				<dd>{stats.mode === 'tutorial' ? '12/12' : stats.wave}</dd>
			</div>
			<div>
				<dt>Kills</dt>
				<dd>{stats.kills}</dd>
			</div>
			{#if stats.civilians > 0}
				<div>
					<dt>Civilian casualties</dt>
					<dd class="bad">{stats.civilians}</dd>
				</div>
			{/if}
			<div>
				<dt>Longest chain</dt>
				<dd>{stats.bestCombo}</dd>
			</div>
			<div>
				<dt>Time in theatre</dt>
				<dd>{minutes}:{seconds}</dd>
			</div>
		</dl>
		{#if striking && next}
			<div class="strike">
				<p>
					The front moves up{nextSector ? ` to ${nextSector.name}` : ''}. Pick a target to hit
					before {next.name}:
				</p>
				<div class="chips" role="radiogroup" aria-label="Strike target">
					{#each STRIKE_IDS as id (id)}
						<button
							role="radio"
							aria-checked={strike === id}
							class:on={strike === id}
							title={STRIKES[id].effect}
							onclick={() => pickStrike(id)}>{STRIKES[id].name}</button
						>
					{/each}
				</div>
				<small class="effect">{strike ? STRIKES[strike].effect : 'No strike: full strength'}</small>
			</div>
		{/if}
		<div class="actions">
			<button class="primary" onclick={primary.run}>{primary.label} <small>Enter</small></button>
			{#if primary.run !== onRetry}
				<button onclick={onRetry}>{stats.mode === 'tutorial' ? 'Train again' : 'Replay'}</button>
			{/if}
			<button onclick={onTitle}>Main menu</button>
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

	.veil.won {
		background: radial-gradient(ellipse at center, rgba(40, 26, 4, 0.5), rgba(4, 5, 9, 0.88));
	}

	.kicker {
		margin: 0;
		font-size: 15px;
		letter-spacing: 0.5em;
		text-transform: uppercase;
		color: var(--danger);
	}

	.won .kicker {
		color: var(--good);
	}

	.won h2 {
		text-shadow: 0 0 40px rgba(255, 170, 60, 0.4);
	}

	.stars {
		list-style: none;
		display: flex;
		gap: 26px;
		margin: 18px 0 0;
		padding: 0;
	}

	.stars li {
		display: grid;
		justify-items: center;
		gap: 4px;
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.stars i {
		font-style: normal;
		font-size: 44px;
		line-height: 1;
		color: rgba(255, 255, 255, 0.12);
	}

	.stars li.got {
		color: var(--ink);
	}

	.stars li.got i {
		color: var(--amber);
		text-shadow: 0 0 22px var(--amber-glow);
		animation: star 0.5s cubic-bezier(0.2, 1.5, 0.5, 1) both;
		animation-delay: var(--d);
	}

	@keyframes star {
		from {
			scale: 2.4;
			opacity: 0;
		}
	}

	.score em.rank {
		color: var(--amber);
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

	dd.bad {
		color: var(--danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
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

	.strike {
		display: grid;
		justify-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	.strike p {
		margin: 0;
		font-size: 15px;
		color: var(--ink-dim);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}

	.chips button {
		padding: 8px 14px;
		font-size: 14px;
	}

	.chips button.on {
		border-color: var(--amber);
		color: var(--amber);
		background: rgba(255, 176, 74, 0.12);
	}

	.strike .effect {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
	}

	@media (max-width: 700px) {
		dl {
			grid-template-columns: repeat(2, auto);
		}
	}
</style>
