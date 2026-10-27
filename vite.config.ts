import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		coverage: {
			provider: 'v8',
			// Simulation and engine logic; GPU/DOM glue is exercised by the Playwright e2e run instead.
			include: ['src/lib/engine/**/*.ts', 'src/lib/game/**/*.ts'],
			exclude: [
				'**/*.spec.ts',
				'src/lib/game/test-world.ts',
				'src/lib/engine/renderer.ts',
				'src/lib/engine/gl/**',
				'src/lib/engine/shaders/**',
				'src/lib/game/game.ts',
				'src/lib/game/scene-view.ts',
				'src/lib/game/terrain-view.ts',
				'src/lib/game/input.ts',
				'src/lib/game/hud.ts'
			],
			thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 }
		},
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
