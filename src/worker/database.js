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

// Idempotent initialization for API requests, email delivery and scheduled cleanup.
export const migrations = [
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
