import { createClient } from "@libsql/client/web";
import { createTableSql } from "./schema.js";

export async function database(env = {}) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN)
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  try {
    await migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function withDatabase(env, callback) {
  const db = await database(env);
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

// Idempotent initialization for API requests, email delivery and scheduled cleanup.
export const migrations = [
  `CREATE TABLE IF NOT EXISTS tmail_domains (
    domain TEXT PRIMARY KEY NOT NULL COLLATE NOCASE
      CHECK (domain = lower(domain) COLLATE BINARY),
    delivery TEXT NOT NULL CHECK (delivery IN ('cloudflare', 'webhook')),
    key_digest TEXT UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    CHECK (
      (delivery = 'cloudflare' AND key_digest IS NULL) OR
      (delivery = 'webhook' AND key_digest IS NOT NULL
        AND length(key_digest) = 43 AND key_digest NOT GLOB '*[^A-Za-z0-9_-]*')
    )
  )`,
  createTableSql("private"),
  createTableSql("public"),
  `CREATE INDEX IF NOT EXISTS tmail_public_recipient_date ON "public" (envelope_to, received_at DESC, id DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tmail_public_message_identity ON "public" (envelope_to, envelope_from, message_id)
    WHERE message_id IS NOT NULL AND message_id <> ''`,
  `CREATE TABLE IF NOT EXISTS tmail_inboxes (
    id TEXT PRIMARY KEY, address TEXT UNIQUE NOT NULL, owner TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    first_email_id TEXT UNIQUE
  )`,
  `CREATE INDEX IF NOT EXISTS tmail_inboxes_expiry ON tmail_inboxes (expires_at)`,
  `CREATE TABLE IF NOT EXISTS tmail_limits (
    key TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY (key, window)
  )`,
];

export async function migrate(db) {
  await db.batch(migrations, "write");
}

export async function consumeLimit(db, key, seconds, max) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const result = await db.execute({
    sql: `INSERT INTO tmail_limits (key, window, count) VALUES (?, ?, 1)
      ON CONFLICT (key, window) DO UPDATE SET count = count + 1
      WHERE count < ? RETURNING count`,
    args: [key, window, max],
  });
  return result.rows.length > 0;
}
