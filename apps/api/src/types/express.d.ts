import type { Role } from '@taskboard/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth from the verified access token. */
      userId?: string;
      /** Set by requireBoardRole: the board the route's ids resolve to. */
      boardId?: string;
      /** Set by requireBoardRole: the signed-in user's role on that board. */
      boardRole?: Role;
    }
  }
}

export {};
