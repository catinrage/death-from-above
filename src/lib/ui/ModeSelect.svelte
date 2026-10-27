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
	import { BIOMES, BIOME_ORDER, type BiomeId } from '$lib/game/biomes';
	import type { GameMode, ModeStart } from '$lib/game/hud';
	import type { EndlessRun } from '$lib/game/records';

	interface Props {
		progress: CampaignProgress;
		board: EndlessRun[];
		best: number;
		trained: boolean;
		/** Mode and mission to open on. */
		initial: ModeStart | null;
		onLaunch: (start: ModeStart) => void;
		onClose: () => void;
	}

	let { progress, board, best, trained, initial, onLaunch, onClose }: Props = $props();

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

	const MODES: { id: GameMode; name: string; sub: string }[] = [
		{ id: 'tutorial', name: 'Training', sub: 'Learn to fly and fight' },
		{ id: 'campaign', name: 'Campaign', sub: `${MISSIONS.length} missions` },
		{ id: 'endless', name: 'Endless', sub: 'Waves until you fall' }
	];

	function launch(): void {
		if (tab === 'campaign') onLaunch({ mode: 'campaign', mission: mission.id, strike });
		else if (tab === 'endless') onLaunch({ mode: 'endless', biome });
		else onLaunch({ mode: tab });
	}

	function describe(o: Objective): string {
		switch (o.type) {
			case 'waves':
				return `Hold the airfield for ${o.count} waves`;
			case 'destroy':
				return `${o.label}: ${o.count}`;
			case 'bridge':
				return 'Drop a span of the river bridge';
			case 'escort':
				return `Get ${o.count} vehicles of the friendly column across the river`;
		}
	}

	// Capture phase, so the title screen behind doesn't also act on Enter.
	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Escape') {
			e.stopImmediatePropagation();
			e.preventDefault();
			onClose();
		} else if (e.code === 'Enter') {
			e.stopImmediatePropagation();
			e.preventDefault();
			launch();
		}
	}

	function dateOf(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:window onkeydowncapture={onKey} />

<div
	class="veil"
	transition:fade={{ duration: 160 }}
	role="dialog"
	aria-modal="true"
	aria-label="Choose a mode"
>
	<div class="panel" in:fly={{ y: 16, duration: 260 }}>
		<header>
			<h2>Choose your sortie</h2>
			<button class="close" onclick={onClose} aria-label="Close">Esc</button>
		</header>

		<div class="tabs" role="tablist" aria-label="Game mode">
			{#each MODES as m (m.id)}
				<button
					role="tab"
					aria-selected={tab === m.id}
					class:on={tab === m.id}
					onclick={() => (tab = m.id)}
				>
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
			{#if tab === 'tutorial'}
				<div class="detail" in:fade={{ duration: 140 }}>
					<p class="kicker">Flight training</p>
					<h3>Learn the ropes</h3>
					<p class="lead">
						A guided flight over a quiet stretch of front. Each lesson introduces one control and
						sets up targets to practise on: steering, guns, bombs, ordnance selection, guided
						missiles, focus, flares, afterburner and rearming.
					</p>
					<ul class="facts">
						<li><b>12</b> short lessons</li>
						<li>You can't be shot down for good</li>
						<li>Flown in the <b>{AIRCRAFT.kestrel.name}</b></li>
						<li>Enter skips a lesson</li>
					</ul>
				</div>
			{:else if tab === 'campaign'}
				<div class="campaign" in:fade={{ duration: 140 }}>
					<CampaignMap {progress} selected={mission.id} {strike} onPick={(id) => (picked = id)} />
					<div class="split">
						<div class="detail">
							<p class="kicker">
								Mission {missionIndex + 1} of {MISSIONS.length} · {sectorOf(mission.id)?.name} · {BIOMES[
									mission.biome
								].name}
							</p>
							<h3>{mission.name}</h3>
							<p class="lead">{mission.brief}</p>
							<p class="sub">Objectives</p>
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
								<p class="sub">Strike ahead of the sortie</p>
								<div class="strikes" role="radiogroup" aria-label="Strike target">
									{#each STRIKE_IDS as id (id)}
										{@const s = STRIKES[id]}
										<button
											role="radio"
											aria-checked={strike === id}
											class:on={strike === id}
											onclick={() => pickStrike(strike === id ? null : id)}
										>
											<strong>{s.name}</strong>
											<small>{s.effect}</small>
										</button>
									{/each}
								</div>
							</aside>
						{/if}
					</div>
				</div>
			{:else}
				<div class="detail" in:fade={{ duration: 140 }}>
					<p class="kicker">Endless</p>
					<h3>Hold as long as you can</h3>
					<p class="lead">
						Wave after wave, each bigger than the last. Past wave six the columns keep growing, and
						past wave eleven more interceptors and gunships join every attack. Clearing a wave pays
						a bonus that grows with the wave and with what is left of the airfield.
					</p>
					<p class="sub">Theatre</p>
					<div class="biomes" role="radiogroup" aria-label="Theatre">
						{#each BIOME_ORDER as id (id)}
							<button
								role="radio"
								aria-checked={biome === id}
								class:on={biome === id}
								class="biome-{id}"
								onclick={() => (biome = id)}
								title={BIOMES[id].blurb}
							>
								<i aria-hidden="true"></i>
								<strong>{BIOMES[id].name}</strong>
							</button>
						{/each}
					</div>
					<p class="hint biome-blurb">{BIOMES[biome].blurb}</p>
					{#if board.length > 0}
						<p class="sub">Your best runs</p>
						<table>
							<thead>
								<tr
									><th>#</th><th>Score</th><th>Wave</th><th>Kills</th><th>Aircraft</th><th></th></tr
								>
							</thead>
							<tbody>
								{#each board as r, i (r.date)}
									<tr>
										<td>{i + 1}</td>
										<td class="sc">{r.score.toLocaleString()}</td>
										<td>{r.wave}</td>
										<td>{r.kills}</td>
										<td>{AIRCRAFT[r.aircraft]?.name ?? r.aircraft}</td>
										<td class="dt">{dateOf(r.date)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<p class="hint">No runs yet. Your five best will be listed here.</p>
					{/if}
				</div>
			{/if}
		</div>

		<footer>
			<button class="launch" onclick={launch}>
				<span>
					{tab === 'tutorial'
						? 'Start training'
						: tab === 'campaign'
							? `Fly ${mission.name}`
							: 'Start endless'}
				</span>
				<small>Enter</small>
			</button>
		</footer>
	</div>
</div>

<style>
	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(4, 5, 9, 0.6);
		backdrop-filter: blur(5px) saturate(0.7);
	}

	.panel {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		width: min(920px, 100%);
		max-height: calc(100vh - 32px);
		background: var(--panel-strong);
		border-top: 2px solid var(--amber);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px 10px;
	}

	h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 26px;
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}

	.close {
		cursor: pointer;
		padding: 6px 10px;
		font-size: 12px;
		letter-spacing: 0.2em;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: var(--ink-dim);
	}

	.close:hover {
		color: var(--ink);
		border-color: var(--line);
	}

	.tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		padding: 0 24px;
	}

	.tabs button {
		display: grid;
		gap: 2px;
		padding: 12px 14px;
		text-align: left;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-bottom: 2px solid transparent;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.tabs button:hover {
		background: rgba(255, 176, 74, 0.08);
	}

	.tabs button.on {
		background: rgba(255, 176, 74, 0.12);
		border-color: var(--line);
		border-bottom-color: var(--amber);
	}

	.tabs strong {
		font-family: var(--display);
		font-size: 20px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.tabs button.on strong {
		color: var(--amber);
	}

	.tabs small {
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--ink-dim);
	}

	.body {
		min-height: 0;
		overflow-y: auto;
		padding: 14px 24px;
	}

	.campaign {
		display: grid;
		gap: 16px;
	}

	.split {
		display: grid;
		grid-template-columns: 1fr minmax(240px, 300px);
		gap: 22px;
	}

	.strike-col .sub {
		margin-top: 0;
	}

	.strikes {
		display: grid;
		gap: 6px;
	}

	.strikes button {
		display: grid;
		gap: 2px;
		align-content: start;
		padding: 8px 10px;
		text-align: left;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-left: 2px solid transparent;
	}

	.strikes button:hover {
		background: rgba(255, 176, 74, 0.08);
	}

	.strikes button.on {
		background: rgba(255, 176, 74, 0.12);
		border-color: var(--line);
		border-left-color: var(--amber);
	}

	.strikes strong {
		font-family: var(--display);
		font-size: 15px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.strikes button.on strong {
		color: var(--amber);
	}

	.strikes small {
		font-size: 13px;
		line-height: 1.3;
		color: var(--ink-dim);
	}

	.detail {
		min-width: 0;
	}

	.kicker {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--amber);
	}

	h3 {
		margin: 6px 0 10px;
		font-family: var(--display);
		font-size: 32px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.lead {
		margin: 0;
		font-size: 17px;
		line-height: 1.4;
		color: var(--ink-dim);
		max-width: 560px;
	}

	.sub {
		margin: 18px 0 6px;
		font-size: 12px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.objectives,
	.facts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 4px;
		font-size: 16px;
	}

	.objectives li::before {
		content: '▸ ';
		color: var(--amber);
	}

	.facts {
		margin-top: 16px;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.facts li {
		padding: 8px 10px;
		background: rgba(255, 255, 255, 0.04);
		border-left: 2px solid var(--line);
		color: var(--ink-dim);
	}

	.facts b {
		color: var(--ink);
	}

	.biomes {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 6px;
		max-width: 620px;
	}

	.biomes button {
		display: grid;
		gap: 6px;
		padding: 6px 6px 8px;
		cursor: pointer;
		text-align: left;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-bottom: 2px solid transparent;
	}

	.biomes button:hover {
		background: rgba(255, 176, 74, 0.08);
	}

	.biomes button.on {
		border-color: var(--line);
		border-bottom-color: var(--amber);
		background: rgba(255, 176, 74, 0.12);
	}

	.biomes i {
		display: block;
		height: 26px;
	}

	.biomes strong {
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.biomes button.on strong {
		color: var(--amber);
	}

	.biome-temperate i {
		background: linear-gradient(#8fa4b8 0 45%, #4f5f2c 45% 70%, #6b5a34 70%);
	}

	.biome-desert i {
		background: linear-gradient(#d9c39a 0 45%, #c49a5c 45% 70%, #a57844 70%);
	}

	.biome-snow i {
		background: linear-gradient(#b8c4d4 0 45%, #e6eaf2 45% 70%, #3e5246 70%);
	}

	.biome-jungle i {
		background: linear-gradient(#9fb0a0 0 45%, #2f5326 45% 70%, #5a3a22 70%);
	}

	.biome-city i {
		background: linear-gradient(#8e96a2 0 30%, #585c64 30% 70%, #2b2c2e 70%);
	}

	.biome-blurb {
		margin-top: 8px;
	}

	.hint {
		margin: 16px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-faint);
	}

	table {
		width: 100%;
		max-width: 620px;
		border-collapse: collapse;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	th {
		text-align: left;
		font-weight: 400;
		font-size: 12px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-faint);
		padding: 4px 8px;
	}

	td {
		padding: 6px 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	td.sc {
		font-family: var(--display);
		color: var(--amber);
	}

	td.dt {
		color: var(--ink-faint);
	}

	footer {
		display: flex;
		justify-content: flex-end;
		padding: 10px 24px 20px;
	}

	.launch {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 14px 22px;
		cursor: pointer;
		border: none;
		background: linear-gradient(100deg, #ffb04a, #ff6a24);
		color: #1a0d04;
		font-family: var(--display);
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
		box-shadow: 0 0 30px rgba(255, 120, 40, 0.3);
	}

	.launch:hover {
		filter: brightness(1.1);
	}

	.launch small {
		font-family: var(--body);
		font-size: 12px;
		letter-spacing: 0.2em;
		opacity: 0.7;
	}

	@media (max-width: 720px) {
		.split {
			grid-template-columns: 1fr;
		}

		.biomes {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.tabs strong {
			font-size: 16px;
		}

		.facts {
			grid-template-columns: 1fr;
		}

		h3 {
			font-size: 24px;
		}
	}
</style>
