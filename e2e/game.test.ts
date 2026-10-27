import { expect, test, type Page } from '@playwright/test';

async function openTitle(page: Page): Promise<string[]> {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto('/');
	await expect(page.getByRole('button', { name: /sortie/i })).toBeVisible({ timeout: 90_000 });
	return errors;
}

test('boots to the title screen over a live WebGL battlefield', async ({ page }) => {
	const errors = await openTitle(page);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('DEATH');
	const size = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
	expect(size[0]).toBeGreaterThan(200);
	expect(size[1]).toBeGreaterThan(100);
	await page.waitForTimeout(1500);
	expect(errors).toEqual([]);
});

test('remembers the chosen aircraft and its custom loadout', async ({ page }) => {
	await openTitle(page);
	await page.getByRole('button', { name: /hangar/i }).click();
	const card = page.getByRole('button', { name: /grizzly/i });
	await card.click();
	await expect(card).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Fewer GP-250' }).click();
	await expect(
		page.getByRole('button', { name: 'Fewer GP-250' }).locator('..').locator('output')
	).toHaveText('9');
	await page.reload();
	await page.getByRole('button', { name: /hangar/i }).click({ timeout: 90_000 });
	await expect(page.getByRole('button', { name: /grizzly/i })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(
		page.getByRole('button', { name: 'Fewer GP-250' }).locator('..').locator('output')
	).toHaveText('9');
});

test('flies a sortie: HUD, bombing and pause menu', async ({ page }) => {
	const errors = await openTitle(page);
	await page.getByRole('button', { name: /sortie/i }).click();
	await page.getByRole('tab', { name: /endless/i }).click();
	await page.getByRole('button', { name: /start endless/i }).click();
	await expect(page.getByText('ARMOR')).toBeVisible();
	await expect(page.getByText(/WAVE 1/).first()).toBeVisible();

	const gp = page.locator('.slot', { hasText: 'GP-250' });
	const before = Number((await gp.locator('.ct').innerText()).split('/')[0]);
	await page.keyboard.down('KeyD');
	await page.waitForTimeout(800);
	await page.keyboard.press('Space');
	await expect
		.poll(async () => Number((await gp.locator('.ct').innerText()).split('/')[0]), {
			timeout: 20_000
		})
		.toBeLessThan(before);
	await page.keyboard.up('KeyD');

	await page.keyboard.press('Escape');
	await expect(page.getByRole('heading', { name: /paused/i })).toBeVisible();
	await page.getByRole('button', { name: /resume/i }).click();
	await expect(page.getByRole('heading', { name: /paused/i })).toBeHidden();

	// Restart from the pause menu: a fresh sortie with a full rack.
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: /restart/i }).click();
	await expect(page.getByRole('heading', { name: /paused/i })).toBeHidden();
	await expect
		.poll(async () => Number((await gp.locator('.ct').innerText()).split('/')[0]), {
			timeout: 20_000
		})
		.toBe(before);
	expect(errors).toEqual([]);
});

test('opens the flight manual from the title screen', async ({ page }) => {
	await openTitle(page);
	await page.getByRole('button', { name: /^controls$/i }).click();
	await expect(page.getByRole('dialog', { name: /controls/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /controls/i })).toBeHidden();
});

test('mode select: training first, campaign missions unlock in order', async ({ page }) => {
	const errors = await openTitle(page);
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: /choose a mode/i });
	await expect(dialog).toBeVisible();
	// A new pilot is pointed at training.
	await expect(page.getByRole('tab', { name: /training/i })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.getByRole('tab', { name: /campaign/i }).click();
	await expect(page.getByRole('button', { name: /mission 1: first light/i })).toBeEnabled();
	await expect(page.getByRole('button', { name: /mission 2: .*locked/i })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	expect(errors).toEqual([]);
});

test('training walks through lessons', async ({ page }) => {
	const errors = await openTitle(page);
	await page.getByRole('button', { name: /sortie/i }).click();
	await page.getByRole('button', { name: /start training/i }).click();
	await expect(page.getByText('Lesson 1/12')).toBeVisible();
	await expect(page.getByText(/TRAINING/).first()).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Lesson 2/12')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Climb', exact: true })).toBeVisible();
	// Enter skips an action lesson; its targets appear with the next one.
	await page.keyboard.press('Enter');
	await expect(page.getByText('Lesson 3/12')).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'Guns', exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});

test('a campaign mission shows its objectives', async ({ page }) => {
	const errors = await openTitle(page);
	await page.getByRole('button', { name: /sortie/i }).click();
	await page.getByRole('tab', { name: /campaign/i }).click();
	await page.getByRole('button', { name: /fly first light/i }).click();
	const goals = page.getByRole('region', { name: /objectives/i });
	await expect(goals).toContainText('First Light');
	await expect(goals).toContainText('0/2 waves');
	await expect(page.getByText(/WAVE 1\/2/).first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('the campaign map shows the front and remembers the strike for a mission', async ({
	page
}) => {
	await page.addInitScript(() => {
		localStorage.setItem('dfa.trained', '1');
		localStorage.setItem(
			'dfa.campaign',
			JSON.stringify({ 'first-light': { stars: 2, best: 900 } })
		);
	});
	const errors = await openTitle(page);
	await page.getByRole('button', { name: /sortie/i }).click();
	const map = page.getByRole('group', { name: /campaign map/i });
	await expect(map).toBeVisible();
	await expect(map.getByText('FRONT')).toBeVisible();
	await expect(
		page.getByRole('button', { name: /mission 1: first light, 2 stars/i })
	).toBeVisible();
	await page.getByRole('button', { name: /mission 2: the crossing/i }).click();
	const radar = page.getByRole('radio', { name: /radar site/i });
	await radar.click();
	await expect(radar).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: /sortie/i }).click();
	await expect(page.getByRole('radio', { name: /radar site/i })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.getByRole('button', { name: /fly the crossing/i }).click();
	await expect(page.getByText(/radar site hit/i).first()).toBeVisible();
	expect(errors).toEqual([]);
});
