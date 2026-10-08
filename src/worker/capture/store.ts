import { and, desc, eq, exists, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { captureJobProgress, captureJobs, captureResults, credentials, sessions, users } from '../db/schema';
import type { Bindings, CaptureBindings } from '../env';
import type { QuipIdentity } from '../quip/client';
import { LEASE_MS } from './model';
import type { CaptureMessage } from './model';

type Database = CaptureBindings['DB'];

export async function captureCredential(binding: Database, userId: string) {
  return drizzle(binding).select({
    quipOrigin: users.quipOrigin, quipUserId: users.quipUserId, encryptedPat: credentials.encryptedPat,
  }).from(users).innerJoin(credentials, eq(users.id, credentials.userId)).where(eq(users.id, userId)).get();
}

export async function readLatestCaptureJob(binding: Database, userId: string) {
  return await drizzle(binding).select().from(captureJobs).where(eq(captureJobs.userId, userId)).orderBy(desc(captureJobs.id)).limit(1).get() ?? null;
}

export async function readCaptureJob(binding: Database, message: CaptureMessage) {
  return await drizzle(binding).select().from(captureJobs).where(matches(message)).get() ?? null;
}

export async function readCaptureProgress(binding: Database, jobId: string) {
  return await drizzle(binding).select().from(captureJobProgress).where(eq(captureJobProgress.jobId, jobId))
    .orderBy(desc(captureJobProgress.id)).limit(1).get() ?? null;
}

export async function readCaptureResult(binding: Database, userId: string) {
  return await drizzle(binding).select({
    jobId: captureResults.jobId, quipUserId: captureResults.quipUserId,
    name: captureResults.name, email: captureResults.email, capturedAt: captureResults.capturedAt,
  }).from(captureResults).where(eq(captureResults.userId, userId)).get() ?? null;
}

export async function startCapture(binding: Database, userId: string, hash: string) {
  const db = drizzle(binding);
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const authorized = and(eq(sessions.userId, userId), eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now));
  // Recheck the session inside the write; simultaneous starts reuse the active row.
  const [, , rows] = await db.batch([
    db.insert(captureJobs).select(db.select({
      id: sql`NULL`.as('id'), userId: sessions.userId, jobId: sql`${jobId}`.as('job_id'), status: sql`'queued'`.as('status'),
      attempts: sql`0`.as('attempts'), createdAt: sql`${now}`.as('created_at'), updatedAt: sql`${now}`.as('updated_at'),
      dispatchedAt: sql`NULL`.as('dispatched_at'), lease: sql`NULL`.as('lease'),
      leaseUntil: sql`NULL`.as('lease_until'), error: sql`NULL`.as('error'),
    }).from(sessions).where(authorized)).onConflictDoNothing(),
    progressInsert(db, 'Capture queued.', and(eq(captureJobs.userId, userId), eq(captureJobs.jobId, jobId)), now),
    db.select({ job: captureJobs }).from(captureJobs).innerJoin(sessions, eq(captureJobs.userId, sessions.userId))
      .where(authorized).orderBy(desc(captureJobs.id)).limit(1),
  ]);
  return rows[0]?.job ?? null;
}

export async function dispatchCapture(env: Bindings, message: CaptureMessage) {
  const db = drizzle(env.DB);
  try {
    await env.CAPTURE_QUEUE.send(message);
    await db.update(captureJobs).set({ dispatchedAt: Date.now() })
      .where(and(matches(message), isNull(captureJobs.dispatchedAt)));
  } catch {
    // Leave the durable intent pending for the scheduled sender. Duplicate sends are safe.
    await db.update(captureJobs).set({ error: 'Could not queue the capture. Retrying automatically.', updatedAt: Date.now() })
      .where(and(matches(message), eq(captureJobs.status, 'queued'), isNull(captureJobs.dispatchedAt)));
  }
}

export async function dispatchPendingCaptures(env: Bindings) {
  const pending = await drizzle(env.DB).select({ userId: captureJobs.userId, jobId: captureJobs.jobId }).from(captureJobs)
    .where(and(eq(captureJobs.status, 'queued'), isNull(captureJobs.dispatchedAt))).limit(100);
  for (const message of pending) await dispatchCapture(env, message);
}

function matches(message: CaptureMessage) {
  return and(eq(captureJobs.userId, message.userId), eq(captureJobs.jobId, message.jobId));
}

function ownsAttempt(message: CaptureMessage, lease: string, now: number) {
  return and(matches(message), eq(captureJobs.status, 'running'), eq(captureJobs.lease, lease), gt(captureJobs.leaseUntil, now));
}

// INSERT SELECT guards the append itself; progress never reads or rewrites the job object.
function progressInsert(db: ReturnType<typeof drizzle>, message: string, condition: SQL | undefined, createdAt: number) {
  return db.insert(captureJobProgress).select(db.select({
    id: sql`NULL`.as('id'), jobId: captureJobs.jobId,
    createdAt: sql`${createdAt}`.as('created_at'), message: sql`${message}`.as('message'),
  }).from(captureJobs).where(condition));
}

export async function appendCaptureProgress(binding: Database, message: CaptureMessage, lease: string, text: string) {
  const now = Date.now();
  const rows = await progressInsert(drizzle(binding), text, ownsAttempt(message, lease, now), now)
    .returning({ id: captureJobProgress.id });
  return rows.length > 0;
}

export async function claimCapture(binding: Database, message: CaptureMessage) {
  const now = Date.now();
  const lease = crypto.randomUUID();
  const db = drizzle(binding);
  const [rows] = await db.batch([db.update(captureJobs).set({ status: 'running', lease, leaseUntil: now + LEASE_MS,
    attempts: sql`${captureJobs.attempts} + 1`, updatedAt: now, error: null })
    .where(and(matches(message), or(eq(captureJobs.status, 'queued'),
      and(eq(captureJobs.status, 'running'), lte(captureJobs.leaseUntil, now)))))
    .returning({ lease: captureJobs.lease }),
    progressInsert(db, 'Preparing profile capture…', ownsAttempt(message, lease, now), now),
  ]);
  return rows[0]?.lease ?? null;
}

export async function completeCapture(binding: Database, message: CaptureMessage, lease: string, identity: QuipIdentity) {
  const db = drizzle(binding);
  const capturedAt = Date.now();
  // Result and status commit in one D1 transaction. Deleted accounts and stale attempts select no row.
  const completion = and(ownsAttempt(message, lease, capturedAt), exists(db.select({ id: captureResults.jobId }).from(captureResults)
    .where(and(eq(captureResults.userId, message.userId), eq(captureResults.jobId, message.jobId)))));
  const [, , completed] = await db.batch([
    db.insert(captureResults).select(db.select({
      userId: users.id, jobId: captureJobs.jobId, quipUserId: users.quipUserId,
      name: sql`${identity.name}`.as('name'), email: sql`${identity.email}`.as('email'), capturedAt: sql`${capturedAt}`.as('captured_at'),
    }).from(users).innerJoin(captureJobs, eq(users.id, captureJobs.userId))
      .where(and(ownsAttempt(message, lease, capturedAt), eq(users.quipOrigin, identity.origin), eq(users.quipUserId, identity.userId))))
      .onConflictDoUpdate({ target: captureResults.userId,
        set: { jobId: message.jobId, quipUserId: identity.userId, name: identity.name, email: identity.email, capturedAt } }),
    progressInsert(db, 'Profile capture completed.', completion, capturedAt),
    db.update(captureJobs).set({ status: 'completed', lease: null, leaseUntil: null, updatedAt: capturedAt, error: null })
      .where(completion).returning({ jobId: captureJobs.jobId }),
  ]);
  return completed.length > 0;
}

export async function failCapture(binding: Database, message: CaptureMessage, lease: string, error: string, retryable: boolean) {
  const db = drizzle(binding);
  const now = Date.now();
  const condition = ownsAttempt(message, lease, now);
  const [, failed] = await db.batch([
    progressInsert(db, retryable ? `${error} Retrying automatically.` : error, condition, now),
    db.update(captureJobs).set({ status: retryable ? 'queued' : 'failed', lease: null, leaseUntil: null,
      updatedAt: now, error }).where(condition).returning({ jobId: captureJobs.jobId }),
  ]);
  return failed.length > 0;
}

export async function exhaustCapture(binding: Database, message: CaptureMessage) {
  const db = drizzle(binding);
  const now = Date.now();
  const error = 'Capture could not finish after several delivery attempts. Please start again.';
  const condition = and(matches(message), or(eq(captureJobs.status, 'queued'),
    and(eq(captureJobs.status, 'running'), lt(captureJobs.leaseUntil, now))));
  await db.batch([
    progressInsert(db, error, condition, now),
    db.update(captureJobs).set({ status: 'failed', lease: null, leaseUntil: null, updatedAt: now, error }).where(condition),
  ]);
}
