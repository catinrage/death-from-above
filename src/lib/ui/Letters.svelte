<script lang="ts">
	interface Props {
		text: string;
		/** Milliseconds before the first letter. */
		delay?: number;
		/** Milliseconds between letters. */
		stagger?: number;
	}

	let { text, delay = 0, stagger = 45 }: Props = $props();
	const chars = $derived(Array.from(text));
</script>

<!-- One span per letter, rising out of a mask with a blur; screen readers get the plain text. -->
<span class="letters"
	><span class="sr">{text}</span>{#each chars as c, i (i)}<span
			class="ch"
			class:sp={c === ' '}
			aria-hidden="true"
			style:animation-delay="{delay + i * stagger}ms">{c}</span
		>{/each}</span
>

<style>
	.letters {
		display: inline-block;
		white-space: nowrap;
	}

	.ch {
		display: inline-block;
		animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.sp {
		width: 0.3em;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(0.45em) scaleY(1.4);
			filter: blur(8px) brightness(2.2);
		}
		60% {
			opacity: 1;
			filter: blur(0) brightness(1.4);
		}
	}
</style>
