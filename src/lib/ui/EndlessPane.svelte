<script lang="ts">
	import { AIRCRAFT } from '$lib/game/defs-aircraft';
	import { BIOMES, BIOME_ORDER, type BiomeId } from '$lib/game/biomes';
	import type { EndlessRun } from '$lib/game/records';

	interface Props {
		biome: BiomeId;
		board: EndlessRun[];
		onBiome: (id: BiomeId) => void;
	}

	let { biome, board, onBiome }: Props = $props();

	function dateOf(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="detail">
	<p class="m-label">Endless</p>
	<h3>Hold as long as you can</h3>
	<p class="lead">
		Wave after wave, each bigger than the last. Past wave six the columns keep growing, and past
		wave eleven more interceptors and gunships join every attack. Clearing a wave pays a bonus that
		grows with the wave and with what is left of the airfield.
	</p>
	<p class="m-label sub">Theatre</p>
	<div class="biomes" role="radiogroup" aria-label="Theatre">
		{#each BIOME_ORDER as id, i (id)}
			<button
				role="radio"
				aria-checked={biome === id}
				class="m-tile m-rise biome-{id}"
				class:on={biome === id}
				style:--i={i}
				style:--d="120ms"
				data-nav
				onclick={() => onBiome(id)}
				title={BIOMES[id].blurb}
			>
				<i aria-hidden="true"></i>
				<strong>{BIOMES[id].name}</strong>
			</button>
		{/each}
	</div>
	<p class="hint biome-blurb">{BIOMES[biome].blurb}</p>
	{#if board.length > 0}
		<p class="m-label sub">Your best runs</p>
		<table>
			<thead>
				<tr><th>#</th><th>Score</th><th>Wave</th><th>Kills</th><th>Aircraft</th><th></th></tr>
			</thead>
			<tbody>
				{#each board as r, i (r.date)}
					<tr class="m-rise" style:--i={i} style:--d="200ms">
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

<style>
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

	.hint {
		margin: 16px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-faint);
	}

	.biomes {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 6px;
		max-width: 640px;
	}

	.biomes button {
		gap: 7px;
		padding: 5px 5px 8px;
	}

	.biomes i {
		display: block;
		height: 34px;
		filter: saturate(0.6) brightness(0.8);
		transition:
			filter 0.3s,
			transform 0.4s var(--m-ease);
	}

	.biomes button:hover i,
	.biomes button.on i {
		filter: none;
	}

	.biomes button.on i {
		transform: scale(1.04);
	}

	.biomes strong {
		font-family: var(--display);
		font-size: 12px;
		letter-spacing: 0.16em;
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

	table {
		width: 100%;
		max-width: 640px;
		border-collapse: collapse;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	th {
		text-align: left;
		font-family: var(--display);
		font-weight: 500;
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-faint);
		padding: 4px 8px;
	}

	td {
		padding: 6px 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	tbody tr:first-child td {
		background: rgba(255, 176, 74, 0.06);
	}

	td.sc {
		font-family: var(--display);
		color: var(--amber);
	}

	td.dt {
		color: var(--ink-faint);
	}

	@media (max-width: 720px) {
		.biomes {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		h3 {
			font-size: 24px;
		}
	}
</style>
