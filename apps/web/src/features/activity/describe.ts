import type { ActivityItem, ActivityType } from '@taskboard/shared';

const card = (item: ActivityItem) => (item.card ? `"${item.card.title}"` : 'a card');
const list = (item: ActivityItem) => (item.list ? `"${item.list.title}"` : 'a list');

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
  'card.updated': (item) => `updated ${card(item)}`,
  'card.moved': (item) => `moved ${card(item)} to ${list(item)}`,
  'card.archived': (item) => `archived ${card(item)}`,
  'card.restored': (item) => `restored ${card(item)}`,
  'card.deleted': (item) => `deleted ${card(item)}`,
};

/** "moved "Login page" to "Done"". The actor's name is rendered separately. */
export function describeActivity(item: ActivityItem): string {
  return SENTENCES[item.type](item);
}
