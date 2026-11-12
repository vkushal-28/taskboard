import { zodResolver } from '@hookform/resolvers/zod';
import { createCommentSchema, type CardDto, type CommentDto } from '@taskboard/shared';
import { useForm } from 'react-hook-form';
import { FeedSkeleton } from '../../../components/FeedSkeleton';
import { describeError } from '../../../lib/api-error';
import { formatRelative, useNow } from '../../../lib/time';
import { useAddComment, useComments } from '../comments-api';
import { ActorAvatar, LoadOlder } from './feed-parts';

export function CardComments({ card, canEdit }: { card: CardDto; canEdit: boolean }) {
  const comments = useComments(card.id);
  const now = useNow();
  const items = comments.data?.pages.flatMap((page) => page.comments) ?? [];

  return (
    <div className="space-y-4">
      {canEdit && <CommentForm card={card} />}
      {comments.isPending && <FeedSkeleton label="Loading comments" rows={2} />}
      {comments.isError && <p className="text-sm text-red-600">Could not load comments.</p>}
      {comments.isSuccess && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center">
          <p className="text-sm font-medium text-slate-700">No comments yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            {canEdit
              ? 'Start the conversation: ask a question or share an update.'
              : 'Comments from the team will show up here.'}
          </p>
        </div>
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
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createCommentSchema), defaultValues: { body: '' } });

  const submit = handleSubmit(async ({ body }) => {
    try {
      await addComment.mutateAsync(body);
      reset();
    } catch (error) {
      // The draft stays in the box, so nothing typed is lost.
      setError('root.server', { message: describeError(error) });
    }
  });

  const error = errors.body?.message ?? errors.root?.server?.message;

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
