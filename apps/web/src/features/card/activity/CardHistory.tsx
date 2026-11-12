import type { ActivityItem, ActivityType } from '@taskboard/shared';
import { FeedSkeleton } from '../../../components/FeedSkeleton';
import { formatRelative, useNow } from '../../../lib/time';
import { useCardActivity } from '../../activity/api';
import { describeCardFields } from '../../activity/describe';
import { ActorAvatar, LoadOlder } from './feed-parts';

// Board-level types (lists, the board itself) never carry this card's id.
const HISTORY_SENTENCES: Partial<Record<ActivityType, string>> = {
  'card.created': 'created this card',
  'card.archived': 'archived this card',
  'card.restored': 'restored this card',
  'comment.created': 'commented',
};

function historySentence(item: ActivityItem): string {
  if (item.type === 'card.moved') {
    return `moved this card to ${item.list ? `"${item.list.title}"` : 'another list'}`;
  }
  if (item.type === 'card.updated')
    return `updated ${describeCardFields(item.fields) ?? 'this card'}`;
  return HISTORY_SENTENCES[item.type] ?? 'changed this card';
}

export function CardHistory({ cardId }: { cardId: string }) {
  const history = useCardActivity(cardId);
  const now = useNow();
  const items = history.data?.pages.flatMap((page) => page.activity) ?? [];

  return (
    <div className="space-y-4">
      {history.isPending && <FeedSkeleton label="Loading history" />}
      {history.isError && <p className="text-sm text-red-600">Could not load history.</p>}
      {history.isSuccess && items.length === 0 && (
        <p className="text-sm text-slate-500">No history yet.</p>
      )}
      {items.length > 0 && (
        <ol className="space-y-3" aria-label="History">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 text-sm">
              <ActorAvatar actor={item.actor} />
              <p className="min-w-0 text-slate-700">
                <span className="font-medium text-slate-900">{item.actor?.name ?? 'Someone'}</span>{' '}
                {historySentence(item)}{' '}
                <time dateTime={item.createdAt} className="text-xs text-slate-500">
                  {formatRelative(item.createdAt, now)}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
      {history.hasNextPage && (
        <LoadOlder
          label="Load older history"
          loading={history.isFetchingNextPage}
          onLoad={() => void history.fetchNextPage()}
        />
      )}
    </div>
  );
}
