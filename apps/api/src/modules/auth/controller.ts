import type { LoginInput, RegisterInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { getAuthUserId } from '../../middleware/require-auth.js';
import type { WithBody } from '../../middleware/validate.js';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import * as authService from './service.js';

export const register: WithBody<RegisterInput> = async (req, res) => {
  const { user, tokens } = await authService.register(req.body);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(201).json({ user });
};

export const login: WithBody<LoginInput> = async (req, res) => {
  const { user, tokens } = await authService.login(req.body);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.json({ user });
};

export const refresh: RequestHandler = async (req, res) => {
  const tokens = await authService.refresh(readCookie(req, REFRESH_COOKIE));
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(204).end();
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearAuthCookies(res);
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getCurrentUser(getAuthUserId(req));
  res.json({ user });
};
