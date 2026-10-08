import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  quipOrigin: text('quip_origin').notNull(),
  quipUserId: text('quip_user_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  unique().on(table.quipOrigin, table.quipUserId),
  index('users_email').on(table.email),
]);

export const credentials = sqliteTable('credentials', {
  userId: text('user_id').primaryKey().notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedPat: text('encrypted_pat').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey().notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [
  index('sessions_user').on(table.userId),
  index('sessions_expiry').on(table.expiresAt),
]);

// Only the latest tiny profile capture is retained; account deletion cascades to it.
export const captureResults = sqliteTable('capture_results', {
  userId: text('user_id').primaryKey().notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull(),
  quipUserId: text('quip_user_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  capturedAt: integer('captured_at').notNull(),
});

// Job rows survive later captures; only account deletion removes their history.
export const captureJobs = sqliteTable('capture_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().unique(),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] }).notNull(),
  attempts: integer('attempts').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  dispatchedAt: integer('dispatched_at'),
  lease: text('lease'),
  leaseUntil: integer('lease_until'),
  error: text('error'),
}, (table) => [
  index('capture_jobs_user').on(table.userId, table.id),
  index('capture_jobs_dispatch').on(table.dispatchedAt),
  uniqueIndex('capture_jobs_active_user').on(table.userId).where(sql`${table.status} IN ('queued', 'running')`),
]);

export const captureJobProgress = sqliteTable('capture_job_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull().references(() => captureJobs.jobId, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  message: text('message').notNull(),
}, (table) => [index('capture_job_progress_latest').on(table.jobId, table.id)]);
