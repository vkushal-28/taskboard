import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCommentSchema,
  type ActivityType,
  type CardDto,
  type CommentDto,
} from '@taskboard/shared';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Avatar } from '../../components/Avatar';
import { describeError } from '../../lib/api-error';
import { formatRelative, useNow } from '../../lib/time';
import { useCardActivity } from '../activity/api';
import { useAddComment, useComments } from './comments-api';

type Tab = 'comments' | 'history';

interface CardActivityProps {
  card: CardDto;
  canEdit: boolean;
}

export function CardActivity({ card, canEdit }: CardActivityProps) {
  const [tab, setTab] = useState<Tab>('comments');

  return (
    <section aria-labelledby={`activity-${card.id}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`activity-${card.id}`} className="text-sm font-semibold text-slate-700">
          Activity
        </h3>
        {/* Toggle buttons, not ARIA tabs: tabs promise arrow-key navigation as well. */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <TabButton current={tab} value="comments" onSelect={setTab}>
            Comments{card.commentCount > 0 && ` (${card.commentCount})`}
          </TabButton>
          <TabButton current={tab} value="history" onSelect={setTab}>
            History
          </TabButton>
        </div>
      </div>
      <div className="mt-3">
        {tab === 'comments' ? (
          <Comments card={card} canEdit={canEdit} />
        ) : (
          <History cardId={card.id} />
        )}
      </div>
    </section>
  );
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (tab: Tab) => void;
  children: ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={`rounded-md px-2.5 py-1 ${selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

function Comments({ card, canEdit }: CardActivityProps) {
  const comments = useComments(card.id);
  const now = useNow();
  const items = comments.data?.pages.flatMap((page) => page.comments) ?? [];

  return (
    <div className="space-y-4">
      {canEdit && <CommentForm card={card} />}
      {comments.isPending && <p className="text-sm text-slate-500">Loading comments…</p>}
      {comments.isError && <p className="text-sm text-red-600">Could not load comments.</p>}
      {comments.isSuccess && items.length === 0 && (
        <p className="text-sm text-slate-500">No comments yet.</p>
      )}
      {items.length > 0 && (
        <ol className="space-y-4" aria-label="Comments">
          {items.map((comment) => (
            <CommentItem key={comment.id} comment={comment} now={now} />
          ))}
        </ol>
      )}
      {comments.hasNextPage && (
        <LoadOlder
          label="Load older comments"
          loading={comments.isFetchingNextPage}
          onLoad={() => void comments.fetchNextPage()}
        />
      )}
    </div>
  );
}

function CommentItem({ comment, now }: { comment: CommentDto; now: number }) {
  return (
    <li className="flex gap-3" data-testid={`comment-${comment.id}`}>
      <ActorAvatar actor={comment.author} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-slate-900">{comment.author?.name ?? 'Someone'}</span>{' '}
          <time dateTime={comment.createdAt} className="text-xs text-slate-500">
            {formatRelative(comment.createdAt, now)}
          </time>
        </p>
        <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm break-words whitespace-pre-wrap text-slate-800">
          {comment.body}
        </p>
      </div>
    </li>
  );
}

function CommentForm({ card }: { card: CardDto }) {
  const addComment = useAddComment(card.boardId, card.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createCommentSchema), defaultValues: { body: '' } });

  const submit = handleSubmit(async ({ body }) => {
    setServerError(null);
    try {
      await addComment.mutateAsync(body);
      reset();
    } catch (error) {
      // The draft stays in the box, so nothing typed is lost.
      setServerError(describeError(error));
    }
  });

  const error = errors.body?.message ?? serverError;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-2">
      <textarea
        aria-label="Write a comment"
        placeholder="Write a comment…"
        rows={2}
        aria-invalid={error ? true : undefined}
        // Escape belongs to the dialog; Ctrl/Cmd+Enter sends, plain Enter is a new line.
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        {...register('body')}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {isSubmitting ? 'Saving…' : 'Comment'}
      </button>
    </form>
  );
}

// Board-level types (lists, the board itself) never carry this card's id.
const HISTORY_SENTENCES: Partial<Record<ActivityType, string>> = {
  'card.created': 'created this card',
  'card.updated': 'updated this card',
  'card.archived': 'archived this card',
  'card.restored': 'restored this card',
  'comment.created': 'commented',
};

function History({ cardId }: { cardId: string }) {
  const history = useCardActivity(cardId);
  const now = useNow();
  const items = history.data?.pages.flatMap((page) => page.activity) ?? [];

  return (
    <div className="space-y-4">
      {history.isPending && <p className="text-sm text-slate-500">Loading history…</p>}
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
                {item.type === 'card.moved'
                  ? `moved this card to ${item.list ? `"${item.list.title}"` : 'another list'}`
                  : (HISTORY_SENTENCES[item.type] ?? 'changed this card')}{' '}
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

function ActorAvatar({ actor }: { actor: { id: string; name: string } | null }) {
  return actor ? (
    <Avatar id={actor.id} name={actor.name} size="sm" />
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full bg-slate-200" />
  );
}

function LoadOlder({
  label,
  loading,
  onLoad,
}: {
  label: string;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLoad}
      disabled={loading}
      className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-60"
    >
      {loading ? 'Loading…' : label}
    </button>
  );
}
