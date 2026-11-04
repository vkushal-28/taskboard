import type { CommentDto, CommentPage } from '@taskboard/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { addCommentToPages } from './comments-api';

const comment = (id: string): CommentDto => ({
  id,
  boardId: 'b1',
  cardId: 'c1',
  author: null,
  body: id,
  createdAt: '2026-11-03T10:00:00.000Z',
});

const pages = (...ids: string[][]): InfiniteData<CommentPage, string | undefined> => ({
  pages: ids.map((page, index) => ({
    comments: page.map(comment),
    nextCursor: index < ids.length - 1 ? (page.at(-1) ?? null) : null,
  })),
  pageParams: ids.map((_, index) => (index === 0 ? undefined : ids[index - 1]?.at(-1))),
});

const idsOf = (data: InfiniteData<CommentPage, string | undefined> | undefined) =>
  data?.pages.map((page) => page.comments.map((item) => item.id));

describe('addCommentToPages', () => {
  it('puts the new comment at the top of the first page and keeps the cursors', () => {
    const before = pages(['m3', 'm2'], ['m1']);

    const after = addCommentToPages(before, comment('m4'));

    expect(idsOf(after)).toEqual([['m4', 'm3', 'm2'], ['m1']]);
    expect(after?.pages.map((page) => page.nextCursor)).toEqual(['m2', null]);
  });

  it('ignores a comment it already has, on any page', () => {
    const before = pages(['m3', 'm2'], ['m1']);

    expect(addCommentToPages(before, comment('m1'))).toBe(before);
  });

  it('leaves comments that were never loaded alone', () => {
    expect(addCommentToPages(undefined, comment('m1'))).toBeUndefined();
  });
});
