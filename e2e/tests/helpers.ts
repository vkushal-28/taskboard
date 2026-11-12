import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';

const PASSWORD = 'e2e-password-123';

export interface Person {
  name: string;
  email: string;
}

/** A person no earlier run has registered, so runs never depend on each other's leftovers. */
export function newPerson(name: string): Person {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { name, email: `${name.toLowerCase()}-${id}@e2e.test` };
}

/** A browser window of its own: separate cookies, like a second person on another computer. */
export async function openWindow(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function register(page: Page, person: Person): Promise<void> {
  await page.getByLabel('Name').fill(person.name);
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

export async function registerFromScratch(page: Page, person: Person): Promise<void> {
  await page.goto('/register');
  await register(page, person);
  await expect(
    page.getByRole('heading', { name: new RegExp(person.name), level: 1 }),
  ).toBeVisible();
}

/** Creates a board and opens it; returns its id. */
export async function createBoard(page: Page, title: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board title').fill(title);
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.waitForURL(/\/b\/[0-9a-f]{24}$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  return page.url().split('/b/')[1] ?? '';
}

/** Deletes a board as whoever is signed in on this page (page.request shares its cookies). */
export async function deleteBoard(page: Page, boardId: string): Promise<void> {
  await page.request.delete(`${API_URL}/boards/${boardId}`);
}

export async function addList(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: '+ Add a list', exact: true }).click();
  await page.getByLabel('List title').fill(title);
  await page.getByRole('button', { name: 'Add list', exact: true }).click();
  const list = listNamed(page, title);
  await expect(list).toBeVisible();
  return list;
}

export async function addCard(page: Page, listName: string, title: string): Promise<void> {
  const list = listNamed(page, listName);
  await list.getByRole('button', { name: '+ Add a card', exact: true }).click();
  await list.getByLabel('Card title').fill(title);
  await list.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(cardNamed(list, title)).toBeVisible();
  await list.getByRole('button', { name: 'Cancel', exact: true }).click();
}

/** Invites someone from the Share dialog and returns the invite link it shows. */
export async function invite(
  page: Page,
  email: string,
  role: 'Member' | 'Viewer',
): Promise<string> {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Share/ });
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByLabel('Role for the invite').selectOption({ label: role });
  await dialog.getByRole('button', { name: 'Invite', exact: true }).click();
  const link = await dialog.getByLabel('Invite link').inputValue();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return link;
}

/**
 * Opens an invite as someone without an account: the link sends them to sign-in, they
 * register from there, come back to the invite and accept it.
 */
export async function acceptAsNewUser(page: Page, link: string, person: Person): Promise<void> {
  await page.goto(link);
  await page.waitForURL(/\/login$/);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await register(page, person);
  await page.waitForURL(/\/invite\//);
  await page.getByRole('button', { name: 'Accept invite', exact: true }).click();
  await page.waitForURL(/\/b\/[0-9a-f]{24}$/);
}

export function listNamed(page: Page, name: string): Locator {
  return page
    .getByTestId(/^list-/)
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

// Card tiles are `card-<id>`; the open card dialog is `card-detail`, so match ids only.
export function cardNamed(scope: Page | Locator, title: string): Locator {
  return scope.getByTestId(/^card-[0-9a-f]{24}$/).filter({ hasText: title });
}

/** The "N online" count in the board header. */
export function onlineCount(page: Page): Locator {
  return page.getByText(/^\d+ online$/);
}

/**
 * Drags with real pointer moves. dnd-kit only starts a drag after the pointer travels a few
 * pixels (DRAG_ACTIVATION_PX), and tracks pointermove events, so Locator.dragTo's single jump
 * isn't enough.
 */
export async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
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
