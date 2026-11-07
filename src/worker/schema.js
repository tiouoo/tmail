export function createTableSql(table) {
  if (!["private", "public"].includes(table))
    throw new Error("Invalid mail table");
  return `CREATE TABLE IF NOT EXISTS "${table}" (
    id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL,
    envelope_from TEXT NOT NULL,
    envelope_to TEXT NOT NULL,
    message_id TEXT,
    subject TEXT,
    text_body TEXT,
    html_body TEXT,
    headers_json TEXT NOT NULL,
    raw BLOB NOT NULL
  )`;
}

