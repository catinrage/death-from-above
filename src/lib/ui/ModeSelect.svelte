<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { AIRCRAFT } from '$lib/game/defs-aircraft';
	import { isUnlocked, MISSIONS, type CampaignProgress, type Objective } from '$lib/game/campaign';
	import {
		canStrike,
		loadStrikes,
		saveStrike,
		sectorOf,
		STRIKE_IDS,
		STRIKES,
		type StrikeId
	} from '$lib/game/campaign-map';
	import CampaignMap from './CampaignMap.svelte';
	import EndlessPane from './EndlessPane.svelte';
	import { BIOMES, type BiomeId } from '$lib/game/biomes';
	import type { GameMode, ModeStart } from '$lib/game/hud';
	import type { EndlessRun } from '$lib/game/records';
	import { blip, menu, powerOn } from './menu-fx';

	interface Props {
		progress: CampaignProgress;
		board: EndlessRun[];
		best: number;
		trained: boolean;
		/** Credits in the wallet, to pay for strikes. */
		credits: number;
		/** Mode and mission to open on. */
		initial: ModeStart | null;
		onLaunch: (start: ModeStart) => void;
		onClose: () => void;
	}

	let { progress, board, best, trained, credits, initial, onLaunch, onClose }: Props = $props();

	/** Furthest mission the pilot may fly. */
	const frontier = $derived(
		[...MISSIONS].reverse().find((m) => isUnlocked(progress, m.id)) ?? MISSIONS[0]
	);
	// The menu opens on the last mode flown, or training for a new pilot.
	// svelte-ignore state_referenced_locally
	let tab = $state<GameMode>(initial?.mode ?? (trained ? 'campaign' : 'tutorial'));
	// svelte-ignore state_referenced_locally
	let picked = $state<string | null>(initial?.mode === 'campaign' ? initial.mission : null);
	// svelte-ignore state_referenced_locally
	let biome = $state<BiomeId>((initial?.mode === 'endless' && initial.biome) || 'temperate');
	/** Local two-player co-op: a second aircraft on a gamepad. Training is always solo. */
	// svelte-ignore state_referenced_locally
	let coop = $state(!!initial?.coop);
	const missionId = $derived(
		picked && isUnlocked(progress, picked) ? picked : (frontier?.id ?? MISSIONS[0].id)
	);
	const mission = $derived(MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0]);
	const missionIndex = $derived(MISSIONS.indexOf(mission));
	let strikes = $state(loadStrikes());
	const strike = $derived<StrikeId | null>(strikes[mission.id] ?? null);

	function pickStrike(id: StrikeId | null): void {
		strikes = saveStrike(mission.id, id);
	}
	const totalStars = $derived(Object.values(progress).reduce((n, r) => n + r.stars, 0));
	const won = $derived(Object.keys(progress).length);

	const MODES: { id: GameMode; name: string; sub: string; code: string }[] = [
		{ id: 'tutorial', name: 'Training', sub: 'Learn to fly and fight', code: 'TRN' },
		{ id: 'campaign', name: 'Campaign', sub: `${MISSIONS.length} missions`, code: 'CMP' },
		{ id: 'endless', name: 'Endless', sub: 'Waves until you fall', code: 'END' }
	];
	const tabIndex = $derived(MODES.findIndex((m) => m.id === tab));

	/** Set once the menu has launched or closed: its keys stay deaf while it fades out. */
	let done = false;

	function launch(): void {
		done = true;
		if (tab === 'campaign') onLaunch({ mode: 'campaign', mission: mission.id, strike, coop });
		else if (tab === 'endless') onLaunch({ mode: 'endless', biome, coop });
		else onLaunch({ mode: tab });
	}

	function describe(o: Objective): string {
		switch (o.type) {
			case 'waves':
				return `Hold the airfield for ${o.count} waves`;
			case 'destroy':
				return `${o.label}: ${o.count}`;
			case 'escort':
				return `Get ${o.count} vehicles of the friendly column across the river`;
		}
	}

	// Capture phase, so the title screen behind doesn't also act on Enter.
	function onKey(e: KeyboardEvent): void {
		if (done) return;
		if (e.code === 'Escape') {
			e.stopImmediatePropagation();
			e.preventDefault();
			blip('back');
			done = true;
			onClose();
		} else if (e.code === 'Enter') {
			// Enter on an item reached with the arrows presses that item instead.
			const t = e.target;
			if (t instanceof HTMLElement && t.matches('[data-nav]:focus-visible')) {
				e.stopImmediatePropagation();
				return;
			}
			e.stopImmediatePropagation();
			e.preventDefault();
			blip('select');
			launch();
		} else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
			// Left and right switch modes.
			e.stopImmediatePropagation();
			e.preventDefault();
			const d = e.code === 'ArrowLeft' ? -1 : 1;
			tab = MODES[(tabIndex + d + MODES.length) % MODES.length].id;
			blip('hover');
		}
	}
</script>

<svelte:window onkeydowncapture={onKey} />

<div
	class="m-veil"
	transition:fade={{ duration: 160 }}
	role="dialog"
	aria-modal="true"
	aria-label="Choose a mode"
>
	<div class="panel m-panel" in:powerOn use:menu={{ nav: true }}>
		<header>
			<div>
				<p class="m-kicker">Operations · Tasking order</p>
				<h2>Choose your sortie</h2>
			</div>
			<button class="m-btn close" data-back onclick={onClose} aria-label="Close"
				><span class="m-key">Esc</span></button
			>
		</header>

		<div class="tabs" role="tablist" aria-label="Game mode" style:--t={tabIndex}>
			<span class="slider" aria-hidden="true"></span>
			{#each MODES as m, i (m.id)}
				<button
					role="tab"
					aria-selected={tab === m.id}
					class="tab m-tile m-rise"
					class:on={tab === m.id}
					style:--i={i}
					style:--d="120ms"
					data-nav
					onclick={() => (tab = m.id)}
				>
					<span class="code" aria-hidden="true">{m.code}</span>
					<strong>{m.name}</strong>
					<small>
						{#if m.id === 'tutorial' && !trained}Recommended first
						{:else if m.id === 'tutorial'}Completed ✓
						{:else if m.id === 'campaign'}{won}/{MISSIONS.length} won · ★ {totalStars}
						{:else if best > 0}Best {best.toLocaleString()}
						{:else}{m.sub}{/if}
					</small>
				</button>
			{/each}
		</div>

		<div class="body" role="tabpanel">
			{#key tab}
				<div class="pane" in:fly={{ x: 24, duration: 380, opacity: 0 }}>
					{#if tab === 'tutorial'}
						<div class="detail">
							<p class="m-label">Flight training</p>
							<h3>Learn the ropes</h3>
							<p class="lead">
								A guided flight over a quiet stretch of front. Each lesson introduces one control
								and sets up targets to practise on: steering, guns, bombs, ordnance selection,
								guided missiles, focus, flares, afterburner and rearming.
							</p>
							<ul class="facts">
								<li class="m-rise" style:--i="0" style:--d="150ms"><b>12</b> short lessons</li>
								<li class="m-rise" style:--i="1" style:--d="150ms">
									You can't be shot down for good
								</li>
								<li class="m-rise" style:--i="2" style:--d="150ms">
									Flown in the <b>{AIRCRAFT.kestrel.name}</b>
								</li>
								<li class="m-rise" style:--i="3" style:--d="150ms">Enter skips a lesson</li>
							</ul>
						</div>
					{:else if tab === 'campaign'}
						<div class="campaign">
							<CampaignMap
								{progress}
								selected={mission.id}
								{strike}
								onPick={(id) => (picked = id)}
							/>
							<div class="split">
								<div class="detail">
									{#key mission.id}
										<div in:fly={{ y: 10, duration: 320 }}>
											<p class="m-label">
												Mission {missionIndex + 1} of {MISSIONS.length} · {sectorOf(mission.id)
													?.name} · {BIOMES[mission.biome].name}
											</p>
											<h3>{mission.name}</h3>
											<p class="lead">{mission.brief}</p>
										</div>
									{/key}
									<p class="m-label sub">Objectives</p>
									<ul class="objectives">
										{#each mission.objectives as o, k (k)}
											<li>{describe(o)}</li>
										{/each}
										{#if mission.baseFloor}
											<li>Keep the airfield above {Math.round(mission.baseFloor * 100)}%</li>
										{/if}
									</ul>
									<p class="hint">
										★ Win · ★ Airfield above 70% · ★ No aircraft lost
										{#if progress[mission.id]}
											<br />Best score {progress[mission.id].best.toLocaleString()}
										{/if}
									</p>
								</div>
								{#if canStrike(mission.id)}
									<aside class="strike-col">
										<p class="m-label sub">
											Strike ahead of the sortie · <b>{credits.toLocaleString()} cr</b>
										</p>
										<div class="strikes" role="radiogroup" aria-label="Strike target">
											{#each STRIKE_IDS as id (id)}
												{@const s = STRIKES[id]}
												{@const short = credits < s.cost}
												<button
													role="radio"
													aria-checked={strike === id}
													class="m-tile"
													class:on={strike === id}
													class:short
													disabled={short && strike !== id}
													data-nav
													onclick={() => pickStrike(strike === id ? null : id)}
												>
													<strong>{s.name} <em>{s.cost} cr</em></strong>
													<small>{short ? `Needs ${s.cost} credits. ` : ''}{s.effect}</small>
												</button>
											{/each}
										</div>
									</aside>
								{/if}
							</div>
						</div>
					{:else}
						<EndlessPane {biome} {board} onBiome={(id) => (biome = id)} />
					{/if}
				</div>
			{/key}
		</div>

		<footer>
			{#if tab !== 'tutorial'}
				<div class="players" role="radiogroup" aria-label="Players">
					<button
						role="radio"
						aria-checked={!coop}
						class="m-tile"
						class:on={!coop}
						data-nav
						onclick={() => (coop = false)}
					>
						<strong>1P</strong><small>Solo</small>
					</button>
					<button
						role="radio"
						aria-checked={coop}
						class="m-tile"
						class:on={coop}
						data-nav
						onclick={() => (coop = true)}
					>
						<strong>2P</strong><small>Co-op</small>
					</button>
					{#if coop}
						<p class="hint" transition:fade={{ duration: 150 }}>
							P1 keyboard and mouse · P2 gamepad. Six aircraft shared, one score.
						</p>
					{/if}
				</div>
			{/if}
			<button class="m-btn m-primary launch" data-nav onclick={launch}>
				<span>
					{tab === 'tutorial'
						? 'Start training'
						: tab === 'campaign'
							? `Fly ${mission.name}`
							: 'Start endless'}
				</span>
				<span class="m-chev" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="m-key">Enter</span>
			</button>
		</footer>
	</div>
</div>

<style>
	.panel {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		width: min(960px, 100%);
		max-height: calc(100vh - 32px);
		--cut: 22px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 20px 26px 14px;
	}

	h2 {
		margin: 8px 0 0;
		font-family: var(--display);
		font-size: 28px;
		line-height: 1;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.close {
		padding: 8px 10px;
	}

	/* ---- Tabs, with a bar that slides to the active one ---- */

	.tabs {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 0 26px;
		padding-bottom: 6px;
	}

	.slider {
		position: absolute;
		left: 0;
		bottom: 0;
		width: calc((100% - 16px) / 3);
		height: 2px;
		background: var(--amber);
		box-shadow: 0 0 12px var(--amber-glow);
		transform: translateX(calc(var(--t) * (100% + 8px)));
		transition: transform 0.45s var(--m-ease);
	}

	.tab {
		position: relative;
		overflow: hidden;
		padding: 12px 16px 12px;
	}

	.tab.on {
		box-shadow: inset 0 0 0 1px rgba(255, 186, 100, 0.35);
	}

	.code {
		position: absolute;
		right: 10px;
		top: 4px;
		font-family: var(--display);
		font-size: 34px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: rgba(255, 255, 255, 0.04);
		transition:
			color 0.3s,
			transform 0.5s var(--m-ease);
	}

	.tab:hover .code,
	.tab.on .code {
		color: rgba(255, 176, 74, 0.12);
		transform: translateX(-6px);
	}

	.tab strong {
		font-family: var(--display);
		font-size: 20px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		transition: color 0.2s;
	}

	.tab.on strong {
		color: var(--amber);
	}

	.tab small {
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--ink-dim);
	}

	/* ---- Body ---- */

	.body {
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 18px 26px 10px;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 176, 74, 0.35) transparent;
	}

	.campaign {
		display: grid;
		gap: 16px;
	}

	.split {
		display: grid;
		grid-template-columns: 1fr minmax(240px, 300px);
		gap: 24px;
	}

	.detail {
		min-width: 0;
	}

	h3 {
		margin: 6px 0 10px;
		font-family: var(--display);
		font-size: 34px;
		line-height: 1.05;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.lead {
		margin: 0;
		max-width: 560px;
		font-size: 17px;
		line-height: 1.4;
		color: var(--ink-dim);
	}

	.sub {
		display: block;
		margin: 18px 0 8px;
	}

	.sub b {
		font-weight: 600;
		color: var(--good);
	}

	.strike-col .sub {
		margin-top: 0;
	}

	.objectives,
	.facts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 5px;
		font-size: 16px;
	}

	.objectives li {
		display: flex;
		gap: 10px;
		align-items: baseline;
	}

	.objectives li::before {
		content: '';
		width: 6px;
		height: 6px;
		flex: none;
		border: 1.5px solid var(--amber);
		transform: rotate(45deg) translateY(-2px);
	}

	.facts {
		margin-top: 18px;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		max-width: 620px;
	}

	.facts li {
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.035);
		box-shadow: inset 2px 0 0 var(--amber);
		color: var(--ink-dim);
	}

	.facts b {
		color: var(--ink);
	}

	/* ---- Strikes ---- */

	.strikes {
		display: grid;
		gap: 6px;
	}

	.strikes button {
		align-content: start;
		padding: 9px 12px;
	}

	.strikes strong {
		font-family: var(--display);
		font-size: 14px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.strikes button.on strong {
		color: var(--amber);
	}

	.strikes button.on.short {
		--accent: var(--danger);
	}

	.strikes em {
		float: right;
		font-style: normal;
		font-size: 13px;
		color: var(--ink-dim);
	}

	.strikes small {
		font-size: 13px;
		line-height: 1.3;
		color: var(--ink-dim);
	}

	.hint {
		margin: 16px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-faint);
	}

	/* ---- Footer ---- */

	footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 16px;
		padding: 14px 26px 22px;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.players {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-right: auto;
	}

	.players button {
		gap: 0;
		padding: 7px 16px;
	}

	.players strong {
		font-family: var(--display);
		font-size: 18px;
		letter-spacing: 0.14em;
	}

	.players button.on strong {
		color: var(--amber);
	}

	.players small {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.players .hint {
		max-width: 220px;
		margin: 0 0 0 8px;
		font-size: 12px;
		line-height: 1.4;
	}

	.launch {
		min-width: 300px;
		gap: 18px;
	}

	.launch .m-chev {
		margin-left: auto;
	}

	@media (max-width: 720px) {
		.split {
			grid-template-columns: 1fr;
		}

		.tab strong {
			font-size: 16px;
		}

		.facts {
			grid-template-columns: 1fr;
		}

		h3 {
			font-size: 24px;
		}

		footer {
			flex-wrap: wrap;
		}

		.launch {
			min-width: 0;
			flex: 1;
		}

		.players .hint {
			display: none;
		}
	}
</style>
