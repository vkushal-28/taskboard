import bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '../auth/service.js';
import { BoardModel } from '../boards/model.js';
import { createBoard } from '../boards/service.js';
import { createCard, updateCard } from '../cards/service.js';
import { addComment } from '../comments/service.js';
import { createList } from '../lists/service.js';
import { UserModel } from '../users/model.js';

/** Shown on the sign-in page (DEMO_CREDENTIALS in apps/web). Keep the two in sync. */
export const DEMO_PASSWORD = 'demo1234!';
export const DEMO_USERS = {
  priya: { name: 'Priya Sharma', email: 'priya@acme.dev' },
  alex: { name: 'Alex Kim', email: 'alex@acme.dev' },
} as const;

type DemoUser = keyof typeof DEMO_USERS;

const LABELS = {
  design: { name: 'Design', color: '#7c3aed' },
  mobile: { name: 'Mobile', color: '#2563eb' },
  marketing: { name: 'Marketing', color: '#ea580c' },
  urgent: { name: 'High priority', color: '#dc2626' },
  infra: { name: 'Infra', color: '#16a34a' },
} as const;

interface DemoCard {
  title: string;
  description?: string;
  labels?: (keyof typeof LABELS)[];
  /** Days from the day the seed runs, so due dates never start out in the past. */
  dueInDays?: number;
  assignees?: DemoUser[];
  checklist?: { text: string; done?: boolean }[];
  comments?: { by: DemoUser; body: string }[];
}

interface DemoBoard {
  title: string;
  color: string;
  /** The first three fill the starter lists (To Do, In Progress, Done); the rest are added. */
  lists: { title: string; cards: DemoCard[] }[];
}

// Priya owns both boards and Alex is a member, so the demo login shows the owner's view.
export const DEMO_BOARDS: DemoBoard[] = [
  {
    title: 'Website Redesign',
    color: '#2563eb',
    lists: [
      {
        title: 'To Do',
        cards: [
          { title: 'Audit the current site' },
          { title: 'Collect analytics for the top 20 pages' },
          { title: 'Write the content inventory' },
        ],
      },
      {
        title: 'In Progress',
        cards: [{ title: 'Design the new homepage' }, { title: 'Set up the component library' }],
      },
      {
        title: 'Done',
        cards: [{ title: 'Kick-off meeting' }, { title: 'Pick the brand colours' }],
      },
    ],
  },
  {
    title: 'Mobile App Launch',
    color: '#16a34a',
    lists: [
      {
        title: 'To Do',
        cards: [
          {
            title: 'Write App Store listing copy',
            description: 'Title, subtitle, keywords and captions for five screenshots.',
            labels: ['marketing'],
            dueInDays: 9,
          },
          {
            title: 'Design onboarding screens',
            description: 'Three welcome screens plus the notification permission explainer.',
            labels: ['design', 'urgent'],
            dueInDays: 5,
            assignees: ['alex'],
            checklist: [
              { text: 'Welcome screen' },
              { text: 'Permission explainer' },
              { text: 'Empty state art' },
            ],
          },
        ],
      },
      {
        title: 'In Progress',
        cards: [
          {
            title: 'Push notifications',
            description: 'Reminders for due cards and @mentions. FCM on Android, APNs on iOS.',
            labels: ['mobile', 'urgent'],
            dueInDays: 11,
            assignees: ['priya'],
            checklist: [
              { text: 'Register APNs key', done: true },
              { text: 'FCM project setup', done: true },
              { text: 'Opt-in prompt copy' },
              { text: 'Test on real devices' },
            ],
            comments: [{ by: 'priya', body: 'APNs key is in the team vault. FCM next.' }],
          },
          {
            title: 'Prepare launch email',
            labels: ['marketing'],
            dueInDays: 15,
          },
          {
            title: 'Dark mode polish',
            labels: ['design', 'mobile'],
            assignees: ['alex'],
            comments: [
              {
                by: 'alex',
                body: 'Contrast on the card tiles is too low in dark mode, fixing tokens first.',
              },
            ],
          },
        ],
      },
      {
        title: 'Done',
        cards: [
          { title: 'Beta signup page', labels: ['marketing'] },
          { title: 'Analytics events plan', labels: ['infra'] },
          { title: 'Privacy policy reviewed' },
        ],
      },
      {
        title: 'QA / Review',
        cards: [
          {
            title: 'Set up crash reporting',
            description: 'Sentry for React Native, source maps uploaded in CI.',
            labels: ['infra'],
          },
        ],
      },
    ],
  },
];

interface SeedResult {
  userIds: Record<DemoUser, string>;
  boards: { title: string; id: string; created: boolean }[];
}

/**
 * Creates the demo accounts and boards. Safe to run again: the accounts get the demo password
 * back, and a demo board that already exists is left as people changed it.
 */
export async function seedDemo(): Promise<SeedResult> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const userIds = {
    priya: await upsertUser(DEMO_USERS.priya, passwordHash),
    alex: await upsertUser(DEMO_USERS.alex, passwordHash),
  };

  const boards: SeedResult['boards'] = [];
  for (const spec of DEMO_BOARDS) {
    const existing = await BoardModel.findOne({
      title: spec.title,
      members: { $elemMatch: { userId: userIds.priya, role: 'owner' } },
    });
    const id = existing ? existing.id : await createDemoBoard(spec, userIds);
    boards.push({ title: spec.title, id, created: !existing });
  }
  return { userIds, boards };
}

// Through the services, so positions, starter lists and activity match real use.
async function createDemoBoard(spec: DemoBoard, userIds: SeedResult['userIds']): Promise<string> {
  const owner = userIds.priya;
  const detail = await createBoard(owner, { title: spec.title, color: spec.color });
  const boardId = detail.board.id;
  await BoardModel.updateOne(
    { _id: boardId },
    { $push: { members: { userId: userIds.alex, role: 'member' } } },
  );

  const starterLists = [...detail.lists].sort((a, b) => (a.position < b.position ? -1 : 1));
  for (const [index, { title, cards }] of spec.lists.entries()) {
    const listId = starterLists[index]?.id ?? (await createList(boardId, owner, { title })).id;
    // Sequential: each card goes after the previous one.
    for (const card of cards) await createDemoCard(boardId, listId, card, userIds);
  }
  return boardId;
}

async function createDemoCard(
  boardId: string,
  listId: string,
  card: DemoCard,
  userIds: SeedResult['userIds'],
): Promise<void> {
  const owner = userIds.priya;
  const { id } = await createCard(boardId, listId, owner, {
    title: card.title,
    description: card.description ?? '',
  });

  const details = {
    ...(card.labels && { labels: card.labels.map((label) => LABELS[label]) }),
    ...(card.dueInDays !== undefined && { dueDate: daysFromNow(card.dueInDays) }),
    ...(card.assignees && { assignees: card.assignees.map((user) => userIds[user]) }),
    ...(card.checklist && {
      checklist: card.checklist.map(({ text, done = false }) => ({ text, done })),
    }),
  };
  if (Object.keys(details).length > 0) await updateCard(boardId, id, owner, details);

  for (const { by, body } of card.comments ?? []) await addComment(boardId, id, userIds[by], body);
}

function daysFromNow(days: number): string {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + days);
  due.setUTCHours(17, 0, 0, 0);
  return due.toISOString();
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
