import { defineConfig } from '@playwright/test';

const PORT = 4319;

export default defineConfig({
	testDir: 'e2e',
	timeout: 120_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		viewport: { width: 1280, height: 720 },
		// Software WebGL in headless Chrome; slow but available everywhere.
		launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
	},
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
		port: PORT,
		timeout: 240_000,
		reuseExistingServer: false
	}
});
