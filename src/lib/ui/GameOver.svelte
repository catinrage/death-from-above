<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { GameOverStats, ModeStart } from '$lib/game/hud';
	import Letters from './Letters.svelte';
	import { countUp, menu, powerOn } from './menu-fx';

	interface Props {
		stats: GameOverStats;
		onRetry: () => void;
		onTitle: () => void;
		/** Fly something else straight away (the war, after training). */
		onLaunch: (start: ModeStart) => void;
	}

	let { stats, onRetry, onTitle, onLaunch }: Props = $props();

	const won = $derived(stats.outcome === 'complete');
	/** The Enter / primary action. */
	const primary = $derived.by((): { label: string; run: () => void } => {
		if (won && stats.mode === 'tutorial')
			return { label: 'Go to war', run: () => onLaunch({ mode: 'war' }) };
		return { label: won ? 'Fight again' : 'Try again', run: onRetry };
	});
	const kicker = $derived(
		stats.mode === 'tutorial'
			? won
				? 'Training complete'
				: 'Training'
			: won
				? 'Victory'
				: 'Defeat'
	);

	const minutes = $derived(Math.floor(stats.time / 60));
	const seconds = $derived(
		Math.floor(stats.time % 60)
			.toString()
			.padStart(2, '0')
	);

	/** Readout tiles under the score. */
	const tiles = $derived(
		[
			{
				label: stats.mode === 'tutorial' ? 'Lessons' : 'Wave reached',
				value: stats.mode === 'tutorial' ? '12/12' : String(stats.wave),
				bad: false
			},
			{ label: 'Kills', value: String(stats.kills), bad: false },
			stats.civilians > 0
				? { label: 'Civilian casualties', value: String(stats.civilians), bad: true }
				: null,
			{ label: 'Longest chain', value: String(stats.bestCombo), bad: false },
			{ label: 'Time in theatre', value: `${minutes}:${seconds}`, bad: false }
		].filter((t) => t !== null)
	);

	// The score and the credits tick up as the report comes in.
	let shownScore = $state(0);
	let shownCredits = $state(0);
	onMount(() => {
		const a = countUp(stats.score, (v) => (shownScore = v), { delay: 650, duration: 1300 });
		const b = countUp(stats.credits?.total ?? 0, (v) => (shownCredits = v), {
			delay: 850,
			duration: 1000
		});
		return () => {
			a();
			b();
		};
	});

	/** Set once Enter has acted: the debrief stays deaf while it fades out. */
	let done = false;

	function onKey(e: KeyboardEvent): void {
		if (done) return;
		// Enter on an item reached with the arrows presses that item instead.
		const t = e.target;
		if (t instanceof HTMLElement && t.matches('[data-nav]:focus-visible')) return;
		if (e.code === 'Enter') {
			done = true;
			primary.run();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="m-veil veil" class:won transition:fade={{ duration: 400 }}>
	<div class="panel m-panel" in:powerOn={{ delay: 200, duration: 480 }} use:menu={{ nav: true }}>
		<span class="stamp" aria-hidden="true">{won ? 'Complete' : 'Failed'}</span>
		<p class="m-kicker kicker">Debrief · {kicker}</p>
		<h2><Letters text={stats.reason} delay={350} stagger={22} /></h2>
		<div class="headline">
			{#if stats.mode !== 'tutorial'}
				<div class="score m-rise" style:--d="500ms">
					<span class="m-label">Final score</span>
					<strong>{shownScore.toLocaleString()}</strong>
					{#if stats.newBest}<em class="best">New personal best</em>
					{:else if stats.best > 0}<em class="dim">Best {stats.best.toLocaleString()}</em>{/if}
				</div>
			{/if}
			{#if stats.credits}
				<div class="credits m-rise" style:--d="650ms">
					<span class="m-label">Credits earned</span>
					<strong>+{shownCredits.toLocaleString()}</strong>
					<em class="dim">{stats.credits.balance.toLocaleString()} in the hangar</em>
					{#if stats.credits.lines.length > 1}
						<ul>
							{#each stats.credits.lines as l (l.label)}
								<li><span>{l.label}</span> <b>+{l.amount.toLocaleString()}</b></li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
		<dl>
			{#each tiles as t, i (t.label)}
				<div class="m-rise" style:--i={i} style:--d="800ms">
					<dt>{t.label}</dt>
					<dd class:bad={t.bad}>{t.value}</dd>
				</div>
			{/each}
		</dl>
		<div class="actions">
			<button class="m-btn m-primary m-wipe" style:--d="900ms" data-nav onclick={primary.run}>
				<span>{primary.label}</span>
				<span class="m-chev" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="m-key">Enter</span>
			</button>
			{#if primary.run !== onRetry}
				<button class="m-btn m-wipe" style:--d="900ms" style:--i="1" data-nav onclick={onRetry}
					>{stats.mode === 'tutorial' ? 'Train again' : 'Replay'}</button
				>
			{/if}
			<button
				class="m-btn m-wipe"
				style:--d="900ms"
				style:--i="2"
				data-nav
				data-back
				onclick={onTitle}>Main menu</button
			>
		</div>
	</div>
</div>

<style>
	.veil {
		background:
			radial-gradient(ellipse at 50% 40%, rgba(60, 8, 4, 0.45), rgba(4, 5, 9, 0.88) 75%),
			var(--m-scan);
		--tone: var(--danger);
	}

	.veil.won {
		background:
			radial-gradient(ellipse at 50% 40%, rgba(50, 34, 6, 0.4), rgba(4, 5, 9, 0.86) 75%),
			var(--m-scan);
		--tone: var(--good);
	}

	.panel {
		display: grid;
		justify-items: center;
		gap: 12px;
		width: min(780px, 100%);
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		scrollbar-width: none;
		padding: 28px clamp(18px, 4vw, 40px) 26px;
		text-align: center;
		--cut: 24px;
	}

	/* A rubber stamp thumped onto the report. */
	.stamp {
		position: absolute;
		right: 26px;
		top: 22px;
		padding: 4px 10px;
		font-family: var(--display);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--tone);
		border: 2px solid var(--tone);
		opacity: 0.75;
		rotate: -8deg;
		animation: stamp 0.45s var(--m-snap) 1.3s backwards;
	}

	@keyframes stamp {
		from {
			opacity: 0;
			transform: scale(2.6);
		}
	}

	.kicker {
		color: var(--tone);
	}

	h2 {
		margin: 0;
		max-width: 100%;
		font-family: var(--display);
		font-size: clamp(28px, 4.4vw, 52px);
		line-height: 1.05;
		letter-spacing: 0.06em;
		text-shadow: 0 0 40px rgba(255, 60, 30, 0.35);
	}

	h2 :global(.letters) {
		white-space: normal;
	}

	.won h2 {
		text-shadow: 0 0 40px rgba(255, 170, 60, 0.35);
	}

	@keyframes star {
		from {
			scale: 2.4;
			opacity: 0;
		}
	}

	.headline {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: flex-start;
		gap: 12px 56px;
		margin-top: 8px;
	}

	.score,
	.credits {
		display: grid;
		justify-items: center;
	}

	.score strong,
	.credits strong {
		font-family: var(--display);
		font-size: 60px;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
		color: var(--amber);
		text-shadow: 0 0 30px var(--amber-glow);
	}

	.credits strong {
		font-size: 40px;
		padding-top: 10px;
		color: var(--good);
		text-shadow: 0 0 24px rgba(143, 227, 136, 0.35);
	}

	em {
		font-style: normal;
		font-size: 13px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	em.best {
		color: var(--good);
		animation: flash 0.9s steps(2, start) 1.6s 3 backwards;
	}

	@keyframes flash {
		to {
			visibility: hidden;
		}
	}

	em.dim {
		color: var(--ink-faint);
	}

	.credits ul {
		display: grid;
		gap: 2px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.credits b {
		font-weight: 600;
		color: var(--ink-dim);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 6px;
		width: 100%;
		margin: 10px 0 0;
	}

	dl div {
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.035);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.06),
			inset 0 2px 0 rgba(255, 176, 74, 0.35);
	}

	dt {
		font-family: var(--display);
		font-size: 10px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	dd {
		margin: 4px 0 0;
		font-family: var(--display);
		font-size: 26px;
		font-variant-numeric: tabular-nums;
	}

	dd.bad {
		color: var(--danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-top: 12px;
	}

	.actions .m-primary {
		min-width: 280px;
		font-size: 17px;
	}

	.actions .m-primary .m-chev {
		margin-left: auto;
	}

	@media (max-height: 640px) {
		.score strong {
			font-size: 44px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stamp,
		em.best {
			animation: none;
		}
	}
</style>
