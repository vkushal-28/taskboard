import { expect, test, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import {
  acceptAsNewUser,
  addCard,
  addList,
  cardNamed,
  createBoard,
  deleteBoard,
  dragOnto,
  invite,
  listNamed,
  newPerson,
  onlineCount,
  openWindow,
  registerFromScratch,
} from './helpers';

// Each test registers its own people and deletes its board, so tests and repeated runs
// (`--repeat-each`) never see each other's data.
let cleanup: { page: Page; boardId: string } | undefined;

test.afterEach(async () => {
  if (cleanup) await deleteBoard(cleanup.page, cleanup.boardId);
  cleanup = undefined;
});

test('a new user registers, builds a board and fills in a card', async ({ page }) => {
  const owner = newPerson('Olivia');
  await registerFromScratch(page, owner);
  const boardId = await createBoard(page, `Launch ${Date.now()}`);
  cleanup = { page, boardId };

  await addList(page, 'Review');
  await addCard(page, 'To Do', 'Write release notes');
  await addCard(page, 'To Do', 'Record the demo video');

  await cardNamed(page, 'Write release notes').click();
  const card = page.getByRole('dialog', { name: 'Write release notes' });
  await expect(card).toBeVisible();

  // The description saves when focus leaves it, without pressing Save.
  await card.getByRole('button', { name: 'Add a description' }).click();
  await card.getByRole('textbox', { name: 'Description' }).fill('Summarise every feature.');
  await card.getByRole('textbox', { name: 'New checklist item' }).click();
  await expect(card.getByRole('button', { name: 'Edit description' })).toHaveText(
    'Summarise every feature.',
  );

  for (const item of ['Draft', 'Review', 'Publish']) {
    await card.getByRole('textbox', { name: 'New checklist item' }).fill(item);
    await card.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(card.getByRole('checkbox', { name: item })).toBeVisible();
  }
  await card.getByRole('checkbox', { name: 'Draft' }).click();
  await expect(card.getByRole('checkbox', { name: 'Draft' })).toBeChecked();
  await expect(card.getByText('1 of 3 done')).toBeVisible();

  await card.getByRole('textbox', { name: 'Write a comment' }).fill('First draft is in the doc.');
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card.getByText('First draft is in the doc.')).toBeVisible();

  // Everything survives a reload of the card's own URL.
  await page.reload();
  const reloaded = page.getByRole('dialog', { name: 'Write release notes' });
  await expect(reloaded.getByRole('button', { name: 'Edit description' })).toHaveText(
    'Summarise every feature.',
  );
  await expect(reloaded.getByText('1 of 3 done')).toBeVisible();
  await expect(reloaded.getByRole('button', { name: 'Comments (1)' })).toBeVisible();

  await reloaded.getByRole('button', { name: 'History', exact: true }).click();
  const history = reloaded.getByRole('list', { name: 'History' });
  await expect(history).toContainText('updated the checklist');
  await expect(history).toContainText('updated the description');
  await expect(history).toContainText('created this card');

  await reloaded.getByRole('button', { name: 'Close card' }).click();
  const tile = cardNamed(listNamed(page, 'To Do'), 'Write release notes');
  await expect(tile.getByLabel('Checklist 1 of 3 done')).toBeVisible();
  await expect(tile.getByLabel('1 comment')).toBeVisible();
});

test('an invited member and the owner see each other’s changes live', async ({
  page: owner,
  browser,
}) => {
  const ownerPerson = newPerson('Olivia');
  const memberPerson = newPerson('Marco');
  await registerFromScratch(owner, ownerPerson);
  const boardId = await createBoard(owner, `Live ${Date.now()}`);
  cleanup = { page: owner, boardId };
  await addCard(owner, 'To Do', 'Plan the sprint');

  const link = await invite(owner, memberPerson.email, 'Member');
  const member = await openWindow(browser);
  await acceptAsNewUser(member, link, memberPerson);

  await expect(member.getByText('Member', { exact: true }).first()).toBeVisible();
  await expect(onlineCount(owner)).toHaveText('2 online');
  await expect(onlineCount(member)).toHaveText('2 online');

  // Owner adds a card: the member sees it without reloading.
  await addCard(owner, 'In Progress', 'Fix the login bug');
  await expect(cardNamed(listNamed(member, 'In Progress'), 'Fix the login bug')).toBeVisible();

  // Member drags a card to Done: the owner sees it move and gets a toast naming who moved it.
  await dragOnto(member, cardNamed(member, 'Plan the sprint'), listNamed(member, 'Done'));
  await expect(cardNamed(listNamed(owner, 'Done'), 'Plan the sprint')).toBeVisible();
  await expect(
    owner.getByText(`${memberPerson.name} moved "Plan the sprint" to Done`),
  ).toBeVisible();

  // Member comments: the owner's tile shows the new comment count.
  await cardNamed(member, 'Fix the login bug').click();
  const memberCard = member.getByRole('dialog', { name: 'Fix the login bug' });
  await memberCard.getByRole('textbox', { name: 'Write a comment' }).fill('On it.');
  await memberCard.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(memberCard.getByText('On it.')).toBeVisible();
  await expect(cardNamed(owner, 'Fix the login bug').getByLabel('1 comment')).toBeVisible();

  // Owner renames that card while the member has it open: the member's modal updates.
  await cardNamed(owner, 'Fix the login bug').click();
  const ownerTitle = owner.getByRole('dialog').getByRole('textbox', { name: 'Card title' });
  await ownerTitle.fill('Fix the login bug on Safari');
  await ownerTitle.press('Enter');
  await expect(member.getByRole('dialog').getByRole('textbox', { name: 'Card title' })).toHaveValue(
    'Fix the login bug on Safari',
  );

  // Closing the member's window drops them from the owner's presence count.
  await member.context().close();
  await expect(onlineCount(owner)).toHaveText('1 online');
});

test('a viewer sees live changes but cannot change anything', async ({ page: owner, browser }) => {
  const viewerPerson = newPerson('Vera');
  await registerFromScratch(owner, newPerson('Olivia'));
  const boardId = await createBoard(owner, `Read only ${Date.now()}`);
  cleanup = { page: owner, boardId };
  await addCard(owner, 'To Do', 'Existing card');

  const link = await invite(owner, viewerPerson.email, 'Viewer');
  const viewer = await openWindow(browser);
  await acceptAsNewUser(viewer, link, viewerPerson);

  await expect(viewer.getByText('Viewer', { exact: true }).first()).toBeVisible();
  await expect(viewer.getByRole('button', { name: '+ Add a card' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: '+ Add a list' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);

  await cardNamed(viewer, 'Existing card').click();
  const card = viewer.getByRole('dialog', { name: 'Existing card' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('textbox')).toHaveCount(0);
  await viewer.keyboard.press('Escape');

  // The api refuses a write even if someone skips the UI.
  const cardId = (await cardNamed(viewer, 'Existing card').getAttribute('data-testid'))?.slice(5);
  const refused = await viewer.request.patch(`${API_URL}/cards/${cardId}`, {
    data: { title: 'Changed by a viewer' },
    failOnStatusCode: false,
  });
  expect(refused.status()).toBe(403);

  await addCard(owner, 'Done', 'Shipped it');
  await expect(cardNamed(listNamed(viewer, 'Done'), 'Shipped it')).toBeVisible();
  await viewer.context().close();
});

test('signing out in one tab signs out the other tabs', async ({ page, context }) => {
  await registerFromScratch(page, newPerson('Tess'));
  const boardId = await createBoard(page, `Tabs ${Date.now()}`);

  // Same context = same browser, same cookies: a home tab and a board tab.
  const home = await context.newPage();
  await home.goto('/');
  await expect(home.getByRole('heading', { name: /Tess/, level: 1 })).toBeVisible();
  const board = await context.newPage();
  await board.goto(`/b/${boardId}`);
  await expect(onlineCount(board)).toHaveText('1 online');

  await deleteBoard(page, boardId);
  await page.goto('/');
  await page.getByLabel('Account menu').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/login$/);

  await home.waitForURL(/\/login$/);
  await board.waitForURL(/\/login$/);
});
