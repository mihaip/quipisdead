import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { WorkerEnv } from '../env';
import { QuipError, validatePat } from '../quip/client';
import { credentialContext, encryptPat, newSessionToken, hashSessionToken } from './crypto';
import { clearSession, sessionHash, setSession, SESSION_SECONDS } from './session';
import { deleteAccount, findSession, replaceCredential, revokeSession, signIn } from './store';

const patSchema = z.object({ pat: z.string().trim().min(1).max(4096).regex(/^[\x21-\x7E]+$/) });
const patInput = validator('json', (value: unknown, c) => {
  const result = patSchema.safeParse(value);
  if (!result.success) return c.json({ error: 'Enter a valid personal access token.' }, 400);
  return result.data;
});

export const authRoutes = new Hono<WorkerEnv>()
  .use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (c.req.header('Origin') !== new URL(c.req.url).origin || c.req.header('Sec-Fetch-Site') === 'cross-site') {
        return c.json({ error: 'This request must come from this app.' }, 403);
      }
    }
    await next();
  })
  .use('*', bodyLimit({ maxSize: 8192, onError: (c) => c.json({ error: 'Request is too large.' }, 413) }))
  .get('/session', async (c) => {
    const hash = await sessionHash(c);
    const user = hash ? await findSession(c.env.DB, hash) : null;
    // A stale read must not clear a cookie issued by a concurrent sign-in.
    return c.json({ user }, 200);
  })
  .post('/sign-in', patInput, async (c) => {
    const previousHash = await sessionHash(c);
    if (previousHash && await findSession(c.env.DB, previousHash)) {
      return c.json({ error: 'You are already signed in. Replace your token below, or sign out first.' }, 409);
    }
    try {
      const identity = await validatePat(c.req.valid('json').pat);
      const encryptedPat = await encryptPat(c.req.valid('json').pat, c.env.CREDENTIAL_ENCRYPTION_KEY,
        credentialContext(identity.origin, identity.userId));
      const token = newSessionToken();
      const user = await signIn(c.env.DB, identity, encryptedPat, await hashSessionToken(token),
        Date.now() + SESSION_SECONDS * 1000, previousHash);
      setSession(c, token);
      return c.json({ user }, 200);
    } catch (error) {
      if (error instanceof QuipError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  })
  .put('/credential', patInput, async (c) => {
    const hash = await sessionHash(c);
    const current = hash ? await findSession(c.env.DB, hash) : null;
    if (!hash || !current) {
      clearSession(c);
      return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
    }
    try {
      const identity = await validatePat(c.req.valid('json').pat);
      if (identity.origin !== current.quipOrigin || identity.userId !== current.quipUserId) {
        return c.json({ error: 'This token belongs to a different Quip account. Use a token for the account shown here.' }, 409);
      }
      const encryptedPat = await encryptPat(c.req.valid('json').pat, c.env.CREDENTIAL_ENCRYPTION_KEY,
        credentialContext(identity.origin, identity.userId));
      const user = await replaceCredential(c.env.DB, current.id, hash, identity, encryptedPat);
      if (!user) {
        clearSession(c);
        return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
      }
      return c.json({ user }, 200);
    } catch (error) {
      if (error instanceof QuipError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  })
  .post('/sign-out', async (c) => {
    const hash = await sessionHash(c);
    if (hash) await revokeSession(c.env.DB, hash);
    clearSession(c);
    return c.json({ user: null }, 200);
  })
  .delete('/account', async (c) => {
    const hash = await sessionHash(c);
    const deleted = hash ? await deleteAccount(c.env.DB, hash) : false;
    clearSession(c);
    if (!deleted) return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
    return c.json({ user: null }, 200);
  });
