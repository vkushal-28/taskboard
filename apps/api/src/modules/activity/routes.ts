import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

// Not board-scoped, so no requireBoardRole: the service only reads boards the user belongs to.
export function createActivityRouter(): Router {
  const router = Router();

  router.get('/recent', requireAuth, controller.listRecentActivity);

  return router;
}
