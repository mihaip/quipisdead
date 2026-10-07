import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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
