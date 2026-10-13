import type { Request, Response } from 'express';
import { config } from '../config';

const COOKIE_NAME = 'bowling_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export type AuthedRequest = Request & { user?: SessionUser };

interface SessionPayload {
  uid: number;
  /** Muss zu User.sessionVersion passen, sonst ist die Session ungültig (z. B. nach Passwort-Reset) */
  v: number;
  exp: number;
}

export function readSession(req: Request): SessionPayload | null {
  const raw: unknown = req.signedCookies?.[COOKIE_NAME];
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const s = JSON.parse(raw) as Partial<SessionPayload>;
    if (typeof s.uid === 'number' && typeof s.v === 'number' && typeof s.exp === 'number' && s.exp > Date.now()) {
      return s as SessionPayload;
    }
  } catch {
    // ungültiges Cookie → nicht eingeloggt
  }
  return null;
}

export function writeSession(res: Response, userId: number, sessionVersion: number) {
  const value = JSON.stringify({ uid: userId, v: sessionVersion, exp: Date.now() + MAX_AGE_MS } satisfies SessionPayload);
  res.cookie(COOKIE_NAME, value, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
