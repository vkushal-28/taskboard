import { expect, test, type Locator, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';

// The seeded demo owner (apps/api/src/modules/demo/seed.ts).
const PRIYA = { email: 'priya@acme.dev', password: 'demo1234!' };
const CARD_TITLE = 'Write the e2e test';

let boardId: string | undefined;

test.afterEach(async ({ page }) => {
  // page.request shares the browser's cookies, so this deletes as Priya.
  if (boardId) await page.request.delete(`${API_URL}/boards/${boardId}`);
  boardId = undefined;
});

test('a card dragged to another list stays there after a reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(PRIYA.email);
  await page.getByLabel('Password').fill(PRIYA.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // A unique title, so runs never depend on each other's leftovers.
  const title = `E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board title').fill(title);
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.waitForURL(/\/b\/[0-9a-f]{24}$/);
  boardId = page.url().split('/b/')[1];
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await page.getByRole('button', { name: '+ Add a list', exact: true }).click();
  await page.getByLabel('List title').fill('Review');
  await page.getByRole('button', { name: 'Add list', exact: true }).click();
  const review = listNamed(page, 'Review');
  await expect(review).toBeVisible();

  const todo = listNamed(page, 'To Do');
  await todo.getByRole('button', { name: '+ Add a card', exact: true }).click();
  await todo.getByLabel('Card title').fill(CARD_TITLE);
  await todo.getByRole('button', { name: 'Add card', exact: true }).click();
  const card = page.getByTestId(/^card-/).filter({ hasText: CARD_TITLE });
  await expect(todo.getByTestId(/^card-/)).toHaveCount(1);

  const moved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().endsWith('/move'),
  );
  await dragOnto(page, card, review);
  expect((await moved).ok()).toBe(true);
  await expect(review.getByTestId(/^card-/)).toHaveText([new RegExp(CARD_TITLE)]);
  await expect(todo.getByTestId(/^card-/)).toHaveCount(0);

  await page.reload();
  await expect(listNamed(page, 'Review').getByTestId(/^card-/)).toHaveText([
    new RegExp(CARD_TITLE),
  ]);
  await expect(listNamed(page, 'To Do').getByTestId(/^card-/)).toHaveCount(0);
});

function listNamed(page: Page, name: string): Locator {
  return page
    .getByTestId(/^list-/)
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

/**
 * Drags with real pointer moves. dnd-kit only starts a drag after the pointer travels a few
 * pixels (DRAG_ACTIVATION_PX), and tracks pointermove events, so Locator.dragTo's single jump
 * isn't enough.
 */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 20 });
  await page.mouse.up();
}
