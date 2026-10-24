import { hasRole, type Role } from '@taskboard/shared';
import type { Request, RequestHandler } from 'express';
import { Forbidden, NotFound } from '../lib/errors.js';
import {
  findBoardIdForCard,
  findBoardIdForList,
  findMemberRole,
} from '../modules/boards/access.js';
import { getAuthUserId } from './require-auth.js';

/**
 * Allows the request only if the signed-in user has at least `minRole` on the board named by
 * `:boardId`, `:listId` or `:cardId`. Non-members get 404 so board ids do not leak (ADR 005).
 * Must run after `requireAuth`.
 */
export function requireBoardRole(minRole: Role): RequestHandler {
  return async (req, _res, next) => {
    const userId = getAuthUserId(req);
    const boardId = await resolveBoardId(req.params);
    const role = boardId ? await findMemberRole(boardId, userId) : null;
    if (!boardId || !role) throw new NotFound('Board not found');
    if (!hasRole(role, minRole)) throw new Forbidden();

    req.boardId = boardId;
    req.boardRole = role;
    next();
  };
}

/** Returns the board every id in the params points to, or null if any is unknown or they disagree. */
async function resolveBoardId(params: Request['params']): Promise<string | null> {
  const boardId = stringParam(params.boardId);
  const listId = stringParam(params.listId);
  const cardId = stringParam(params.cardId);

  const lookups: Promise<string | null>[] = [];
  if (boardId !== undefined) lookups.push(Promise.resolve(boardId));
  if (listId !== undefined) lookups.push(findBoardIdForList(listId));
  if (cardId !== undefined) lookups.push(findBoardIdForCard(cardId));
  if (lookups.length === 0) {
    throw new Error('requireBoardRole needs a :boardId, :listId or :cardId route param');
  }

  // A member of board A must not reach board B's card through /boards/A/cards/<B's card>.
  const [first, ...rest] = await Promise.all(lookups);
  return first && rest.every((id) => id === first) ? first : null;
}

// Express 5 types params as string | string[] because wildcard params are arrays.
function stringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
