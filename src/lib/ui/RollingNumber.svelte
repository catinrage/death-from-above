<script lang="ts">
	/**
	 * A number whose digits roll up or down to each new value, like a
	 * mechanical counter. Every digit is a column of 0–9 as wide as the widest
	 * digit, and `width` reserves room for that many characters, so the text
	 * around it never shifts as the number changes.
	 */
	interface Props {
		value: number;
		prefix?: string;
		suffix?: string;
		/** Characters of room to keep (prefix and separators included). */
		width?: number;
		/** Which end of that room the number sits at. */
		align?: 'start' | 'end';
	}

	let { value, prefix = '', suffix = '', width = 0, align = 'start' }: Props = $props();

	const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
	const text = $derived(Math.round(value).toLocaleString('en-US'));
	const chars = $derived((prefix + text + suffix).split(''));
	const isDigit = (c: string): boolean => c >= '0' && c <= '9';
</script>

<span
	class="roll"
	class:end={align === 'end'}
	style:min-width={width > 0 ? `${width}ch` : undefined}
>
	<span class="sr">{prefix}{text}{suffix}</span>
	<!-- Keyed from the right, so each column keeps its place as the number gains digits. -->
	{#each chars as c, i (chars.length - i)}
		{#if isDigit(c)}
			<span class="col" aria-hidden="true">
				<span class="strip" style:transform="translateY({-Number(c) * 10}%)">
					{#each DIGITS as d (d)}<span>{d}</span>{/each}
				</span>
			</span>
		{:else}
			<span class="sep" aria-hidden="true">{c}</span>
		{/if}
	{/each}
</span>

<style>
	.roll {
		position: relative;
		display: inline-flex;
		justify-content: flex-start;
		line-height: 1.15;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.roll.end {
		justify-content: flex-end;
	}

	.col {
		display: inline-block;
		height: 1.15em;
		overflow: hidden;
	}

	.strip {
		display: flex;
		flex-direction: column;
		transition: transform 0.6s cubic-bezier(0.2, 0.9, 0.25, 1.12);
	}

	.strip span {
		display: block;
		height: 1.15em;
		text-align: center;
	}

	.sep {
		display: inline-block;
	}

	/* Read once by screen readers, not digit by digit. */
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.strip {
			transition: none;
		}
	}
</style>
