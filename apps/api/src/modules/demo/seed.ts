import bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '../auth/service.js';
import { BoardModel } from '../boards/model.js';
import { createBoard } from '../boards/service.js';
import { createCard } from '../cards/service.js';
import { UserModel } from '../users/model.js';

/** Shown on the sign-in page (DEMO_CREDENTIALS in apps/web). Keep the two in sync. */
export const DEMO_PASSWORD = 'demo1234!';
export const DEMO_USERS = {
  priya: { name: 'Priya Sharma', email: 'priya@acme.dev' },
  alex: { name: 'Alex Kim', email: 'alex@acme.dev' },
} as const;
export const DEMO_BOARD_TITLE = 'Website Redesign';

// Starter lists from createBoard, in order: To Do, In Progress, Done.
const DEMO_CARDS = [
  [
    'Audit the current site',
    'Collect analytics for the top 20 pages',
    'Write the content inventory',
  ],
  ['Design the new homepage', 'Set up the component library'],
  ['Kick-off meeting', 'Pick the brand colours'],
];

export interface SeedResult {
  userIds: { priya: string; alex: string };
  boardId: string;
  boardCreated: boolean;
}

/**
 * Creates the demo accounts and board. Safe to run again: the accounts get the demo password
 * back, and an existing demo board is left as people changed it.
 */
export async function seedDemo(): Promise<SeedResult> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const priya = await upsertUser(DEMO_USERS.priya, passwordHash);
  const alex = await upsertUser(DEMO_USERS.alex, passwordHash);

  const existing = await BoardModel.findOne({
    title: DEMO_BOARD_TITLE,
    members: { $elemMatch: { userId: priya, role: 'owner' } },
  });
  if (existing) {
    return { userIds: { priya, alex }, boardId: existing.id, boardCreated: false };
  }

  // Through the services, so positions, starter lists and activity match real use.
  const detail = await createBoard(priya, { title: DEMO_BOARD_TITLE, color: '#2563eb' });
  const boardId = detail.board.id;
  await BoardModel.updateOne(
    { _id: boardId },
    { $push: { members: { userId: alex, role: 'member' } } },
  );

  const lists = [...detail.lists].sort((a, b) => (a.position < b.position ? -1 : 1));
  for (const [index, titles] of DEMO_CARDS.entries()) {
    const list = lists[index];
    if (!list) continue;
    // Sequential: each card goes after the previous one.
    for (const title of titles) {
      await createCard(boardId, list.id, priya, { title, description: '' });
    }
  }
  return { userIds: { priya, alex }, boardId, boardCreated: true };
}

async function upsertUser(
  { name, email }: { name: string; email: string },
  passwordHash: string,
): Promise<string> {
  const user = await UserModel.findOneAndUpdate(
    { email },
    { $set: { name, passwordHash } },
    { upsert: true, returnDocument: 'after' },
  );
  if (!user) throw new Error(`could not upsert ${email}`);
  return user.id;
}
