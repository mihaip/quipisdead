import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { WorkerEnv } from '../env';
import { hashSessionToken } from './crypto';

export const SESSION_COOKIE = '__Host-quip_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

export async function sessionHash(c: Context<WorkerEnv>): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashSessionToken(token) : null;
}

export function setSession(c: Context<WorkerEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
}

export function clearSession(c: Context<WorkerEnv>) {
  setCookie(c, SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}
