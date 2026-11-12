import type { LoginInput, RegisterInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { getAuthUserId } from '../../middleware/require-auth.js';
import type { WithBody } from '../../middleware/validate.js';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import * as authService from './service.js';

/** POST /auth/register: creates an account and sets the login cookies. */
export const register: WithBody<RegisterInput> = async (req, res) => {
  const { user, tokens } = await authService.register(req.body);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(201).json({ user });
};

/** POST /auth/login: signs in and sets the login cookies. */
export const login: WithBody<LoginInput> = async (req, res) => {
  const { user, tokens } = await authService.login(req.body);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.json({ user });
};

/**
 * POST /auth/refresh: rotates the refresh token and sets new cookies. A missing, expired or reused
 * token gets a 401.
 */
export const refresh: RequestHandler = async (req, res) => {
  const tokens = await authService.refresh(readCookie(req, REFRESH_COOKIE));
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(204).end();
};

/** POST /auth/logout: ends the session and clears the cookies. */
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearAuthCookies(res);
  res.status(204).end();
};

/** GET /auth/me (signed in): the current user. */
export const me: RequestHandler = async (req, res) => {
  const user = await authService.getCurrentUser(getAuthUserId(req));
  res.json({ user });
};
