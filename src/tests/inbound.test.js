import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, mock, test } from "node:test";
import { createClient } from "@libsql/client";
import config from "../../config.js";
import { hashToken } from "../worker/hash.js";

const db = createClient({ url: ":memory:" });
mock.module("@libsql/client/web", {
  namedExports: {
    createClient: () => ({
      execute: db.execute.bind(db),
      batch: db.batch.bind(db),
      close() {},
    }),
  },
});
after(() => db.close());
config.turnstile.enabled = false;

const { default: worker } = await import("../worker/index.js");
const { migrate } = await import("../worker/database.js");
await migrate(db);

const env = {
  TURSO_DATABASE_URL: ":memory:",
  TURSO_AUTH_TOKEN: "test",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  FORWARD_TO: "owner@forward.example",
  ARCHIVE_RECIPIENT: "archive@private.example",
};

const sender = "sender@source.example";
const rawEmail = [
  `From: ${sender}`,
  "To: header-only@source.example",
  "Subject: Delivery test",
  "Message-ID: <delivery-test@source.example>",
  "",
  "Body of the email",
].join("\r\n");

function request(path, init) {
  return worker.fetch(new Request(`https://tmail.example${path}`, init), env);
}

async function addDomain(domain, delivery) {
  const key = randomBytes(32).toString("hex");
  await db.execute({
    sql: "INSERT INTO tmail_domains (domain, delivery, key_digest) VALUES (?, ?, ?)",
    args: [domain, delivery, await hashToken(key)],
  });
  return key;
}

async function createMailbox(domain) {
  const response = await request("/api/mailboxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

function deliver(to, key, body = rawEmail) {
  return request("/api/inbound", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "message/rfc822",
      "X-Envelope-From": sender,
      "X-Envelope-To": to,
    },
    body,
  });
}

async function inbox(mailbox) {
  const response = await request(`/api/mailboxes/${mailbox.id}/messages`, {
    headers: { "X-Mailbox-Token": mailbox.token },
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("domain registration is read dynamically and webhook keys are scoped to their own domain", async () => {
  const domain = "partner.example";
  const key = await addDomain(domain, "webhook");
  const otherKey = await addDomain("other.example", "webhook");
  const mailbox = await createMailbox(domain);

  const response = await request("/api/config");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const publicConfig = await response.json();
  assert.deepEqual(publicConfig.emailDomains, ["other.example", domain]);
  assert.ok(!JSON.stringify(publicConfig).includes(await hashToken(key)));

  assert.equal((await deliver(mailbox.address, otherKey)).status, 401);
  assert.equal((await deliver(env.ARCHIVE_RECIPIENT, key)).status, 401);
  assert.equal((await deliver(mailbox.address, key, "x".repeat(config.maxPublicEmailBytes + 1))).status, 413);
  assert.equal((await inbox(mailbox)).messages.length, 0);
  assert.equal((await deliver(`unknown@${domain}`, key)).status, 204);
  assert.equal((await deliver(mailbox.address, key, rawEmail + "\r\n" + "x".repeat(9000))).status, 204);
  assert.equal((await deliver(mailbox.address, key)).status, 204);

  const data = await inbox(mailbox);
  assert.equal(data.messages.length, 1);
  assert.equal(data.messages[0].subject, "Delivery test");
  assert.equal(data.messages[0].envelope_to, mailbox.address);
  assert.equal(data.messages[0].id, "first");
  assert.match(data.password, /^[A-Za-z0-9_-]{22}$/);
  assert.equal((await db.execute('SELECT count(*) AS total FROM "public"')).rows[0].total, 1);
  const detail = await request(`/api/mailboxes/${mailbox.id}/messages/first`, {
    headers: { "X-Mailbox-Token": mailbox.token },
  });
  assert.equal(detail.status, 200);
  assert.match((await detail.json()).text_body, /^Body of the email/);

  const newKey = randomBytes(32).toString("hex");
  await db.execute({
    sql: "UPDATE tmail_domains SET key_digest = ? WHERE domain = ?",
    args: [await hashToken(newKey), domain],
  });
  assert.equal((await deliver(mailbox.address, key)).status, 401);
  assert.equal((await deliver(mailbox.address, newKey)).status, 204);

  await db.execute({
    sql: "UPDATE tmail_domains SET enabled = 0 WHERE domain = ?",
    args: [domain],
  });
  assert.deepEqual((await (await request("/api/config")).json()).emailDomains, ["other.example"]);
  assert.equal((await deliver(mailbox.address, newKey)).status, 401);
  assert.equal((await inbox(mailbox)).messages.length, 1);
});

test("Cloudflare routes native deliveries, archive, and forwarding separately from the webhook", async () => {
  const domain = "native.example";
  await db.execute({
    sql: "INSERT INTO tmail_domains (domain, delivery) VALUES (?, 'cloudflare')",
    args: [domain],
  });
  const mailbox = await createMailbox(domain);
  const message = (to) => ({
    to,
    from: sender,
    raw: new Blob([rawEmail]).stream(),
    rawSize: Buffer.byteLength(rawEmail),
    setReject: mock.fn(),
    forward: mock.fn(),
  });

  assert.equal((await deliver(mailbox.address, randomBytes(32).toString("hex"))).status, 401);
  await worker.email(message(mailbox.address), env);
  assert.equal((await inbox(mailbox)).messages.length, 1);

  const partner = message("someone@other.example");
  await worker.email(partner, env);
  assert.equal(partner.setReject.mock.callCount(), 1);
  assert.equal(partner.forward.mock.callCount(), 0);

  await worker.email(message(env.ARCHIVE_RECIPIENT), env);
  const archive = await db.execute('SELECT envelope_to FROM "private"');
  assert.equal(archive.rows[0].envelope_to, env.ARCHIVE_RECIPIENT);

  const forwarded = message("route@source.example");
  await worker.email(forwarded, env);
  assert.deepEqual(forwarded.forward.mock.calls[0].arguments, [env.FORWARD_TO]);
});
