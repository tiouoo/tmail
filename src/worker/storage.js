export { createTableSql } from "./schema.js";
import PostalMime from "postal-mime";
import { requireSessionSecret } from "../settings.js";
import { addressDomain } from "./domains.js";

export async function storeEmail(db, message, config, domain) {
  const { from, raw } = message;
  const to = message.to.toLowerCase();
  if (domain) requireSessionSecret(config.sessionSecret);
  const parsed = await PostalMime.parse(raw);
  const messageId = parsed.messageId?.trim() || null;
  // Keyed, recipient-bound IDs deduplicate retries without letting senders
  // derive the first-email recovery password from the MIME they submitted.
  let id = crypto.randomUUID();
  if (domain) {
    const encode = new TextEncoder();
    let input;
    if (messageId) {
      // Received/ARC headers change on every SMTP delivery; Message-ID does not.
      input = encode.encode(JSON.stringify([
        to, from.toLowerCase(), messageId,
      ]));
    } else {
      const prefix = encode.encode(to + "\u0000");
      input = new Uint8Array(prefix.length + raw.length);
      input.set(prefix);
      input.set(raw, prefix.length);
    }
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(config.sessionSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    id = btoa(String.fromCharCode(...signature.slice(0, 16)))
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  const now = Date.now();
  const columns = `(id, received_at, envelope_from, envelope_to,
    message_id, subject, text_body, html_body, headers_json, raw)`;
  const values = [
    id, new Date(now).toISOString(), from, to, messageId,
    parsed.subject ?? null, parsed.text ?? null, parsed.html ?? null,
    JSON.stringify(parsed.headers), raw,
  ];
  if (!domain) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO "private" ${columns} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: values,
    });
    return;
  }
  await db.batch([
    {
      sql: `INSERT OR IGNORE INTO "public" ${columns}
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM tmail_domains
          WHERE domain = ? AND delivery = ? AND enabled = 1
            AND (delivery = 'cloudflare' OR key_digest = ?)
        ) AND EXISTS (
          SELECT 1 FROM tmail_inboxes WHERE address = ? AND created_at <= ? AND expires_at > ?
        )`,
      args: [...values, addressDomain(to), domain.delivery, domain.key_digest, to, now, now],
    },
    {
      sql: `UPDATE tmail_inboxes SET first_email_id = (
        SELECT id FROM "public" WHERE envelope_to = tmail_inboxes.address
          AND received_at >= strftime('%Y-%m-%dT%H:%M:%fZ', created_at / 1000.0, 'unixepoch')
        ORDER BY received_at, id LIMIT 1
      ) WHERE address = ? AND first_email_id IS NULL AND expires_at > ?`,
      args: [to, now],
    },
  ], "write");
}
