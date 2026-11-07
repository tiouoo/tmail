import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// Execute production SQL against an isolated SQLite database; never contact Turso.
const sqlite = new DatabaseSync(":memory:");
function execute(input) {
  const sql = typeof input === "string" ? input : input.sql;
  const args = typeof input === "string" ? [] : input.args;
  const statement = sqlite.prepare(sql);
  const rows = statement.all(...args);
  const changes = sqlite.prepare("SELECT changes() AS n").get().n;
  return { rows, rowsAffected: changes };
}
const client = {
  execute: async (input) => execute(input),
  batch: async (inputs) => {
    sqlite.exec("BEGIN");
    try {
      const results = inputs.map(execute);
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
  close() {},
};
mock.module("@libsql/client/web", {
  namedExports: { createClient: () => client },
});
const { app } = await import("../worker/api.js");
const { migrate } = await import("../worker/database.js");
const { createTableSql, tableForRecipient: tableForRecipientRaw, storeEmail: rawStoreEmail } =
  await import("../worker/storage.js");
const { verifyTurnstile, settings } = await import("../worker/security.js");
const { email: rawEmail } = await import("../worker/email.js");
const worker = (await import("../worker/index.js")).default;
const env = {
  TURSO_DATABASE_URL: "libsql://isolated-test.example.com", TURSO_AUTH_TOKEN: "test-token",
  SESSION_SECRET: "isolated-test-secret-at-least-32-characters",
  EMAIL_DOMAINS: "t.example.com,t.example.org", FORWARD_TO: "test@qq.com",
  ARCHIVE_RECIPIENT: "archive@example.com", TURNSTILE_ENABLED: "false",
  TURNSTILE_SITE_KEY: "test-sitekey",
};
const web = settings(env), consts = web;
const storeEmail = (message, table) => rawStoreEmail(message, table, env);
const email = message => rawEmail(message, env);
const tableForRecipient = address => tableForRecipientRaw(address, web);

const origin = "https://t.example.com";
function request(path, options = {}) {
  return app.request(origin + path, options, env);
}
function post(data, cookie) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  };
}
function message(address, subject = "Test subject", forward = async () => {}) {
  const raw = new TextEncoder().encode(
    `From: sender@example.com\r\nTo: ${address}\r\nSubject: ${subject}\r\nMessage-ID: <${encodeURIComponent(subject)}@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from isolated test`,
  );
  return {
    from: "sender@example.com",
    to: address,
    raw: new Blob([raw]).stream(),
    rawSize: raw.length,
    forward,
    setReject(reason) { this.rejected = reason; },
  };
}

test("public migrations preserve the private table and records", async () => {
  sqlite.exec(createTableSql("private"));
  sqlite
    .prepare(
      `INSERT INTO "private" (id, received_at, envelope_from, envelope_to, headers_json, raw) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "private-marker",
      new Date().toISOString(),
      "private@example.com",
      "archive@example.com",
      "[]",
      new Uint8Array([1]),
    );
  const before = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'private'")
    .get().sql;
  await migrate(client);
  await migrate(client);
  assert.equal(
    sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'private'").get()
      .sql,
    before,
  );
  assert.equal(
    sqlite.prepare(`SELECT count(*) AS n FROM "private"`).get().n,
    1,
  );
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('tmail_mailboxes', 'tmail_routes')").get().n, 0);
});

test("recipient rules include all configured t subdomains", () => {
  assert.equal(tableForRecipient("ARCHIVE@EXAMPLE.COM"), "private");
  for (const domain of web.emailDomains)
    assert.equal(tableForRecipient(`user@${domain}`), "public");
  for (const address of ["a@example.com", "a@not-t.example.com", "a@invalid.example.net"])
    assert.equal(tableForRecipient(address), null);
});

test("mailbox credentials isolate public mail and exclude private mail", async () => {
  const response = await request(
    "/api/mailboxes",
    post({ domain: "t.example.com" }),
  );
  assert.equal(response.status, 201);
  const box = await response.json();
  assert.match(box.address, /^[a-z]+(?:[-_.][a-z]+){1,4}@t\.example\.com$/);
  assert.equal(box.password, null);
  await storeEmail(message(box.address), "public");
  await storeEmail(message(box.address), "public");
  const headers = { "X-Mailbox-Token": box.token };
  assert.equal(
    (await request(`/api/mailboxes/${box.id}/messages`)).status,
    401,
  );
  const listing = await request(`/api/mailboxes/${box.id}/messages`, {
    headers,
  });
  assert.equal(listing.status, 200);
  assert.equal(listing.headers.get("Cache-Control"), "no-store");
  const data = await listing.json();
  assert.match(data.password, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(data.messages[0].id, "first", "recovery password must not appear in mail links");
  assert.equal(
    data.messages.length,
    1,
    "SMTP retries must not duplicate public rows",
  );
  assert.equal(
    (
      await request(`/api/mailboxes/${box.id}/messages/private-marker`, {
        headers,
      })
    ).status,
    404,
  );
  const second = await (
    await request("/api/mailboxes", post({ domain: "t.example.org" }))
  ).json();
  assert.equal(
    (
      await request(`/api/mailboxes/${box.id}/messages`, {
        headers: { "X-Mailbox-Token": second.token },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/mailboxes/${box.id}/messages`, {
        headers: { ...headers, "If-None-Match": listing.headers.get("ETag") },
      })
    ).status,
    304,
  );
  const privateToken = (await import("../worker/mailbox-token.js"))
    .createMailboxToken;
  const forged = await privateToken(
    "archive@example.com",
    web.sessionSecret,
  );
  assert.equal(
    (
      await request(`/api/mailboxes/${box.id}/messages`, {
        headers: { "X-Mailbox-Token": forged },
      })
    ).status,
    401,
  );
});

test("first-email passwords restore a mailbox and remain stable after new mail or deletion", async () => {
  const box = await (await request("/api/mailboxes", post({ domain: "t.example.com" }))).json();
  const headers = { "X-Mailbox-Token": box.token };
  const path = `/api/mailboxes/${box.id}/messages`;
  assert.equal(box.password, null);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "public" WHERE envelope_to = ?').get(box.address).n, 0);
  await storeEmail(message(box.address, "First recovery email"), "public");
  const first = await (await request(path, { headers })).json();
  const password = first.password;
  assert.match(password, /^[A-Za-z0-9_-]{22}$/);
  assert.equal((await request(`${path}/first`, { headers })).status, 200);
  await storeEmail(message(box.address, "Second email"), "public");
  const page = await (await request(path + "?limit=1", { headers })).json();
  assert.equal(page.password, password, "pagination must not change the first-email password");
  const secondId = sqlite.prepare('SELECT id FROM "public" WHERE envelope_to = ? AND id != ?').get(box.address, password).id;
  assert.equal((await request("/api/mailboxes/restore", post({ password: secondId }))).status, 404);
  assert.equal((await request("/api/mailboxes/restore", post({ password: box.token }))).status, 401);
  assert.equal((await request("/api/mailboxes/restore", post({ password: "A".repeat(22) }))).status, 404);
  const restored = await request("/api/mailboxes/restore", post({ password }));
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).id, box.id);
  assert.equal((await request(`${path}/first`, { method: "DELETE", headers })).status, 200);
  assert.equal((await request("/api/mailboxes/restore", post({ password }))).status, 200);
  await storeEmail(message(box.address, "Third email"), "public");
  assert.equal((await (await request(path, { headers })).json()).password, password);
  sqlite.prepare("UPDATE tmail_inboxes SET expires_at = ? WHERE id = ?").run(Date.now() - 1, box.id);
  assert.equal((await request("/api/mailboxes/restore", post({ password }))).status, 404);
  assert.equal((await request(path, { headers })).status, 404);
});

test("scheduled cleanup only removes expired public data and inboxes", async () => {
  await worker.scheduled({}, env);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM tmail_inboxes WHERE expires_at <= ?").get(Date.now()).n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "private" WHERE id = ?').get("private-marker").n, 1);
});

test("recreating retires only the same owner mailbox and invalidates its token", async () => {
  sqlite.exec("DELETE FROM tmail_limits");
  const response = await request("/api/mailboxes", post({}));
  const first = await response.json(),
    cookie = response.headers.get("Set-Cookie").split(";")[0];
  await storeEmail(message(first.address), "public");
  const firstPassword = sqlite.prepare("SELECT first_email_id FROM tmail_inboxes WHERE id = ?").get(first.id).first_email_id;
  const other = await (await request("/api/mailboxes", post({}))).json();
  assert.equal((await request("/api/mailboxes", post({ replaceId: other.id }, cookie))).status, 201);
  assert.equal(
    (
      await request(`/api/mailboxes/${other.id}`, {
        headers: { "X-Mailbox-Token": other.token },
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/mailboxes", post({ replaceId: first.id }, cookie))).status, 201);
  assert.equal(
    (
      await request(`/api/mailboxes/${first.id}`, {
        headers: { "X-Mailbox-Token": first.token },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/mailboxes/restore", post({ password: firstPassword })))
      .status,
    404,
  );
});

test("temporary mail only enters public and QQ return mail only enters private", async () => {
  let forwards = 0;
  for (const address of [
    ...web.emailDomains.map(domain => `routing@${domain}`),
    "ROUTING@T.EXAMPLE.COM",
    consts.privateRecipient.toUpperCase(),
  ]) {
    const table = tableForRecipient(address);
    const other = table === "public" ? "private" : "public";
    const subject = `Routing ${address}`;
    await email(message(address, subject, async () => { forwards++; }));
    assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM "${table}" WHERE envelope_to = ? AND subject = ?`).get(address.toLowerCase(), subject).n, 1);
    assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM "${other}" WHERE envelope_to = ? AND subject = ?`).get(address.toLowerCase(), subject).n, 0);
  }
  assert.equal(forwards, 0, "stored mail must never be forwarded to QQ");
});

test("ordinary mail only forwards to the configured QQ destination", async () => {
  const address = "outside@example.com";
  const destinations = [];
  await email(message(address, "Forward only", async destination => { destinations.push(destination); }));
  assert.deepEqual(destinations, [consts.destination]);
  for (const table of ["public", "private"])
    assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM "${table}" WHERE envelope_to = ?`).get(address).n, 0);
});

test("storage failures never fall back to QQ and failed forwards are reported", async () => {
  const errors = [], oldError = console.error;
  let forwards = 0;
  console.error = value => errors.push(JSON.parse(value));
  try {
    for (const address of ["bad@t.example.com", consts.privateRecipient]) {
      const bad = message(address, "Read failure", async () => { forwards++; });
      bad.raw = new ReadableStream({
        start(controller) { controller.error(new Error("Read failed")); },
      });
      await assert.rejects(email(bad), AggregateError);
    }
    assert.equal(forwards, 0);
    await assert.rejects(email(message("outside@example.com", "Failed forward", async () => {
      forwards++;
      throw new Error("Temporary forwarding failure");
    })), AggregateError);
    assert.equal(forwards, 1);
    assert.deepEqual(errors.map(error => error.operation), ["store", "store", "forward"]);
    assert.ok(errors.every(error => !error.stored && error.retry));
  } finally { console.error = oldError; }
});

test("public size limit never forwards to QQ and does not apply to private mail", async () => {
  const oldError = console.error;
  let forwards = 0;
  console.error = () => {};
  try {
    const address = "oversized@t.example.com";
    const oversized = message(address, "Oversized public", async () => { forwards++; });
    oversized.rawSize = web.maxPublicEmailBytes + 1;
    await assert.rejects(email(oversized), AggregateError);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "public" WHERE envelope_to = ?').get(address).n, 0);
    const privateMail = message(consts.privateRecipient, "Large private", async () => { forwards++; });
    privateMail.rawSize = web.maxPublicEmailBytes + 1;
    await email(privateMail);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "private" WHERE subject = ?').get("Large private").n, 1);
    assert.equal(forwards, 0);
  } finally { console.error = oldError; }
});

test("Turnstile requires success, exact action and hostname and rejects token replay", async () => {
  const fetchOriginal = globalThis.fetch;
  const config = settings({
    ...env,
    TURNSTILE_SITE_KEY: "sitekey",
    TURNSTILE_SECRET: "secret",
  });
  config.turnstile.enabled = true;
  let used = false;
  globalThis.fetch = async () => {
    const result = used
      ? { success: false, "error-codes": ["timeout-or-duplicate"] }
      : { success: true, hostname: "t.example.com", action: "tmail_access" };
    used = true;
    return Response.json(result);
  };
  try {
    await verifyTurnstile(new Request(origin), "fresh-token", config);
    await assert.rejects(
      verifyTurnstile(new Request(origin), "fresh-token", config),
      { status: 403 },
    );
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        hostname: "attacker.example",
        action: "tmail_access",
      });
    await assert.rejects(
      verifyTurnstile(new Request(origin), "another-token", config),
      { status: 403 },
    );
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        hostname: "t.example.com",
        action: "different",
      });
    await assert.rejects(
      verifyTurnstile(new Request(origin), "another-token", config),
      { status: 403 },
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("Turnstile distinguishes server secret errors and never logs credentials", async () => {
  const fetchOriginal = globalThis.fetch;
  const warnOriginal = console.warn;
  const logs = [];
  const config = settings({ ...env, TURNSTILE_SECRET: "private-server-secret" });
  config.turnstile.enabled = true;
  console.warn = (value) => logs.push(value);
  globalThis.fetch = async () => Response.json({
    success: false, "error-codes": ["invalid-input-secret", "private-server-secret"],
    response: "private-browser-token",
  });
  try {
    await assert.rejects(
      verifyTurnstile(new Request(origin), "private-browser-token", config),
      { status: 503, message: "人机验证服务端配置异常，请联系管理员" },
    );
    assert.equal(JSON.parse(logs[0]).operation, "turnstile");
    assert.deepEqual(JSON.parse(logs[0]).codes, ["invalid-input-secret"]);
    assert.ok(!logs.join("").includes("private-server-secret"));
    assert.ok(!logs.join("").includes("private-browser-token"));
  } finally {
    globalThis.fetch = fetchOriginal;
    console.warn = warnOriginal;
  }
});

test("no external API endpoints; public config never discloses server credentials", async () => {
  assert.equal((await request("/api/v1/mailboxes", post({}))).status, 404);
  assert.equal((await request("/api/keys")).status, 404);
  const config = await (await request("/api/config")).text();
  assert.ok(
    !config.includes("authToken") &&
      !config.includes("sessionSecret") &&
      !config.includes("secretKey"),
  );
});

test("all configured domains use existing catch-all routing without Cloudflare API calls", async () => {
  const originalFetch = globalThis.fetch;
  sqlite.exec("DELETE FROM tmail_limits");
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Mailbox creation must not manage Cloudflare routes");
  };
  try {
    for (const domain of web.emailDomains) {
      const response = await request("/api/mailboxes", post({ domain }));
      assert.equal(response.status, 201);
      const box = await response.json();
      assert.ok(box.address.endsWith(`@${domain}`));
      assert.equal(
        sqlite.prepare("SELECT count(*) AS n FROM tmail_inboxes WHERE id = ?").get(box.id).n,
        1,
      );
    }
    await worker.scheduled({}, env);
    assert.equal(calls, 0, "creation and cleanup require neither Cloudflare API calls nor routing credentials");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redelivery with new Received and ARC headers stores one email and keeps its recovery password", async () => {
  sqlite.exec("DELETE FROM tmail_limits");
  const box = await (await request("/api/mailboxes", post({ domain: "t.example.org" }))).json();
  const source = await new Response(message(box.address, "SMTP redelivery").raw).text();
  const errors = [], oldError = console.error;
  let forwards = 0;
  console.error = value => errors.push(JSON.parse(value));
  try {
    for (const attempt of [1, 2]) {
      const raw = new TextEncoder().encode(`Received: from relay-${attempt}; delivery-${attempt}\r\nARC-Seal: i=1; b=signature-${attempt}\r\nARC-Message-Signature: i=1; b=signature-${attempt}\r\n${source}`);
      await email({
        from: "sender@example.com", to: box.address,
        raw: new Blob([raw]).stream(), rawSize: raw.length,
        forward: async () => { forwards++; throw new Error("Permanent error (550): DMARC check failed"); },
      });
    }
    const result = await (await request(`/api/mailboxes/${box.id}/messages`, { headers: { "X-Mailbox-Token": box.token } })).json();
    assert.equal(result.messages.length, 1);
    assert.match(result.password, /^[A-Za-z0-9_-]{22}$/);
    assert.equal((await request("/api/mailboxes/restore", post({ password: result.password }))).status, 200);
    assert.equal(forwards, 0, "redelivered public mail must never forward to QQ");
    assert.deepEqual(errors, []);
  } finally { console.error = oldError; }
});

test("Message-ID deduplication is scoped to recipient and sender; different or absent IDs remain usable", async () => {
  const addresses = ["identity-one@t.example.com", "identity-two@t.example.com"];
  for (const address of addresses) await storeEmail(message(address, "Shared Message-ID"), "public");
  const same = message(addresses[0], "Shared Message-ID");
  same.from = "another-sender@example.com";
  await storeEmail(same, "public");
  await storeEmail(message(addresses[0], "Different Message-ID"), "public");
  for (let index = 0; index < 2; index++) {
    const original = message(addresses[0], "No Message-ID");
    const raw = (await new Response(original.raw).text()).replace(/^Message-ID:.*\r\n/m, "");
    original.raw = new Blob([raw]).stream();
    await storeEmail(original, "public");
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "public" WHERE envelope_to = ?').get(addresses[0]).n, 4);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM "public" WHERE envelope_to = ?').get(addresses[1]).n, 1);
});

test("feature switches reject their mail classes without forwarding them", async () => {
  const domains = settings({ ...env, TEMPORARY_MAIL_ENABLED: "false" });
  assert.deepEqual(domains.emailDomains, []);
  assert.equal(tableForRecipient(`user@${web.emailDomains[0]}`), "public");
  const temp = message(`user@${web.emailDomains[0]}`);
  await rawEmail(temp, { ...env, TEMPORARY_MAIL_ENABLED: "false" });
  assert.match(temp.rejected, /disabled/);
  const archive = message(env.ARCHIVE_RECIPIENT);
  await rawEmail(archive, { ...env, ARCHIVE_ENABLED: "false" });
  assert.match(archive.rejected, /disabled/);
  const ordinary = message("outside@example.net");
  await rawEmail(ordinary, { ...env, FORWARD_ENABLED: "false" });
  assert.match(ordinary.rejected, /disabled/);
});

test("first mailbox request creates all tables on an empty database", async () => {
  sqlite.exec("DROP TABLE IF EXISTS tmail_limits; DROP TABLE IF EXISTS tmail_inboxes; DROP TABLE IF EXISTS public; DROP TABLE IF EXISTS private;");
  const response = await request("/api/mailboxes", post({ domain: web.emailDomains[0] }));
  assert.equal(response.status, 201);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('private', 'public', 'tmail_inboxes', 'tmail_limits')").get().n, 4);
});
