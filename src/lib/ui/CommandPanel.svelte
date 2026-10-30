<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { CommandId, CommandTab } from '$lib/game/command';
	import type { CommandHud, CommandItemHud } from '$lib/game/hud';
	import CommandIcon from './CommandIcon.svelte';
	import RollingNumber from './RollingNumber.svelte';

	interface Props {
		command: CommandHud;
		/** Name of the no-fire zone under the strike cursor ('' = clear). */
		noFire: string;
		onOrder: (id: CommandId) => void;
		onTab: (tab: CommandTab) => void;
	}

	let { command, noFire, onOrder, onTab }: Props = $props();

	const REASON: Record<string, string> = {
		funds: 'Not enough funds',
		cooldown: 'Reloading',
		army: 'Army at full strength',
		air: 'Air wing full',
		drones: 'Too many drones in the air',
		locked: 'Not in this challenge'
	};

	/** The order under the mouse, for the tip line. */
	let hover = $state<CommandItemHud | null>(null);
	const aimed = $derived(command.items.find((i) => i.id === command.aiming) ?? null);
	/** The open page of orders, and the strikes beside it. */
	const groups = $derived([
		{
			id: command.tab,
			label: command.tabs.find((t) => t.id === command.tab)?.label ?? '',
			items: command.items.filter((i) => i.tab === command.tab)
		},
		{ id: 'strike', label: 'Strikes from base', items: command.items.filter((i) => i.tab === null) }
	]);

	function pickTab(e: MouseEvent, tab: CommandTab): void {
		(e.currentTarget as HTMLElement).blur();
		onTab(tab);
	}

	function press(e: MouseEvent, id: CommandId): void {
		// Keep focus on the battlefield, so Space and the hotkeys still reach the game.
		(e.currentTarget as HTMLElement).blur();
		onOrder(id);
	}
</script>

<div class="command">
	<div class="chest">
		<div class="funds">
			<span class="lbl">War chest</span>
			<strong><RollingNumber value={command.funds} width={5} /></strong>
			<span class="inc"
				><RollingNumber value={command.income} prefix="+" suffix="/s" width={5} /></span
			>
		</div>
		<!-- Every number keeps a fixed width, so the line never shifts as they change. -->
		<div class="counts">
			<span title="Our units on the road"
				>ARMY <RollingNumber value={command.army} width={2} align="end" />/{command.armyMax}</span
			>
			<span title="Our aircraft in the air"
				>AIR <RollingNumber value={command.air} width={2} align="end" />/{command.airMax}</span
			>
			<span title="Our drones in the air"
				>DRONES <RollingNumber
					value={command.drones}
					width={2}
					align="end"
				/>/{command.dronesMax}</span
			>
			<span class="foe" title="The enemy commander: same chest, same orders">
				ENEMY {#if command.enemy.funds < 0}<span
						class="unknown"
						title="Fog of war: their war chest is hidden">?</span
					>{:else}<RollingNumber value={command.enemy.funds} width={5} />{/if} · ARMY
				<RollingNumber value={command.enemy.army} width={2} /> · AIR
				<RollingNumber value={command.enemy.air} width={2} />
			</span>
			<span class="queue" class:idle={command.queued === 0}
				><RollingNumber value={command.queued} width={2} /> forming up</span
			>
		</div>
		<p class="tip">
			{#if aimed}
				<b class="aim">{aimed.name}</b>
				{#if command.eta !== null}<span class="eta"
						>Impact {command.eta.toFixed(1)} s after firing ·
					</span>{/if}
				{#if noFire}<em class="warn">Over the {noFire} no-fire zone · </em>{/if}
				Click the battlefield to fire · right click cancels
			{:else if hover}
				<b>{hover.name}</b>{hover.tip}
			{:else}
				Drag the map to pan · wheel zooms · Q/E or Tab change page · Space jumps to the front
			{/if}
		</p>
	</div>

	<div class="tabs">
		<span class="hint">Q</span>
		{#each command.tabs as t (t.id)}
			<button
				class="tab"
				class:open={command.tab === t.id}
				tabindex="-1"
				onmousedown={(e) => e.preventDefault()}
				onclick={(e) => pickTab(e, t.id)}>{t.label}</button
			>
		{/each}
		<span class="hint">E</span>
	</div>

	<div class="bar">
		{#each groups as g (g.id)}
			<div class="group {g.id}">
				<span class="glabel">{g.label}</span>
				<div class="items">
					{#each g.items as it (it.id)}
						<button
							class="order"
							class:aiming={command.aiming === it.id}
							class:off={it.refusal !== null}
							class:locked={it.refusal === 'locked'}
							class:cooling={it.cooldown > 0}
							style:--cd={it.cooldown}
							tabindex="-1"
							title={it.refusal ? REASON[it.refusal] : it.tip}
							onmousedown={(e) => e.preventDefault()}
							onclick={(e) => press(e, it.id)}
							onmouseenter={() => (hover = it)}
							onmouseleave={() => (hover = hover === it ? null : hover)}
						>
							<span class="key">{it.key}</span>
							<CommandIcon id={it.id} class="ico" />
							<span class="nm">{it.short}</span>
							<span class="cost" class:short={it.refusal === 'funds'}>{it.cost}</span>
							{#if it.cooldown > 0}<i class="cd" transition:fade={{ duration: 120 }}></i>{/if}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.command {
		position: absolute;
		left: 50%;
		bottom: 14px;
		transform: translateX(-50%);
		display: grid;
		gap: 6px;
		width: max-content;
		max-width: calc(100vw - 24px);
		pointer-events: none;
		font-family: var(--body);
		color: var(--ink);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
	}

	.chest {
		display: flex;
		align-items: baseline;
		gap: 18px;
		padding: 0 4px;
	}

	.funds {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.lbl,
	.glabel {
		font-size: 12px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.funds strong {
		font-family: var(--display);
		font-size: 30px;
		line-height: 1;
		color: #ffd27a;
		text-shadow: 0 0 14px var(--amber-glow);
		font-variant-numeric: tabular-nums;
	}

	.inc {
		font-family: var(--display);
		font-size: 15px;
		color: var(--good);
	}

	.counts {
		display: flex;
		gap: 12px;
		font-family: var(--display);
		font-size: 13px;
		letter-spacing: 0.1em;
		color: var(--ink-dim);
	}

	.queue {
		color: #9fd8ff;
		transition: opacity 0.3s;
	}

	/* Holds its place when nobody is forming up, so nothing beside it moves. */
	.queue.idle {
		opacity: 0;
	}

	.foe {
		color: #ff8a6a;
	}

	/* Same room as the number it stands in for, so the line keeps its shape. */
	.unknown {
		display: inline-block;
		min-width: 5ch;
	}

	/* Takes whatever room the order bar leaves, never widening the panel. */
	.tip {
		flex: 1 1 0;
		width: 0;
		margin: 0;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		text-align: right;
		font-size: 14px;
		color: #e8edf2;
	}

	.tip b {
		margin-right: 8px;
		color: var(--amber);
		letter-spacing: 0.08em;
	}

	.tip b.aim {
		color: #ff9a6a;
		animation: blink 0.8s ease-in-out infinite alternate;
	}

	.tip .warn {
		font-style: normal;
		color: var(--danger);
	}

	.tabs {
		display: flex;
		align-items: center;
		gap: 2px;
		padding-left: 2px;
	}

	.hint {
		font-family: var(--display);
		font-size: 11px;
		color: var(--ink-faint);
		padding: 0 4px;
	}

	.tab {
		padding: 3px 10px 4px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: rgba(8, 10, 16, 0.5);
		color: var(--ink-dim);
		font: inherit;
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		pointer-events: auto;
	}

	.tab:hover {
		color: var(--ink);
	}

	.tab.open {
		color: var(--ink);
		background: rgba(8, 10, 16, 0.8);
		border-bottom-color: #9fd8ff;
	}

	.tip .eta {
		color: #ffd27a;
	}

	.bar {
		display: flex;
		gap: 14px;
		align-items: flex-end;
	}

	.group {
		display: grid;
		gap: 4px;
	}

	.glabel {
		padding-left: 2px;
		font-size: 11px;
	}

	.items {
		display: flex;
		gap: 4px;
	}

	.order {
		--c: #9fd8ff;
		position: relative;
		display: grid;
		grid-template-columns: auto auto;
		justify-content: space-between;
		align-items: center;
		row-gap: 1px;
		width: 72px;
		padding: 5px 7px 6px;
		border: 0;
		border-bottom: 2px solid rgba(255, 255, 255, 0.08);
		background: rgba(8, 10, 16, 0.62);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		pointer-events: auto;
		overflow: hidden;
		transition:
			transform 0.12s ease,
			background 0.12s ease,
			border-color 0.12s ease;
	}

	.support .order {
		--c: #c9b2ff;
	}

	.air .order,
	.heavy .order {
		--c: #8fe3c8;
	}

	.strike .order {
		--c: #ffb04a;
	}

	.order:hover {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c) 22%, transparent),
			rgba(8, 10, 16, 0.75)
		);
		border-bottom-color: var(--c);
		transform: translateY(-3px);
	}

	.order.aiming {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c) 34%, transparent),
			rgba(8, 10, 16, 0.8)
		);
		border-bottom-color: var(--c);
		transform: translateY(-6px);
		box-shadow: 0 6px 24px color-mix(in srgb, var(--c) 35%, transparent);
	}

	.order.off {
		opacity: 0.5;
	}

	/* Ruled out by the challenge: greyed right down, not just short of funds. */
	.order.locked {
		opacity: 0.22;
		filter: grayscale(1);
	}

	.key {
		font-family: var(--display);
		font-size: 11px;
		color: var(--ink-faint);
	}

	.order :global(.ico) {
		grid-column: 1 / -1;
		grid-row: 2;
		width: 46px;
		height: 23px;
		justify-self: center;
		color: var(--c);
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7));
	}

	.nm {
		grid-column: 1 / -1;
		grid-row: 3;
		font-size: 12px;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cost {
		grid-row: 1;
		grid-column: 2;
		font-family: var(--display);
		font-size: 12px;
		color: #ffd27a;
		font-variant-numeric: tabular-nums;
	}

	.cost.short {
		color: var(--danger);
	}

	/* The cooldown drains away from the top as the order comes back. */
	.cd {
		position: absolute;
		inset: 0;
		background: rgba(4, 6, 10, 0.62);
		transform-origin: bottom;
		transform: scaleY(var(--cd));
		pointer-events: none;
	}

	@keyframes blink {
		to {
			opacity: 0.45;
		}
	}

	@media (max-width: 1240px) {
		.command {
			transform: translateX(-50%) scale(0.82);
			transform-origin: bottom center;
		}
	}

	@media (max-width: 1000px) {
		.command {
			transform: translateX(-50%) scale(0.66);
		}
	}
</style>
