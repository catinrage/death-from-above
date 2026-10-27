<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { HudMessage, HudSnapshot } from '$lib/game/hud';

	interface Props {
		hud: HudSnapshot;
		messages: HudMessage[];
	}

	let { hud, messages }: Props = $props();

	const hpFrac = $derived(Math.max(0, hud.hp / hud.hpMax));
	const baseFrac = $derived(Math.max(0, hud.baseHp / hud.baseMax));
	const heatFrac = $derived(Math.min(1, hud.heat / 100));
</script>

<div class="hud" class:critical={hpFrac < 0.3 && hud.hp > 0}>
	<section class="score">
		<div class="pts">{hud.score.toLocaleString()}</div>
		{#if hud.multiplier > 1}
			<div class="combo" transition:fade={{ duration: 150 }}>
				<strong>×{hud.multiplier}</strong>
				<span>chain {hud.combo}</span>
				<i style:transform="scaleX({hud.comboTime})"></i>
			</div>
		{/if}
		<ul class="feed">
			{#each hud.feed as f, i (f.id)}
				<li style:opacity={1 - i * 0.17} in:fly={{ x: -16, duration: 180 }}>
					<span>{f.text}</span><b>+{f.points}</b>
				</li>
			{/each}
		</ul>
	</section>

	<section class="wave">
		<div class="wave-line">
			<span class="wn">{hud.waveLabel}</span>
			<span class="sep"></span>
			{#if hud.mode !== 'tutorial'}
				<span class="en">{hud.enemies} hostile{hud.enemies === 1 ? '' : 's'}</span>
				<span class="sep"></span>
			{/if}
			<span class="tod">{hud.timeOfDay}</span>
		</div>
		<div class="base" class:alert={hud.baseUnderAttack}>
			<span class="lbl">{hud.baseUnderAttack ? 'AIRFIELD UNDER FIRE' : 'AIRFIELD'}</span>
			<span class="track">
				<span class="fill" style:transform="scaleX({baseFrac})" class:low={baseFrac < 0.35}></span>
			</span>
			<span class="pct">{Math.round(baseFrac * 100)}%</span>
		</div>
	</section>

	<section class="lives" aria-label="Reserve aircraft">
		{#each [0, 1, 2] as i (i)}
			<svg viewBox="0 0 24 24" class:lost={i >= hud.lives} aria-hidden="true">
				<path
					d="M12 2 L14 9 L22 12 L14 13.5 L13.5 19 L16.5 21 L12 20.5 L7.5 21 L10.5 19 L10 13.5 L2 12 L10 9 Z"
				/>
			</svg>
		{/each}
		<span class="fps">{hud.fps} fps</span>
	</section>

	{#if hud.tutorial}
		{@const t = hud.tutorial}
		<section class="coach" class:passed={t.passed} aria-live="polite">
			<header>
				<span class="step">Lesson {t.step}/{t.total}</span>
				<span class="dots">
					{#each Array.from({ length: t.total }, (_, k) => k) as k (k)}
						<i
							class:done={k < t.step - 1 || (k === t.step - 1 && t.passed)}
							class:now={k === t.step - 1}
						></i>
					{/each}
				</span>
			</header>
			{#key t.step}
				<div class="lesson" in:fly={{ x: 20, duration: 260 }}>
					<h4>{t.passed ? 'Done' : t.title}</h4>
					<p>{t.text}</p>
					<div class="keys">
						{#each t.keys as k (k)}<kbd>{k}</kbd>{/each}
						<span class="pad">{t.pad}</span>
					</div>
				</div>
			{/key}
			{#if t.manual}
				<div class="next">Press <kbd>Enter</kbd> to continue</div>
			{:else}
				<div class="bar"><span style:transform="scaleX({t.progress})"></span></div>
				<div class="skip">Enter skips this lesson</div>
			{/if}
		</section>
	{:else if hud.objectives.length > 0}
		<section class="objectives" aria-label="Objectives">
			<h4>{hud.mission}</h4>
			<ul>
				{#each hud.objectives as o, i (i)}
					<li class:done={o.done} class:failed={o.failed}>
						<i>{o.failed ? '✕' : o.done ? '✓' : ''}</i>
						<span>{o.label}</span>
						{#if o.count}<b>{o.count}</b>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="status">
		<div class="gauge">
			<span class="lbl">ARMOR</span>
			<span class="track"
				><span class="fill hp" style:transform="scaleX({hpFrac})" class:low={hpFrac < 0.3}
				></span></span
			>
			<span class="val">{Math.ceil(hud.hp)}</span>
		</div>
		<div class="gauge">
			<span class="lbl">BOOST</span>
			<span class="track"
				><span class="fill boost" style:transform="scaleX({hud.boost})"></span></span
			>
			<span class="val">⇧</span>
		</div>
		<div class="gauge">
			<span class="lbl">{hud.overheated ? 'HOT!' : 'GUNS'}</span>
			<span class="track"
				><span class="fill heat" class:over={hud.overheated} style:transform="scaleX({heatFrac})"
				></span></span
			>
			<span class="val">J</span>
		</div>
		<div class="gauge" class:ready={hud.focus >= 0.15 && !hud.focusActive}>
			<span class="lbl">FOCUS</span>
			<span class="track"
				><span class="fill focus" class:on={hud.focusActive} style:transform="scaleX({hud.focus})"
				></span></span
			>
			<span class="val">R</span>
		</div>
		<div class="flares">
			<span class="lbl">FLARES</span>
			{#each Array.from({ length: hud.flaresMax }, (_, k) => k) as i (i)}
				<span class="pip" class:on={i < hud.flares}></span>
			{/each}
			<span class="val">F</span>
		</div>
		<div class="readout">
			<span><em>ALT</em>{Math.round(hud.altitude)}<small>m</small></span>
			<span><em>SPD</em>{Math.round(hud.speed)}<small>km/h</small></span>
		</div>
	</section>

	<section class="bombs">
		{#each hud.bombs as b (b.id)}
			<div
				class="slot"
				class:sel={b.id === hud.selected}
				class:empty={b.count === 0}
				style:--c={b.color}
			>
				<span class="key">{b.slot}</span>
				<span class="nm">{b.short}</span>
				<span class="ct">{b.count}<em>/{b.max}</em></span>
			</div>
		{/each}
		{#if hud.missilesMax > 0}
			<div class="slot missile" class:sel={hud.locks > 0} class:empty={hud.missiles === 0}>
				<span class="key">E</span>
				<span class="nm">{hud.locks > 0 ? `LOCKED ${hud.locks}` : 'MISSILE'}</span>
				<span class="ct">{hud.missiles}<em>/{hud.missilesMax}</em></span>
			</div>
		{/if}
	</section>

	{#if hud.focusActive}
		<div class="focus-tag" transition:fade={{ duration: 150 }}>
			<span>FOCUS</span>
			<i style:transform="scaleX({hud.focus})"></i>
			<small>Sweep the reticle over targets · E fires · R ends</small>
		</div>
	{/if}

	<section class="warnings" aria-live="assertive">
		{#if hud.missileDist > 0}
			{@const close = hud.missileDist < hud.flareWindow}
			<div class="threat" class:close>
				<span class="arrow" style:transform="rotate({hud.missileDir}rad)">➤</span>
				<span class="label">{close ? 'FLARES NOW' : 'MISSILE'}</span>
				<span class="range">{Math.round(hud.missileDist)}<small>m</small></span>
				<span class="meter"
					><span style:transform="scaleX({Math.max(0, 1 - hud.missileDist / 1500)})"></span><i
						style:left="{(1 - hud.flareWindow / 1500) * 100}%"
					></i></span
				>
			</div>
		{:else if hud.lock > 0}
			<div class="warn lock">
				<span
					><span class="arrow" style:transform="rotate({hud.lockDir}rad)">➤</span> RADAR LOCK</span
				>
				<span class="lockbar"><span style:transform="scaleX({hud.lock})"></span></span>
			</div>
		{/if}
		{#if hud.pullUp}<div class="warn">PULL UP</div>{/if}
		{#if hud.stall}<div class="warn">STALL</div>{/if}
		{#if hud.boundary > 0}
			<div class="warn">
				RETURN TO COMBAT AREA <small>{Math.max(0, 4 - hud.boundary).toFixed(1)}</small>
			</div>
		{/if}
		{#if hud.ceiling}<div class="warn soft">ALTITUDE CEILING</div>{/if}
		{#if hud.braking}<div class="brake">AIRBRAKE</div>{/if}
		{#if hud.rearming}<div class="good">
				{hud.landed ? 'LANDED · ' : ''}REARMING &amp; REPAIRING
			</div>{/if}
	</section>

	<section class="banners">
		{#each messages as m (m.id)}
			<div class="banner {m.tone}" in:fly={{ y: -20, duration: 260 }} out:fade={{ duration: 300 }}>
				<h3>{m.text}</h3>
				{#if m.sub}<p>{m.sub}</p>{/if}
			</div>
		{/each}
	</section>

	{#if hud.respawn > 0}
		<div class="respawn" transition:fade>
			<span>Aircraft lost</span>
			<strong>Next airframe in {hud.respawn.toFixed(1)}s</strong>
		</div>
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		font-family: var(--body);
		color: var(--ink);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
		padding: 18px 22px;
	}

	section {
		position: absolute;
	}

	/* ------------------------------------------------ score */
	.score {
		top: 18px;
		left: 22px;
	}

	.pts {
		font-family: var(--display);
		font-size: 40px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.combo {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 6px;
		padding-bottom: 4px;
	}

	.combo strong {
		font-family: var(--display);
		font-size: 26px;
		color: var(--amber);
		text-shadow: 0 0 14px var(--amber-glow);
	}

	.combo span {
		font-size: 13px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-dim);
	}

	.combo i {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 120px;
		height: 2px;
		background: var(--amber);
		transform-origin: left;
	}

	.feed {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 2px;
		font-size: 15px;
	}

	.feed li {
		display: flex;
		gap: 10px;
		letter-spacing: 0.05em;
		color: var(--ink-dim);
	}

	.feed b {
		color: var(--amber);
		font-weight: 600;
	}

	/* ------------------------------------------------ wave */
	.wave {
		top: 16px;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 8px;
	}

	.wave-line {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 15px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.wn {
		font-family: var(--display);
		font-weight: 700;
		color: var(--amber);
	}

	.en,
	.tod {
		color: var(--ink-dim);
	}

	.sep {
		width: 4px;
		height: 4px;
		background: var(--ink-faint);
		transform: rotate(45deg);
	}

	.base {
		display: grid;
		grid-template-columns: auto 260px auto;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		letter-spacing: 0.22em;
	}

	.base .lbl {
		color: var(--ink-dim);
		min-width: 160px;
		text-align: right;
	}

	.base.alert .lbl {
		color: var(--danger);
		animation: pulse 0.7s ease-in-out infinite alternate;
	}

	.pct {
		font-family: var(--display);
		font-size: 13px;
		color: var(--ink-dim);
		min-width: 38px;
	}

	.track {
		display: block;
		height: 5px;
		background: rgba(255, 255, 255, 0.1);
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
	}

	.fill {
		display: block;
		height: 100%;
		width: 100%;
		transform-origin: left;
		background: linear-gradient(90deg, #cfe9ff, #8fd0ff);
		transition: transform 0.15s linear;
	}

	.base .fill {
		background: linear-gradient(90deg, #ffe0a8, var(--amber));
	}

	.fill.low {
		background: linear-gradient(90deg, #ff9d7a, var(--danger)) !important;
	}

	/* ------------------------------------------------ lives */
	.lives {
		top: 20px;
		right: 22px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.lives svg {
		width: 24px;
		height: 24px;
		fill: var(--amber);
		filter: drop-shadow(0 0 6px var(--amber-glow));
		transform: rotate(90deg);
	}

	.lives svg.lost {
		fill: rgba(255, 255, 255, 0.15);
		filter: none;
	}

	.fps {
		margin-left: 10px;
		font-size: 11px;
		letter-spacing: 0.15em;
		color: var(--ink-faint);
	}

	/* ------------------------------------------------ objectives / training */
	.objectives,
	.coach {
		top: 58px;
		right: 22px;
		width: 300px;
		padding: 12px 14px;
		background: linear-gradient(225deg, rgba(8, 10, 16, 0.82), rgba(8, 10, 16, 0.55));
		border-right: 2px solid var(--line);
		clip-path: polygon(0 0, 100% 0, 100% 100%, 16px 100%, 0 calc(100% - 16px));
	}

	.objectives h4,
	.coach h4 {
		margin: 0 0 8px;
		font-family: var(--display);
		font-size: 15px;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.objectives ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 5px;
		font-size: 15px;
	}

	.objectives li {
		display: grid;
		grid-template-columns: 16px 1fr auto;
		align-items: center;
		gap: 8px;
		color: var(--ink);
	}

	.objectives li i {
		width: 14px;
		height: 14px;
		display: grid;
		place-items: center;
		font-style: normal;
		font-size: 11px;
		border: 1px solid var(--ink-faint);
	}

	.objectives li b {
		font-family: var(--display);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink-dim);
	}

	.objectives li.done {
		color: var(--ink-faint);
	}

	.objectives li.done i {
		color: #0b1a0a;
		background: var(--good);
		border-color: var(--good);
	}

	.objectives li.done b {
		color: var(--good);
	}

	.objectives li.failed {
		color: var(--danger);
	}

	.objectives li.failed i {
		border-color: var(--danger);
	}

	.coach {
		width: 340px;
		border-right-color: var(--amber);
		transition: border-color 0.2s;
	}

	.coach.passed {
		border-right-color: var(--good);
	}

	.coach header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.coach .step {
		font-size: 12px;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.coach .dots {
		display: flex;
		gap: 3px;
	}

	.coach .dots i {
		width: 10px;
		height: 3px;
		background: rgba(255, 255, 255, 0.15);
	}

	.coach .dots i.now {
		background: var(--amber);
	}

	.coach .dots i.done {
		background: var(--good);
	}

	.coach h4 {
		font-size: 20px;
		letter-spacing: 0.14em;
		margin-bottom: 4px;
	}

	.coach.passed h4 {
		color: var(--good);
	}

	.coach p {
		margin: 0;
		font-size: 16px;
		line-height: 1.35;
		color: var(--ink);
	}

	.coach .keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		margin-top: 10px;
	}

	.coach kbd {
		min-width: 26px;
		padding: 3px 7px;
		text-align: center;
		font-family: var(--display);
		font-size: 13px;
		color: var(--ink);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-bottom-width: 3px;
		border-radius: 3px;
		text-shadow: none;
	}

	.coach .pad {
		margin-left: 6px;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.coach .bar {
		height: 3px;
		margin-top: 12px;
		background: rgba(255, 255, 255, 0.1);
	}

	.coach .bar span {
		display: block;
		height: 100%;
		background: var(--amber);
		transform-origin: left;
		transition: transform 0.2s;
	}

	.coach.passed .bar span {
		background: var(--good);
	}

	.coach .next,
	.coach .skip {
		margin-top: 8px;
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.coach .next {
		color: var(--amber);
		animation: pulse 0.9s ease-in-out infinite alternate;
	}

	.coach .next kbd {
		font-size: 11px;
		padding: 1px 6px;
	}

	/* ------------------------------------------------ status */
	.status {
		left: 22px;
		bottom: 20px;
		display: grid;
		gap: 7px;
		padding: 14px 16px 12px;
		width: 290px;
		background: linear-gradient(135deg, rgba(8, 10, 16, 0.6), rgba(8, 10, 16, 0.25));
		border-left: 2px solid var(--line);
		clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
	}

	.gauge,
	.flares {
		display: grid;
		grid-template-columns: 56px 1fr 26px;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		letter-spacing: 0.18em;
	}

	.lbl {
		color: var(--ink-dim);
	}

	.val {
		text-align: right;
		font-family: var(--display);
		font-size: 12px;
		color: var(--ink-faint);
	}

	.gauge:first-child .val {
		color: var(--ink);
		font-size: 14px;
	}

	.fill.hp {
		background: linear-gradient(90deg, #d8ffd0, var(--good));
	}

	.fill.boost {
		background: linear-gradient(90deg, #ffe7b8, var(--amber));
	}

	.fill.heat {
		background: linear-gradient(90deg, #ffd27a, #ff6a2a);
	}

	.fill.heat.over {
		background: var(--danger);
		animation: pulse 0.25s linear infinite alternate;
	}

	.flares {
		grid-template-columns: 56px repeat(8, auto) 1fr;
		justify-items: start;
	}

	.flares .val {
		justify-self: end;
	}

	.pip {
		width: 9px;
		height: 9px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		transform: rotate(45deg);
		margin-right: 3px;
	}

	.pip.on {
		background: #fff1d2;
		border-color: #fff1d2;
		box-shadow: 0 0 8px rgba(255, 220, 160, 0.8);
	}

	.readout {
		display: flex;
		gap: 22px;
		margin-top: 2px;
		font-family: var(--display);
		font-size: 20px;
		font-variant-numeric: tabular-nums;
	}

	.readout em {
		font-style: normal;
		font-family: var(--body);
		font-size: 11px;
		letter-spacing: 0.2em;
		color: var(--ink-faint);
		margin-right: 6px;
	}

	.readout small {
		font-size: 11px;
		color: var(--ink-faint);
		margin-left: 3px;
	}

	/* ------------------------------------------------ bombs */
	.bombs {
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
	}

	.slot {
		position: relative;
		display: grid;
		grid-template-columns: auto auto;
		grid-template-rows: auto auto;
		column-gap: 8px;
		min-width: 92px;
		padding: 8px 12px 7px;
		background: rgba(8, 10, 16, 0.55);
		border-bottom: 2px solid rgba(255, 255, 255, 0.08);
		transition:
			transform 0.15s ease,
			background 0.15s ease;
	}

	.slot.sel {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c) 28%, transparent),
			rgba(8, 10, 16, 0.75)
		);
		border-bottom-color: var(--c);
		transform: translateY(-6px);
		box-shadow: 0 6px 24px color-mix(in srgb, var(--c) 30%, transparent);
	}

	.slot.empty {
		opacity: 0.4;
	}

	.slot.missile {
		--c: #6fe3ff;
		margin-left: 10px;
	}

	.fill.focus {
		background: linear-gradient(90deg, #c9f6ff, #4fd2ff);
	}

	.fill.focus.on {
		animation: pulse 0.5s ease-in-out infinite alternate;
	}

	.gauge.ready .lbl {
		color: #9fe9ff;
	}

	.focus-tag {
		position: absolute;
		left: 50%;
		top: 92px;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 5px;
	}

	.focus-tag span {
		font-family: var(--display);
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.6em;
		margin-right: -0.6em;
		color: #b8f3ff;
		text-shadow: 0 0 18px rgba(80, 210, 255, 0.8);
	}

	.focus-tag i {
		display: block;
		width: 180px;
		height: 2px;
		background: #7fe8ff;
		box-shadow: 0 0 10px #4fd2ff;
		transform-origin: center;
	}

	.focus-tag small {
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(200, 240, 255, 0.75);
	}

	.key {
		grid-row: span 2;
		align-self: center;
		font-family: var(--display);
		font-size: 12px;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: var(--ink-dim);
	}

	.nm {
		font-size: 12px;
		letter-spacing: 0.16em;
		color: var(--c);
	}

	.ct {
		font-family: var(--display);
		font-size: 19px;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.ct em {
		font-style: normal;
		font-size: 11px;
		color: var(--ink-faint);
	}

	/* ------------------------------------------------ warnings */
	.warnings {
		left: 50%;
		top: 40%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 8px;
	}

	.warn {
		font-family: var(--display);
		font-size: 26px;
		font-weight: 700;
		letter-spacing: 0.24em;
		color: var(--danger);
		text-shadow:
			0 0 16px rgba(255, 60, 40, 0.7),
			0 1px 2px #000;
		animation: pulse 0.32s ease-in-out infinite alternate;
	}

	.threat {
		display: grid;
		grid-template-columns: auto auto auto;
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 12px;
		font-family: var(--display);
		color: #ffb04a;
		text-shadow:
			0 0 14px rgba(255, 150, 40, 0.6),
			0 1px 2px #000;
	}

	.threat .arrow {
		display: inline-block;
		font-size: 22px;
		line-height: 1;
		transition: transform 0.08s linear;
	}

	.threat .label {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.24em;
	}

	.threat .range {
		font-size: 24px;
		min-width: 4.5ch;
		text-align: right;
	}

	.threat .range small {
		font-size: 12px;
		margin-left: 2px;
		opacity: 0.7;
	}

	.threat .meter {
		grid-column: 1 / -1;
		position: relative;
		height: 4px;
		margin-top: 4px;
		background: rgba(255, 255, 255, 0.12);
	}

	.threat .meter span {
		position: absolute;
		inset: 0;
		background: currentColor;
		transform-origin: left;
	}

	.threat .meter i {
		position: absolute;
		top: -3px;
		width: 2px;
		height: 10px;
		background: #fff;
		opacity: 0.8;
	}

	.threat.close {
		color: var(--danger);
		text-shadow:
			0 0 16px rgba(255, 60, 40, 0.75),
			0 1px 2px #000;
		animation: pulse 0.2s ease-in-out infinite alternate;
	}

	.brake {
		font-family: var(--display);
		font-size: 15px;
		letter-spacing: 0.32em;
		color: #9fd6ff;
		text-shadow:
			0 0 12px rgba(120, 190, 255, 0.6),
			0 1px 2px #000;
	}

	.warn small {
		font-family: var(--body);
		font-size: 14px;
		letter-spacing: 0.18em;
		color: var(--ink);
		margin-left: 8px;
	}

	.warn.lock {
		font-size: 20px;
		color: #ffb35a;
		animation-duration: 0.6s;
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	.warn.lock .arrow {
		display: inline-block;
		margin-right: 6px;
		transition: transform 0.08s linear;
	}

	.lockbar {
		width: 160px;
		height: 3px;
		background: rgba(255, 255, 255, 0.15);
	}

	.lockbar span {
		display: block;
		height: 100%;
		background: #ffb35a;
		transform-origin: left;
	}

	.warn.soft {
		font-size: 16px;
		color: #ffd27a;
		animation: none;
	}

	.good {
		font-family: var(--display);
		font-size: 17px;
		letter-spacing: 0.3em;
		color: var(--good);
		text-shadow: 0 0 12px rgba(120, 255, 120, 0.5);
	}

	@keyframes pulse {
		from {
			opacity: 1;
		}
		to {
			opacity: 0.45;
		}
	}

	/* ------------------------------------------------ banners */
	.banners {
		left: 50%;
		top: 12%;
		width: min(760px, 90vw);
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 6px;
	}

	.banner {
		text-align: center;
	}

	.banner h3 {
		margin: 0;
		font-family: var(--display);
		font-size: clamp(30px, 4.4vw, 56px);
		font-weight: 700;
		letter-spacing: 0.22em;
		color: #fff4dc;
		text-shadow:
			0 0 30px rgba(255, 140, 40, 0.55),
			0 2px 4px #000;
	}

	.banner p {
		margin: 6px 0 0;
		font-size: 15px;
		line-height: 1.3;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.banner.warn h3 {
		color: #ffd0c4;
		text-shadow: 0 0 30px rgba(255, 50, 30, 0.7);
	}

	.banner.good h3 {
		color: #e4ffd8;
		text-shadow: 0 0 30px rgba(120, 255, 120, 0.45);
	}

	.respawn {
		position: absolute;
		left: 50%;
		top: 46%;
		transform: translateX(-50%);
		text-align: center;
		display: grid;
		gap: 6px;
	}

	.respawn span {
		font-size: 14px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--danger);
	}

	.respawn strong {
		font-family: var(--display);
		font-size: 24px;
		letter-spacing: 0.12em;
	}

	.critical::after {
		content: '';
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 120px rgba(255, 30, 20, 0.35);
		animation: pulse 0.5s ease-in-out infinite alternate;
	}

	@media (max-width: 900px) {
		.status {
			transform: scale(0.85);
			transform-origin: left bottom;
		}

		.bombs {
			transform: translateX(-50%) scale(0.85);
			transform-origin: bottom center;
			bottom: 150px;
		}

		.base {
			grid-template-columns: auto 160px auto;
		}

		.objectives,
		.coach {
			top: 96px;
			transform: scale(0.85);
			transform-origin: right top;
		}
	}
</style>
