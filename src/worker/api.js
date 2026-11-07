import { Hono } from "hono";
import { requireSessionSecret } from "../settings.js";
import { bodyLimit } from "hono/body-limit";
import { database, consumeLimit } from "./database.js";
import {
  settings,
  session,
  sessionCookie,
  verifyTurnstile,
  equalSecret,
  HttpError,
} from "./security.js";
import { createMailboxToken, verifyMailboxToken } from "./mailbox-token.js";
import { hashToken } from "./hash.js";
import { tableForRecipient } from "./storage.js";
import { createMailboxAddress } from "./mailbox-name.js";

export const app = new Hono();
app.use("/api/*", bodyLimit({ maxSize: 8192 }));
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin)
      throw new HttpError(403, "不允许跨站操作");
  }
  const config = settings(c.env);
  requireSessionSecret(config.sessionSecret);
  c.set("config", config);
  await next();
});
app.onError((error, c) => {
  const status = error.status ?? 503;
  if (status >= 500)
    console.error(
      JSON.stringify({
        operation: "api",
        path: c.req.path,
        error: error.name,
      }),
    );
  return c.json(
    {
      error: {
        message:
          !error.status
            ? "服务暂时不可用，请稍后重试"
            : error.message,
      },
    },
    status,
  );
});

async function withDatabase(env, callback) {
  const db = await database(env);
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

async function body(c) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON");
  }
}

async function human(c, data, db) {
  const config = c.get("config");
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  if (!(await consumeLimit(db, `human:${await hashToken(ip)}`, 60, 12)))
    throw new HttpError(429, "操作过于频繁，请稍后再试");
  await verifyTurnstile(c.req.raw, data.turnstileToken, config);
}

async function mailboxAccess(c, db) {
  const config = c.get("config");
  const id = c.req.param("id");
  const token = c.req.header("X-Mailbox-Token");
  if (!token || token.length > 2048)
    throw new HttpError(401, "需要有效邮箱密码");
  const address = await verifyMailboxToken(token, config.sessionSecret);
  if (!address || tableForRecipient(address, config) !== "public")
    throw new HttpError(401, "邮箱密码已失效");
  const row = (
    await db.execute({
      sql: "SELECT * FROM tmail_inboxes WHERE id = ? AND address = ? AND expires_at > ?",
      args: [id, address, Date.now()],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "邮箱已失效或无权访问");
  return row;
}

async function presentMailbox(row, config) {
  return {
    id: row.id,
    address: row.address,
    expiresAt: Number(row.expires_at),
    password: row.first_email_id ?? null,
    token: await createMailboxToken(
      row.address,
      config.sessionSecret,
      Date.now(),
      Math.max(1, Math.floor((row.expires_at - Date.now()) / 1000)),
    ),
  };
}

app.get("/api/config", (c) => {
  const config = c.get("config");
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return c.json({
    name: config.name,
    github: config.github,
    features: config.features,
    emailDomains: config.emailDomains,
    passwordRequired: Boolean(config.sitePassword),
    mailboxTtlSeconds: config.mailboxTtlSeconds,
    turnstile: {
      enabled: config.turnstile.enabled,
      siteKey: config.turnstile.siteKey,
      configured:
        !config.turnstile.enabled ||
        Boolean(config.turnstile.siteKey && config.turnstile.secretKey),
    },
  });
});
app.get("/api/session", async (c) =>
  c.json({ owner: await session(c.req.raw, c.get("config")) }),
);

app.post("/api/session/logout", (c) => {
  c.header(
    "Set-Cookie",
    "tmail_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
  );
  return c.json({ success: true });
});

async function createMailbox(c) {
  const data = await body(c),
    config = c.get("config");
  if (!config.features.temporaryMail)
    throw new HttpError(403, "临时邮箱功能未启用");
  return withDatabase(c.env, async (db) => {
    await human(c, data, db);
    let owner = await session(c.req.raw, config);
    if (!owner) {
      if (
        config.sitePassword &&
        !(await equalSecret(String(data.password ?? ""), config.sitePassword))
      )
        throw new HttpError(403, "站点密码不正确");
      owner = crypto.randomUUID();
      c.header("Set-Cookie", await sessionCookie(owner, c.req.raw, config));
    }
    if (
      !(await consumeLimit(db, `create:${owner}`, 86400, config.createPerDay))
    )
      throw new HttpError(429, "今日邮箱创建额度已用完");
    const domain = String(data.domain ?? config.emailDomains[0]).toLowerCase();
    if (
      !config.emailDomains.includes(domain) ||
      tableForRecipient(`test@${domain}`, config) !== "public"
    )
      throw new HttpError(400, "不支持此邮箱域名");
    const id = crypto.randomUUID(),
      address = await createMailboxAddress(db, domain);
    const now = Date.now(),
      expires = now + config.mailboxTtlSeconds * 1000;
    const statements = [
      {
        sql: `INSERT INTO tmail_inboxes (id, address, owner, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
        args: [id, address, owner, now, expires],
      },
    ];
    if (typeof data.replaceId === "string") {
      statements.unshift({
        sql: `UPDATE tmail_inboxes SET expires_at = ? WHERE id = ? AND owner = ?`,
        args: [now - 1, data.replaceId, owner],
      });
    }
    await db.batch(statements, "write");
    return c.json(
      await presentMailbox({ id, address, expires_at: expires }, config),
      201,
    );
  });
}
app.post("/api/mailboxes", createMailbox);

app.post("/api/mailboxes/restore", async (c) => {
  if (!c.get("config").features.temporaryMail)
    throw new HttpError(403, "临时邮箱功能未启用");
  const data = await body(c),
    config = c.get("config");
  return withDatabase(c.env, async (db) => {
    await human(c, data, db);
    if (typeof data.password !== "string")
      throw new HttpError(400, "请输入邮箱密码");
    const password = data.password.trim();
    if (!/^[A-Za-z0-9_-]{22}$/.test(password))
      throw new HttpError(401, "邮箱密码无效或已过期");
    const row = (
      await db.execute({
        sql: "SELECT * FROM tmail_inboxes WHERE first_email_id = ? AND expires_at > ?",
        args: [password, Date.now()],
      })
    ).rows[0];
    if (!row || tableForRecipient(row.address, config) !== "public")
      throw new HttpError(404, "邮箱密码无效或邮箱已失效");
    return c.json(await presentMailbox(row, config));
  });
});

for (const prefix of ["/api/mailboxes"]) {
  app.get(`${prefix}/:id`, (c) =>
    withDatabase(c.env, async (db) =>
      c.json(await presentMailbox(await mailboxAccess(c, db), c.get("config"))),
    ),
  );
  app.get(`${prefix}/:id/messages`, (c) =>
    withDatabase(c.env, async (db) => {
      if (!c.get("config").features.temporaryMail)
        throw new HttpError(403, "临时邮箱功能未启用");
      const mailbox = await mailboxAccess(c, db);
      const limit = Math.max(
        1,
        Math.min(Number(c.req.query("limit")) || 30, 50),
      );
      const offset = Math.max(
        0,
        Math.min(Number(c.req.query("offset")) || 0, 10000),
      );
      const rows = (
        await db.execute({
          sql: `SELECT CASE WHEN id = ? THEN 'first' ELSE id END AS id, received_at, envelope_from, envelope_to, subject,
        substr(text_body, 1, 140) AS preview FROM "public"
        WHERE envelope_to = ? AND received_at >= ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`,
          args: [
            mailbox.first_email_id ?? "",
            mailbox.address,
            new Date(Number(mailbox.created_at)).toISOString(),
            limit + 1,
            offset,
          ],
        })
      ).rows;
      const data = {
        messages: rows.slice(0, limit),
        hasMore: rows.length > limit,
        password: mailbox.first_email_id ?? null,
      };
      const etag = `"${await hashToken(JSON.stringify(data))}"`;
      c.header("ETag", etag);
      if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
      return c.json(data);
    }),
  );
  app.get(`${prefix}/:id/messages/:messageId`, (c) =>
    withDatabase(c.env, async (db) => {
      if (!c.get("config").features.temporaryMail)
        throw new HttpError(403, "临时邮箱功能未启用");
      const mailbox = await mailboxAccess(c, db);
      const message = (
        await db.execute({
          sql: `SELECT id, received_at, envelope_from, envelope_to, subject, text_body, html_body, headers_json
      FROM "public" WHERE id = ? AND envelope_to = ? AND received_at >= ?`,
          args: [
            c.req.param("messageId") === "first"
              ? (mailbox.first_email_id ?? "")
              : c.req.param("messageId"),
            mailbox.address,
            new Date(Number(mailbox.created_at)).toISOString(),
          ],
        })
      ).rows[0];
      if (!message) throw new HttpError(404, "邮件不存在");
      return c.json({
        ...message,
        id: message.id === mailbox.first_email_id ? "first" : message.id,
      });
    }),
  );
  app.delete(`${prefix}/:id/messages/:messageId`, (c) =>
    withDatabase(c.env, async (db) => {
      if (!c.get("config").features.temporaryMail)
        throw new HttpError(403, "临时邮箱功能未启用");
      const mailbox = await mailboxAccess(c, db);
      await db.execute({
        sql: `DELETE FROM "public" WHERE id = ? AND envelope_to = ? AND received_at >= ?`,
        args: [
          c.req.param("messageId") === "first"
            ? (mailbox.first_email_id ?? "")
            : c.req.param("messageId"),
          mailbox.address,
          new Date(Number(mailbox.created_at)).toISOString(),
        ],
      });
      return c.json({ success: true });
    }),
  );
}

app.all("/api/*", (c) => c.json({ error: { message: "接口不存在" } }, 404));
