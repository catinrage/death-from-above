<script lang="ts">
	import { assets } from '$app/paths';
	import { onMount } from 'svelte';
	import { Game } from '$lib/game/game';
	import { QUALITY_PRESETS } from '$lib/engine/renderer';
	import {
		emptyHud,
		type GameOverStats,
		type GamePhase,
		type HudMessage,
		type HudSnapshot,
		type ModeStart
	} from '$lib/game/hud';
	import { readTrained } from '$lib/game/records';
	import type { AircraftId } from '$lib/game/types';
	import { PopupLayer } from './popups';
	import { TargetingLayer } from './targeting-layer';
	import { EdgeLayer } from './edge-layer';
	import {
		loadSettings,
		readBestScore,
		saveSettings,
		type QualityLevel,
		type Settings
	} from './settings';
	import Hud from './Hud.svelte';
	import Player2Hud from './Player2Hud.svelte';
	import TitleScreen from './TitleScreen.svelte';
	import Hangar from './Hangar.svelte';
	import { capacityOf, stockLoadout, weightOf, type Loadout } from '$lib/game/loadout';
	import {
		buyUpgrade,
		extraPayload,
		loadOrMigrate,
		loadProgression,
		saveProgression,
		type Progression,
		type UpgradeId
	} from '$lib/game/progression';
	import PauseMenu from './PauseMenu.svelte';
	import AircraftSwap from './AircraftSwap.svelte';
	import GameOver from './GameOver.svelte';
	import Controls from './Controls.svelte';
	import ModeSelect from './ModeSelect.svelte';
	import { setMenuSound } from './menu-fx';
	import './menu-theme.css';

	let canvas: HTMLCanvasElement;
	let popupRoot: HTMLDivElement;
	let targetRoot: HTMLDivElement;
	let game: Game | null = null;
	let phase = $state<GamePhase>('loading');
	let hud = $state<HudSnapshot>(emptyHud());
	let messages = $state<HudMessage[]>([]);
	let over = $state<GameOverStats | null>(null);
	const saved = loadSettings();
	// Credits and hangar upgrades. Saving straight away locks in a migrated older save.
	const savedWallet = loadOrMigrate();
	saveProgression(savedWallet);
	let settings = $state<Settings>(saved);
	let wallet = $state<Progression>(savedWallet);
	let hangarOpen = $state(false);
	/** The pause menu's aircraft picker is open. */
	let swapping = $state(false);
	const upgrades = $derived(wallet.upgrades[settings.aircraft]);
	const loadout = $derived.by<Loadout>(() => {
		const id = settings.aircraft;
		const l = settings.loadouts[id];
		return l && weightOf(l) <= capacityOf(id, extraPayload(wallet, id)) ? l : stockLoadout(id);
	});
	let best = $state(readBestScore());
	let showControls = $state(false);
	let modeOpen = $state(false);
	/** What the last sortie flew: Restart and Retry repeat it. */
	let lastStart = $state<ModeStart | null>(null);
	let trained = $state(readTrained());
	let error = $state('');

	onMount(() => {
		const boot = setTimeout(() => {
			try {
				game = new Game(
					canvas,
					{
						hud: (h) => (hud = h),
						phase: (p) => {
							phase = p;
							if (p !== 'paused') swapping = false;
							if (p === 'title' || p === 'gameover') refreshRecords();
						},
						message: pushMessage,
						gameOver: (s) => (over = s)
					},
					QUALITY_PRESETS[settings.quality]
				);
				game.popups = new PopupLayer(popupRoot);
				game.targetingLayer = new TargetingLayer(targetRoot);
				game.edgeLayer = new EdgeLayer(targetRoot);
				if (new URLSearchParams(location.search).has('debug')) {
					(window as unknown as { __dfa: Game }).__dfa = game;
				}
				game.setLens(settings.lens);
				game.audio.setVolume(settings.volume);
				const audio = game.audio;
				setMenuSound((kind) => {
					// A click is a user gesture: it may wake the audio up.
					if (kind !== 'hover') void audio.unlock();
					audio.menu(kind);
				});
				game.preview(settings.aircraft, loadout, upgrades);
				game.start();
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		}, 60);
		const onResize = (): void => game?.resize();
		window.addEventListener('resize', onResize);
		return () => {
			clearTimeout(boot);
			setMenuSound(null);
			window.removeEventListener('resize', onResize);
			game?.dispose();
		};
	});

	function pushMessage(m: HudMessage): void {
		// Missile launches already drive the flashing HUD warning.
		if (m.text === 'MISSILE LAUNCH' || messages.some((x) => x.text === m.text)) return;
		messages = [...messages.slice(-2), m];
		const ttl = m.sub.length > 70 ? 7000 : m.text.startsWith('WAVE') ? 3800 : 2000;
		setTimeout(() => (messages = messages.filter((x) => x.id !== m.id)), ttl);
	}

	function refreshRecords(): void {
		best = readBestScore();
		trained = readTrained();
		wallet = loadProgression();
	}

	/** Opens the mode chooser (training or the war). */
	function chooseMode(): void {
		refreshRecords();
		modeOpen = true;
	}

	function launch(start: ModeStart): void {
		lastStart = start;
		over = null;
		messages = [];
		// Don't flash the attract-mode aircraft's racks until the sortie's first HUD frame.
		hud = emptyHud();
		showControls = false;
		modeOpen = false;
		void game?.audio.unlock();
		hangarOpen = false;
		if (game) game.showcase = false;
		game?.newGame(settings.aircraft, loadout, start, upgrades);
		canvas.focus();
	}

	/** Flies the last sortie again. */
	function sortie(): void {
		launch(lastStart ?? { mode: 'war' });
	}

	function toTitle(): void {
		over = null;
		messages = [];
		game?.toTitle();
	}

	/** Picks the aircraft to fly: every airframe is in the hangar from the start. */
	function selectAircraft(id: AircraftId): void {
		settings = { ...settings, aircraft: id };
		saveSettings(settings);
		game?.preview(id, loadout, upgrades);
	}

	/** Trades the landed aircraft mid-sortie for another, with its hangar loadout and upgrades. */
	function swapAircraft(id: AircraftId): void {
		settings = { ...settings, aircraft: id };
		saveSettings(settings);
		swapping = false;
		if (game?.swapAircraft(id, loadout, upgrades)) game.resume();
	}

	function setLoadout(l: Loadout): void {
		settings = { ...settings, loadouts: { ...settings.loadouts, [settings.aircraft]: l } };
		saveSettings(settings);
		game?.preview(settings.aircraft, l, upgrades);
	}

	function spend(next: Progression): void {
		if (next === wallet) return;
		wallet = next;
		saveProgression(next);
	}

	function purchaseUpgrade(u: UpgradeId): void {
		spend(buyUpgrade(wallet, settings.aircraft, u));
		game?.preview(settings.aircraft, loadout, upgrades);
	}

	function openHangar(open: boolean): void {
		hangarOpen = open;
		if (game) game.showcase = open;
	}

	function setQuality(q: QualityLevel): void {
		settings = { ...settings, quality: q };
		saveSettings(settings);
		game?.setQuality(QUALITY_PRESETS[q]);
	}

	function setLens(on: boolean): void {
		settings = { ...settings, lens: on };
		saveSettings(settings);
		game?.setLens(on);
	}

	function setVolume(v: number): void {
		settings = { ...settings, volume: v };
		saveSettings(settings);
		game?.audio.setVolume(v);
	}
</script>

<div class="shell" class:flying={phase === 'playing'}>
	<canvas bind:this={canvas} tabindex="-1"></canvas>
	<div class="popups" bind:this={popupRoot}></div>
	<div class="targeting" bind:this={targetRoot}></div>

	{#if phase === 'loading' && !error}
		<div class="loading">
			<img
				class="mark"
				src="{assets}/brand/logo-512.png"
				alt="Death From Above"
				width="220"
				height="220"
			/>
			<div class="bar"><span></span></div>
			<p>Building the battlefield…</p>
		</div>
	{/if}

	{#if error}
		<div class="error" role="alert">
			<h2>Can't start the renderer</h2>
			<p>{error}</p>
			<p class="hint">
				This game needs a browser with WebGL 2 enabled (recent Chrome, Edge, Firefox or Safari).
			</p>
		</div>
	{/if}

	{#if phase === 'playing' || phase === 'paused'}
		<Hud {hud} {messages} />
		{#if hud.player2}<Player2Hud wing={hud.player2} />{/if}
	{/if}

	{#if phase === 'title'}
		{#if hangarOpen}
			<Hangar
				aircraft={settings.aircraft}
				{loadout}
				{wallet}
				onSelect={selectAircraft}
				onLoadout={setLoadout}
				onBuyUpgrade={purchaseUpgrade}
				onBack={() => openHangar(false)}
				onSortie={chooseMode}
			/>
		{:else}
			<TitleScreen
				{settings}
				{loadout}
				{best}
				credits={wallet.credits}
				onSortie={chooseMode}
				onHangar={() => openHangar(true)}
				onQuality={setQuality}
				onLens={setLens}
				onVolume={setVolume}
				onControls={() => (showControls = true)}
			/>
		{/if}
	{/if}

	{#if phase === 'paused' && swapping}
		<AircraftSwap current={hud.aircraft} onPick={swapAircraft} onBack={() => (swapping = false)} />
	{:else if phase === 'paused'}
		<PauseMenu
			onResume={() => game?.resume()}
			onRestart={sortie}
			onQuit={toTitle}
			onControls={() => (showControls = true)}
			onChangeAircraft={hud.canSwap ? () => (swapping = true) : undefined}
		/>
	{/if}

	{#if phase === 'title' && modeOpen}
		<ModeSelect
			{best}
			{trained}
			initial={lastStart}
			onLaunch={launch}
			onClose={() => (modeOpen = false)}
		/>
	{/if}

	{#if phase === 'gameover' && over}
		<GameOver
			stats={over}
			onRetry={sortie}
			onTitle={toTitle}
			onLaunch={(start) => launch({ ...start, coop: lastStart?.coop })}
		/>
	{/if}

	{#if showControls}
		<Controls onClose={() => (showControls = false)} />
	{/if}
</div>

<style>
	.shell {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		outline: none;
		cursor: crosshair;
	}

	/* The reticle replaces the system cursor while flying. */
	.flying canvas {
		cursor: none;
	}

	.targeting {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
		--tl: rgba(255, 238, 214, 0.9);
		--tl-glow: rgba(0, 0, 0, 0.55);
	}

	.targeting:global(.focus) {
		--tl: #82ecff;
		--tl-glow: rgba(90, 220, 255, 0.55);
	}

	.targeting :global(.tl-reticle) {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
	}

	.targeting :global(.tl-reticle .ring) {
		position: absolute;
		left: -20px;
		top: -20px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1.5px solid var(--tl);
		box-shadow: 0 0 10px var(--tl-glow);
		transition:
			transform 0.25s ease,
			border-color 0.25s ease;
	}

	.targeting:global(.focus) :global(.tl-reticle .ring) {
		transform: scale(1.4);
		border-style: dashed;
		animation: tl-spin 2.4s linear infinite;
	}

	.targeting :global(.tl-reticle .ticks) {
		position: absolute;
		left: -30px;
		top: -30px;
		width: 60px;
		height: 60px;
		background:
			linear-gradient(var(--tl), var(--tl)) 50% 0 / 2px 9px no-repeat,
			linear-gradient(var(--tl), var(--tl)) 50% 100% / 2px 9px no-repeat,
			linear-gradient(var(--tl), var(--tl)) 0 50% / 9px 2px no-repeat,
			linear-gradient(var(--tl), var(--tl)) 100% 50% / 9px 2px no-repeat;
		filter: drop-shadow(0 0 3px var(--tl-glow));
	}

	.targeting :global(.tl-reticle .dot) {
		position: absolute;
		left: -2px;
		top: -2px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--tl);
	}

	.targeting :global(.tl-hover) {
		position: absolute;
		left: 0;
		top: 0;
		margin: 0;
		translate: -50% -50%;
		--c: rgba(255, 214, 140, 0.95);
		background:
			linear-gradient(var(--c), var(--c)) 0 0 / 12px 2px no-repeat,
			linear-gradient(var(--c), var(--c)) 0 0 / 2px 12px no-repeat,
			linear-gradient(var(--c), var(--c)) 100% 0 / 12px 2px no-repeat,
			linear-gradient(var(--c), var(--c)) 100% 0 / 2px 12px no-repeat,
			linear-gradient(var(--c), var(--c)) 0 100% / 12px 2px no-repeat,
			linear-gradient(var(--c), var(--c)) 0 100% / 2px 12px no-repeat,
			linear-gradient(var(--c), var(--c)) 100% 100% / 12px 2px no-repeat,
			linear-gradient(var(--c), var(--c)) 100% 100% / 2px 12px no-repeat;
		filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.7));
	}

	.targeting:global(.focus) :global(.tl-hover) {
		--c: #82ecff;
	}

	.targeting :global(.tl-lock) {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -50%;
	}

	.targeting :global(.tl-lock .diamond) {
		position: absolute;
		inset: 0;
		border: 2px solid #ff5a3c;
		rotate: 45deg;
		box-shadow:
			0 0 12px rgba(255, 80, 50, 0.75),
			inset 0 0 8px rgba(255, 80, 50, 0.4);
	}

	.targeting :global(.tl-lock.fresh .diamond) {
		animation: tl-lock 0.28s cubic-bezier(0.2, 1.4, 0.5, 1);
	}

	.targeting :global(.tl-lock b) {
		position: absolute;
		left: 100%;
		top: -6px;
		margin-left: 4px;
		font-family: var(--display);
		font-size: 12px;
		color: #ffd0c2;
		text-shadow: 0 0 6px rgba(255, 60, 30, 0.9);
	}

	/* Faint chevrons on the screen edge, pointing at enemies out of shot. */
	.targeting :global(.tl-edge) {
		position: absolute;
		left: -7px;
		top: -7px;
		width: 14px;
		height: 14px;
		--c: #ffe2b8;
		/* A dark rim keeps them legible over a bright sky (the clip sits on the child). */
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
		will-change: transform, opacity;
	}

	.targeting :global(.tl-edge i) {
		position: absolute;
		inset: 0;
		background: var(--c);
		clip-path: polygon(0 0, 100% 50%, 0 100%, 34% 50%);
	}

	/* Aircraft: an open chevron in a cooler tint. */
	.targeting :global(.tl-edge.air) {
		--c: #bfe8ff;
	}

	.targeting :global(.tl-edge.air i) {
		clip-path: polygon(0 0, 100% 50%, 0 100%, 0 76%, 62% 50%, 0 24%);
	}

	.targeting :global(.tl-edge.boss) {
		--c: #ff9a6a;
	}

	/* Chevrons ringing the aircraft, pointing at whatever is hunting it. */
	.targeting :global(.tl-threat) {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		--c: #ff4a2e;
		--glow: rgba(255, 70, 40, 0.8);
		opacity: calc(0.55 + var(--lv) * 0.45);
	}

	.targeting :global(.tl-threat.lock) {
		--c: #ffb35a;
		--glow: rgba(255, 170, 70, 0.7);
	}

	.targeting :global(.tl-threat .chev) {
		position: absolute;
		left: -11px;
		top: -11px;
		width: 22px;
		height: 22px;
		rotate: var(--a);
		scale: calc(0.85 + var(--lv) * 0.6);
		background: var(--c);
		clip-path: polygon(0 0, 100% 50%, 0 100%, 32% 50%);
		filter: drop-shadow(0 0 5px var(--glow));
	}

	.targeting :global(.tl-threat.close .chev) {
		animation: tl-threat 0.18s ease-in-out infinite alternate;
	}

	.targeting :global(.tl-threat b) {
		position: absolute;
		left: 0;
		top: 0;
		/* Just beyond the chevron, on the far side from the aircraft. */
		translate: calc(-50% + cos(var(--a)) * 30px) calc(-50% + sin(var(--a)) * 22px);
		font-family: var(--display);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		white-space: nowrap;
		color: var(--c);
		text-shadow:
			0 0 6px var(--glow),
			0 1px 2px #000;
	}

	/* Co-op name tags: amber P1, blue P2. */
	.targeting :global(.tl-pilot) {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -100%;
		padding: 1px 6px;
		font-family: var(--display);
		font-size: 12px;
		letter-spacing: 0.12em;
		color: #1a1206;
		background: var(--amber);
		clip-path: polygon(0 0, 100% 0, 100% 75%, 58% 75%, 50% 100%, 42% 75%, 0 75%);
		padding-bottom: 6px;
		opacity: 0.85;
	}

	.targeting :global(.tl-pilot.wing) {
		background: #5fe3a1;
		color: #04170e;
	}

	/* Our own ground units: a small blue chevron pointing down at each one. */
	.targeting :global(.tl-ally) {
		position: absolute;
		left: 0;
		top: 0;
		width: 16px;
		height: 12px;
		translate: -50% -100%;
		opacity: 0.95;
		pointer-events: none;
	}

	.targeting :global(.tl-ally::before),
	.targeting :global(.tl-ally::after) {
		content: '';
		position: absolute;
		inset: 0;
		clip-path: polygon(0 0, 50% 45%, 100% 0, 100% 38%, 50% 100%, 0 38%);
	}

	/* A dark rim so it reads against sky, snow and smoke alike. */
	.targeting :global(.tl-ally::before) {
		background: rgba(0, 8, 20, 0.85);
	}

	.targeting :global(.tl-ally::after) {
		inset: 2px 2.5px 3px;
		background: #6cc0ff;
	}

	/* Badly hurt: it blinks. */
	.targeting :global(.tl-ally.hurt) {
		animation: tl-threat 0.4s ease-in-out infinite alternate;
	}

	.targeting :global(.tl-pilot.off) {
		translate: -50% -50%;
		clip-path: none;
		padding-bottom: 1px;
		opacity: 1;
		animation: tl-threat 0.5s ease-in-out infinite alternate;
	}

	@keyframes tl-threat {
		to {
			opacity: 0.35;
		}
	}

	@keyframes tl-spin {
		to {
			rotate: 360deg;
		}
	}

	@keyframes tl-lock {
		from {
			scale: 2.2;
			opacity: 0;
		}
		to {
			scale: 1;
			opacity: 1;
		}
	}

	.popups {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.popups :global(.popup) {
		position: absolute;
		left: 0;
		top: 0;
		display: none;
		text-align: center;
		white-space: nowrap;
		will-change: transform, opacity;
		text-shadow:
			0 0 12px rgba(0, 0, 0, 0.7),
			0 1px 2px rgba(0, 0, 0, 0.9);
	}

	.popups :global(.popup .pts) {
		display: block;
		font-family: var(--display);
		font-weight: 700;
		font-size: 22px;
		letter-spacing: 0.04em;
		color: #fff4d8;
	}

	.popups :global(.popup .sub) {
		display: block;
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.popups :global(.popup.big .pts) {
		font-size: 30px;
		color: #ffd27a;
		text-shadow: 0 0 18px rgba(255, 140, 40, 0.8);
	}

	.popups :global(.popup.penalty .pts) {
		color: #ff6a50;
		font-size: 24px;
		text-shadow: 0 0 14px rgba(255, 50, 30, 0.7);
	}

	.popups :global(.popup.penalty .sub) {
		color: #ff9a80;
	}

	.popups :global(.popup.supply .pts) {
		color: var(--good);
		font-size: 20px;
	}

	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 18px;
		background: radial-gradient(ellipse at 50% 60%, #1a1420 0%, #06070b 70%);
	}

	.mark {
		width: 220px;
		height: 220px;
		filter: drop-shadow(0 0 24px var(--amber-glow));
		animation: breathe 2.4s ease-in-out infinite alternate;
	}

	@keyframes breathe {
		from {
			filter: drop-shadow(0 0 12px var(--amber-glow));
		}
	}

	.bar {
		width: 220px;
		height: 2px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}

	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		background: var(--amber);
		animation: slide 1.1s ease-in-out infinite;
	}

	.loading p {
		margin: 0;
		color: var(--ink-dim);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		font-size: 13px;
	}

	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(260%);
		}
	}

	.error {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		text-align: center;
		padding: 24px;
		background: #06070b;
	}

	.error h2 {
		font-family: var(--display);
		color: var(--danger);
		margin: 0 0 8px;
	}

	.error p {
		margin: 4px 0;
		max-width: 520px;
		color: var(--ink-dim);
		white-space: pre-wrap;
	}

	.error .hint {
		color: var(--ink-faint);
	}
</style>
