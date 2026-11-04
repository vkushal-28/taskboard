import {
  commentPageSchema,
  createCommentResponseSchema,
  type CommentDto,
  type CommentPage,
} from '@taskboard/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '../../lib/api';
import { pagePath } from '../../lib/pagination';
import { storeCard } from './api';

export const commentKeys = {
  all: ['comments'] as const,
  card: (cardId: string) => [...commentKeys.all, cardId] as const,
};

type CommentPages = InfiniteData<CommentPage, string | undefined>;

/** A card's comments, newest first, one page at a time (ADR 014). */
export function useComments(cardId: string) {
  return useInfiniteQuery({
    queryKey: commentKeys.card(cardId),
    queryFn: ({ pageParam, signal }) =>
      api.request(pagePath(`/cards/${cardId}/comments`, pageParam), {
        schema: commentPageSchema,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/**
 * Puts a new comment at the top of the first page. Idempotent, because the same comment comes
 * back twice: in the POST response and as the socket echo (ADR 011). The cursors of loaded
 * pages stay valid, because they name ids older than the new comment.
 */
export function addCommentToPages(
  data: CommentPages | undefined,
  comment: CommentDto,
): CommentPages | undefined {
  const [first, ...rest] = data?.pages ?? [];
  if (!data || !first) return data;
  if (data.pages.some((page) => page.comments.some((item) => item.id === comment.id))) return data;
  return { ...data, pages: [{ ...first, comments: [comment, ...first.comments] }, ...rest] };
}

/** For live comments: only a card whose comments are loaded needs the new one. */
export function storeComment(queryClient: QueryClient, comment: CommentDto): void {
  queryClient.setQueryData<CommentPages>(commentKeys.card(comment.cardId), (data) =>
    addCommentToPages(data, comment),
  );
}

// Not optimistic, like the other card writes: the comment shows once the server has it.
export function useAddComment(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.request(`/cards/${cardId}/comments`, {
        method: 'POST',
        body: { body },
        schema: createCommentResponseSchema,
      }),
    onSuccess: ({ comment, card }) => {
      storeComment(queryClient, comment);
      storeCard(queryClient, boardId, card);
    },
  });
}
