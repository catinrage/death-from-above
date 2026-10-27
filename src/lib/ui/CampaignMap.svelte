<script lang="ts">
	import { isUnlocked, MISSIONS, type CampaignProgress } from '$lib/game/campaign';
	import {
		frontX,
		missionX,
		SECTORS,
		sectorSpan,
		sectorState,
		type StrikeId
	} from '$lib/game/campaign-map';

	interface Props {
		progress: CampaignProgress;
		/** The mission picked on the map. */
		selected: string;
		/** The strike lined up for the picked mission. */
		strike: StrikeId | null;
		onPick: (id: string) => void;
	}

	let { progress, selected, strike, onPick }: Props = $props();

	const W = 1000;
	const H = 200;
	const GROUND = 150;
	const front = $derived(frontX(progress) * W);

	/** A ragged front line, so it reads as trenches rather than a ruler. */
	const frontPath = $derived.by(() => {
		const x = Math.min(Math.max(front, 6), W - 6);
		const pts: string[] = [];
		for (let y = 26, i = 0; y <= H - 4; y += 12, i++) pts.push(`${x + (i % 2 ? 5 : -5)},${y}`);
		return `M${pts.join(' L')}`;
	});

	/** Mission markers zig-zag so the names don't collide. */
	const nodeY = (i: number): number => (i % 2 ? 108 : 82);

	/** The strike targets sit in the enemy rear, just beyond the picked mission. */
	const targets = $derived.by(() => {
		const x = Math.min(missionX(selected) * W + 62, W - 40);
		return [
			{ id: 'depot' as const, x: x - 22, y: GROUND + 22 },
			{ id: 'bridge' as const, x, y: GROUND + 30 },
			{ id: 'radar' as const, x: x + 22, y: GROUND + 20 }
		];
	});

	function onKey(e: KeyboardEvent, id: string): void {
		if (e.code === 'Space') {
			e.preventDefault();
			onPick(id);
		}
	}
</script>

<svg class="map" viewBox="0 0 {W} {H}" role="group" aria-label="Campaign map">
	<defs>
		<linearGradient id="held" x1="0" x2="1">
			<stop offset="0" stop-color="#ffb04a" stop-opacity="0.16" />
			<stop offset="1" stop-color="#ffb04a" stop-opacity="0.05" />
		</linearGradient>
		<linearGradient id="enemy" x1="0" x2="1">
			<stop offset="0" stop-color="#ff4b3a" stop-opacity="0.06" />
			<stop offset="1" stop-color="#ff4b3a" stop-opacity="0.18" />
		</linearGradient>
		<linearGradient id="sweep" x1="0" x2="1">
			<stop offset="0" stop-color="#ffd59a" stop-opacity="0" />
			<stop offset="0.85" stop-color="#ffd59a" stop-opacity="0.04" />
			<stop offset="1" stop-color="#ffd59a" stop-opacity="0.16" />
		</linearGradient>
		<pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
			<path d="M25,0 L0,0 L0,25" fill="none" stroke="rgba(255,255,255,0.035)" />
		</pattern>
	</defs>

	<!-- Territory either side of the front, on a plotting grid. -->
	<rect x="0" y="0" width={W} height={H} fill="url(#grid)" />
	<rect class="terr" x="0" y="0" width={front} height={H} fill="url(#held)" />
	<rect class="terr" x={front} y="0" width={W - front} height={H} fill="url(#enemy)" />
	<!-- A recon sweep crossing the map. -->
	<rect class="sweep" x="-120" y="0" width="120" height={H} fill="url(#sweep)" />

	<!-- Sectors. -->
	{#each SECTORS as s, i (s.id)}
		{@const [a, b] = sectorSpan(s)}
		{@const st = sectorState(s, progress)}
		{#if i > 0}
			<line class="border" x1={a * W} x2={a * W} y1="0" y2={H} />
		{/if}
		<text class="sector {st}" x={((a + b) / 2) * W} y="18" text-anchor="middle">
			{s.name.toUpperCase()}
		</text>
	{/each}

	<!-- Ground, the river and the road the columns come down. -->
	<path
		class="ground"
		d="M0,{GROUND} C120,{GROUND - 8} 220,{GROUND + 6} 330,{GROUND - 4} S560,{GROUND +
			8} 700,{GROUND - 6} S900,{GROUND + 4} {W},{GROUND - 2} L{W},{H} L0,{H} Z"
	/>
	<path class="river" d="M188,{H} C200,{GROUND + 30} 176,{GROUND + 18} 196,{GROUND - 2}" />
	<line class="road" x1="20" x2={W - 10} y1={GROUND + 10} y2={GROUND + 10} />
	<g class="airfield" transform="translate(28 {GROUND - 2})">
		<rect x="-14" y="0" width="34" height="4" />
		<path d="M-2,-8 L6,-2 L-10,-2 Z" />
	</g>

	<!-- The front. -->
	<path class="front" d={frontPath} />
	{#if front > 0 && front < W}
		<text class="front-label" x={front} y={H - 6} text-anchor="middle">FRONT</text>
	{/if}

	<!-- Strike targets behind the lines. -->
	{#each targets as t (t.id)}
		<g class="target" class:on={strike === t.id} transform="translate({t.x} {t.y})">
			{#if t.id === 'depot'}
				<rect x="-6" y="-5" width="12" height="9" />
				<rect x="-3" y="-8" width="6" height="3" />
			{:else if t.id === 'bridge'}
				<path d="M-10,3 Q0,-7 10,3" fill="none" />
				<line x1="-12" x2="12" y1="-2" y2="-2" />
			{:else}
				<path d="M-6,-6 Q0,2 6,-6" fill="none" />
				<line x1="0" x2="0" y1="-2" y2="5" />
			{/if}
			{#if strike === t.id}
				<circle class="reticle" r="11" />
				<line class="reticle" x1="-15" x2="-8" y1="0" y2="0" />
				<line class="reticle" x1="8" x2="15" y1="0" y2="0" />
			{/if}
		</g>
	{/each}

	<!-- Missions. -->
	{#each MISSIONS as m, i (m.id)}
		{@const x = missionX(m.id) * W}
		{@const y = nodeY(i)}
		{@const open = isUnlocked(progress, m.id)}
		{@const rec = progress[m.id]}
		<g
			class="node"
			class:won={!!rec}
			class:locked={!open}
			class:on={m.id === selected}
			transform="translate({x} {y})"
			role="button"
			tabindex={open ? 0 : -1}
			aria-disabled={!open}
			aria-pressed={m.id === selected}
			aria-label="Mission {i + 1}: {m.name}{open ? '' : ' (locked)'}{rec
				? `, ${rec.stars} stars`
				: ''}"
			onclick={() => open && onPick(m.id)}
			onkeydown={(e) => open && onKey(e, m.id)}
		>
			<line class="stem" x1="0" x2="0" y1="10" y2={GROUND - y} />
			<circle r="14" class="hit" />
			{#if m.id === selected}
				<circle class="ping" r="12" />
				<path
					class="lock"
					d="M-19,-11 L-19,-19 L-11,-19 M11,-19 L19,-19 L19,-11 M19,11 L19,19 L11,19 M-11,19 L-19,19 L-19,11"
				/>
			{/if}
			<path class="pin" d="M0,-10 L10,0 L0,10 L-10,0 Z" />
			<text class="num" y="4" text-anchor="middle">{i + 1}</text>
			<text class="name" y={i % 2 ? 28 : -18} text-anchor="middle">{m.name.toUpperCase()}</text>
			{#if rec}
				<text class="stars" y={i % 2 ? 40 : -30} text-anchor="middle"
					>{'★'.repeat(rec.stars)}{'☆'.repeat(3 - rec.stars)}</text
				>
			{/if}
		</g>
	{/each}
</svg>

<style>
	.map {
		display: block;
		width: 100%;
		height: auto;
		background: rgba(0, 0, 0, 0.22);
		box-shadow:
			inset 0 0 0 1px rgba(255, 214, 160, 0.1),
			inset 0 0 40px rgba(0, 0, 0, 0.5);
		font-family: var(--display);
	}

	.terr {
		animation: terr 1s ease-out backwards;
	}

	@keyframes terr {
		from {
			opacity: 0;
		}
	}

	.sweep {
		pointer-events: none;
		animation: sweep 6s linear infinite;
	}

	@keyframes sweep {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(1120px);
		}
	}

	.ping {
		fill: none;
		stroke: var(--amber);
		stroke-width: 1.5;
		transform-box: fill-box;
		transform-origin: center;
		animation: ping 1.8s ease-out infinite;
		pointer-events: none;
	}

	@keyframes ping {
		from {
			opacity: 0.9;
			transform: scale(0.8);
		}
		to {
			opacity: 0;
			transform: scale(2.4);
		}
	}

	.lock {
		fill: none;
		stroke: #ffe2b8;
		stroke-width: 1.5;
		pointer-events: none;
		animation: lock 0.35s cubic-bezier(0.3, 1.5, 0.5, 1) backwards;
	}

	@keyframes lock {
		from {
			opacity: 0;
			transform: scale(1.8);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sweep,
		.ping {
			display: none;
		}
	}

	.border {
		stroke: rgba(255, 255, 255, 0.07);
		stroke-dasharray: 2 5;
	}

	.sector {
		font-size: 13px;
		letter-spacing: 0.24em;
		fill: var(--ink-faint);
	}

	.sector.held {
		fill: var(--amber);
	}

	.sector.contested {
		fill: var(--ink);
	}

	.ground {
		fill: rgba(255, 255, 255, 0.04);
	}

	.river {
		fill: none;
		stroke: rgba(110, 170, 220, 0.45);
		stroke-width: 6;
	}

	.road {
		stroke: rgba(255, 255, 255, 0.1);
		stroke-dasharray: 10 8;
	}

	.airfield {
		fill: var(--amber);
		opacity: 0.8;
	}

	.front {
		fill: none;
		stroke: var(--danger);
		stroke-width: 2.5;
		stroke-linejoin: bevel;
		filter: drop-shadow(0 0 4px rgba(255, 75, 58, 0.6));
		animation: march 1.2s linear infinite;
		stroke-dasharray: 9 4;
	}

	@keyframes march {
		to {
			stroke-dashoffset: -26;
		}
	}

	.front-label {
		font-size: 10px;
		letter-spacing: 0.3em;
		fill: var(--danger);
	}

	.target {
		fill: rgba(255, 75, 58, 0.35);
		stroke: rgba(255, 140, 120, 0.7);
		stroke-width: 1.5;
	}

	.target.on {
		fill: rgba(255, 176, 74, 0.5);
		stroke: var(--amber);
	}

	.reticle {
		fill: none;
		stroke: var(--amber);
		stroke-width: 1.2;
	}

	.node {
		cursor: pointer;
		outline: none;
	}

	.node.locked {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.hit {
		fill: transparent;
	}

	.stem {
		stroke: rgba(255, 255, 255, 0.12);
	}

	.pin {
		fill: #1a1d26;
		stroke: rgba(255, 255, 255, 0.4);
		stroke-width: 1.5;
		transition: transform 0.15s;
	}

	.node.won .pin {
		fill: rgba(255, 176, 74, 0.28);
		stroke: var(--amber);
	}

	.node.on .pin {
		fill: var(--amber);
		stroke: #fff3dc;
		transform: scale(1.2);
	}

	.node:hover:not(.locked) .pin,
	.node:focus-visible .pin {
		stroke: #fff3dc;
		transform: scale(1.2);
	}

	.num {
		font-size: 10px;
		font-weight: 700;
		fill: var(--ink);
		pointer-events: none;
	}

	.node.on .num {
		fill: #1a0d04;
	}

	.name {
		font-size: 11px;
		letter-spacing: 0.08em;
		fill: var(--ink-dim);
	}

	.node.on .name {
		fill: var(--amber);
	}

	.stars {
		font-size: 10px;
		fill: var(--amber);
	}
</style>
