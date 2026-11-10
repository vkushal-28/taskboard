import { expect, test } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { dragOnto, listNamed } from './helpers';

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
