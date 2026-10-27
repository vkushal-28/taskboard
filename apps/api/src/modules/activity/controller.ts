import { recentActivityQuerySchema } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { parseQuery } from '../../middleware/validate.js';
import * as activityService from './service.js';

export const listRecentActivity: RequestHandler = async (req, res) => {
  const { limit } = parseQuery(recentActivityQuerySchema, req.query);
  const activity = await activityService.listRecentActivity(getAuthUserId(req), limit);
  res.json({ activity });
};
