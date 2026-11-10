import type { ActivityItem, ActivityType, CardField } from '@taskboard/shared';

const card = (item: ActivityItem) => (item.card ? `"${item.card.title}"` : 'a card');
const list = (item: ActivityItem) => (item.list ? `"${item.list.title}"` : 'a list');

const FIELD_NAMES: Record<CardField, string> = {
  title: 'title',
  description: 'description',
  labels: 'labels',
  assignees: 'members',
  dueDate: 'due date',
  checklist: 'checklist',
};

/** "the due date", "the title, labels and members"; null when the entry doesn't say. */
export function describeCardFields(fields: readonly CardField[] | undefined): string | null {
  const names = [...new Set((fields ?? []).map((field) => FIELD_NAMES[field]))];
  const last = names.pop();
  if (last === undefined) return null;
  return names.length === 0 ? `the ${last}` : `the ${names.join(', ')} and ${last}`;
}

function cardUpdated(item: ActivityItem): string {
  const what = describeCardFields(item.fields);
  return what ? `updated ${what} of ${card(item)}` : `updated ${card(item)}`;
}

// A Record over every type, so adding an activity type in shared fails the typecheck here
// until it has a sentence.
const SENTENCES: Record<ActivityType, (item: ActivityItem) => string> = {
  'board.created': () => 'created the board',
  'board.updated': () => 'updated the board',
  'list.created': (item) => `added list ${list(item)}`,
  'list.renamed': (item) => `renamed a list to ${list(item)}`,
  'list.moved': (item) => `reordered list ${list(item)}`,
  'list.deleted': (item) => `deleted list ${list(item)}`,
  'card.created': (item) => `added ${card(item)} to ${list(item)}`,
  'card.updated': cardUpdated,
  'card.moved': (item) => `moved ${card(item)} to ${list(item)}`,
  'card.archived': (item) => `archived ${card(item)}`,
  'card.restored': (item) => `restored ${card(item)}`,
  'card.deleted': (item) => `deleted ${card(item)}`,
  'comment.created': (item) => `commented on ${card(item)}`,
  'member.invited': () => 'invited someone to the board',
  'member.invite_revoked': () => 'cancelled an invite',
  'member.joined': () => 'joined the board',
  'member.role_changed': () => "changed a member's role",
  'member.removed': () => 'removed a member',
};

/** "moved "Login page" to "Done"". The actor's name is rendered separately. */
export function describeActivity(item: ActivityItem): string {
  return SENTENCES[item.type](item);
}
