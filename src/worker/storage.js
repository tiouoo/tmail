import { database } from "./database.js";
export { createTableSql } from "./schema.js";
import PostalMime from "postal-mime";
import { settings, requireSessionSecret } from "../settings.js";

export function tableForRecipient(recipient, config) {
  const address = recipient.toLowerCase();
  if (address === config.privateRecipient.toLowerCase()) return "private";
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return config.routingDomains.includes(domain) ? "public" : null;
}

export async function storeEmail(message, table, env = {}) {
  if (!["private", "public"].includes(table)) throw new Error("Invalid mail table");
  const config = settings(env);
  if (table === "public") requireSessionSecret(config.sessionSecret);
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const parsed = await PostalMime.parse(raw);
  const messageId = parsed.messageId?.trim() || null;
  // Keyed, recipient-bound IDs deduplicate retries without letting senders
  // derive the first-email recovery password from the MIME they submitted.
  let id = crypto.randomUUID();
  if (table === "public") {
    const encode = new TextEncoder();
    let input;
    if (messageId) {
      // Received/ARC headers change on every SMTP delivery; Message-ID does not.
      input = encode.encode(JSON.stringify([
        message.to.toLowerCase(), message.from.toLowerCase(), messageId,
      ]));
    } else {
      const prefix = encode.encode(message.to.toLowerCase() + "\u0000");
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
  const client = await database(env);
  try {
    await client.batch(
      [
        {
          sql: `INSERT OR IGNORE INTO "${table}" (id, received_at, envelope_from, envelope_to,
          message_id, subject, text_body, html_body, headers_json, raw)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            new Date().toISOString(),
            message.from,
            message.to.toLowerCase(),
            messageId,
            parsed.subject ?? null,
            parsed.text ?? null,
            parsed.html ?? null,
            JSON.stringify(parsed.headers),
            raw,
          ],
        },
        ...(table === "public" ? [{
          sql: `UPDATE tmail_inboxes SET first_email_id = (
            SELECT id FROM "public" WHERE envelope_to = ?
            ORDER BY received_at, id LIMIT 1
          ) WHERE address = ? AND first_email_id IS NULL AND expires_at > ?`,
          args: [message.to.toLowerCase(), message.to.toLowerCase(), Date.now()],
        }] : []),
      ],
      "write",
    );
  } finally {
    client.close();
  }
}
