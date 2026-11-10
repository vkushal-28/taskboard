import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { DUE_STATUS_TEXT, dueStatus } from '../../lib/due-date';

const dueFormatter = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' });

/**
 * What a sighted user reads on a card tile besides its title, as one sentence list for
 * screen readers (the tile's accessible name is only the title).
 */
export function describeCard(card: CardDto, assignees: BoardMemberDto[], now: number): string {
  const parts: string[] = [];

  if (card.labels.length > 0) {
    parts.push(`Labels: ${card.labels.map((label) => label.name).join(', ')}`);
  }
  if (card.dueDate) {
    const date = dueFormatter.format(Date.parse(card.dueDate));
    const status = DUE_STATUS_TEXT[dueStatus(card.dueDate, now)];
    parts.push(status ? `${status}, ${date}` : `Due ${date}`);
  }
  if (card.checklist.length > 0) {
    const done = card.checklist.filter((item) => item.done).length;
    parts.push(`Checklist ${done} of ${card.checklist.length} done`);
  }
  if (card.commentCount > 0) {
    parts.push(`${card.commentCount} ${card.commentCount === 1 ? 'comment' : 'comments'}`);
  }
  if (assignees.length > 0) {
    parts.push(`Assigned to ${assignees.map((member) => member.name).join(', ')}`);
  }

  return parts.length > 0 ? `${parts.join('. ')}.` : '';
}
