import { and, eq, exists, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { credentials, sessions, users } from '../db/schema';
import type { Bindings } from '../env';
import type { QuipIdentity } from '../quip/client';

type Database = Bindings['DB'];

// Explicit projection shared by reads and writes; credentials never enter profiles.
const profileColumns = {
  id: users.id,
  quipOrigin: users.quipOrigin,
  quipUserId: users.quipUserId,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
  credentialUpdatedAt: credentials.updatedAt,
};

export async function findSession(binding: Database, hash: string, now = Date.now()) {
  // Wrap the binding directly: D1 still uses primary reads without its Sessions API.
  const db = drizzle(binding);
  const profile = await db.select(profileColumns).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .get();
  return profile ?? null;
}

export async function signIn(
  binding: Database, identity: QuipIdentity, encryptedPat: string,
  sessionHash: string, expiresAt: number, previousHash: string | null,
) {
  const db = drizzle(binding);
  const now = Date.now();
  const sameIdentity = and(eq(users.quipOrigin, identity.origin), eq(users.quipUserId, identity.userId));
  const results = await db.batch([
    db.insert(users).values({
      id: crypto.randomUUID(), quipOrigin: identity.origin, quipUserId: identity.userId,
      name: identity.name, email: identity.email, createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [users.quipOrigin, users.quipUserId],
      set: { name: identity.name, email: identity.email, updatedAt: now },
    }),
    // Resolve the owning internal ID in SQL, including a simultaneous first sign-in.
    db.insert(credentials).select(db.select({
      userId: users.id, encryptedPat: sql`${encryptedPat}`.as('encrypted_pat'), updatedAt: sql`${now}`.as('updated_at'),
    }).from(users).where(sameIdentity)).onConflictDoUpdate({
      target: credentials.userId,
      set: { encryptedPat, updatedAt: now },
    }),
    db.delete(sessions).where(or(
      previousHash ? eq(sessions.tokenHash, previousHash) : undefined,
      lte(sessions.expiresAt, now),
    )),
    db.insert(sessions).select(db.select({
      tokenHash: sql`${sessionHash}`.as('token_hash'), userId: users.id, expiresAt: sql`${expiresAt}`.as('expires_at'),
    }).from(users).where(sameIdentity)),
    db.select(profileColumns).from(users)
      .innerJoin(credentials, eq(credentials.userId, users.id)).where(sameIdentity),
  ]);
  const profile = results[4][0];
  if (!profile) throw new Error('Account creation failed');
  return profile;
}

export async function replaceCredential(
  binding: Database, userId: string, sessionHash: string, identity: QuipIdentity, encryptedPat: string,
) {
  const db = drizzle(binding);
  const now = Date.now();
  // Recheck the session inside each write after the external Quip request. A concurrent
  // sign-out/delete cannot let an already-started replacement recreate credentials.
  const activeSession = exists(db.select({ tokenHash: sessions.tokenHash }).from(sessions).where(and(
    eq(sessions.tokenHash, sessionHash), eq(sessions.userId, userId), gt(sessions.expiresAt, now),
  )));
  await db.batch([
    db.update(credentials).set({ encryptedPat, updatedAt: now })
      .where(and(eq(credentials.userId, userId), activeSession)),
    db.update(users).set({ name: identity.name, email: identity.email, updatedAt: now })
      .where(and(eq(users.id, userId), activeSession)),
  ]);
  return findSession(binding, sessionHash);
}

export async function revokeSession(binding: Database, hash: string) {
  await drizzle(binding).delete(sessions).where(eq(sessions.tokenHash, hash)).run();
}

export async function deleteAccount(binding: Database, hash: string) {
  const db = drizzle(binding);
  // One statement plus foreign-key cascades is atomic, including every owned session.
  const result = await db.delete(users).where(inArray(users.id,
    db.select({ userId: sessions.userId }).from(sessions)
      .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, Date.now()))),
  )).run();
  return result.meta.changes > 0;
}
