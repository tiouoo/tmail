import { Hono } from "hono";
import { consumeLimit, withDatabase } from "./database.js";
import { isDomain, isTemporaryDomain } from "./domains.js";
import { hashToken } from "./hash.js";
import { equalSecret, HttpError } from "./security.js";

export const domainAdmin = new Hono();

domainAdmin.use("*", async (c, next) => {
  const secret = c.env.DOMAINS_ADMIN_PASSWORD;
  if (!secret?.trim())
    throw new HttpError(503, "域名管理尚未配置");

  const authorization = c.req.header("Authorization") ?? "";
  const credential = /^Bearer ([A-Za-z0-9+/]+={0,2})$/.exec(authorization)?.[1];
  let password;
  if (credential && credential.length <= 4096) {
    try {
      password = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        Uint8Array.from(atob(credential), (character) => character.charCodeAt(0)),
      );
    } catch {
      throw new HttpError(401, "管理员密码不正确");
    }
  }
  if (!password) throw new HttpError(401, "需要管理员密码");

  await withDatabase(c.env, async (db) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "local";
    if (!(await consumeLimit(db, `domains:${await hashToken(ip)}`, 60, 30)))
      throw new HttpError(429, "操作过于频繁，请稍后再试");
    if (!(await equalSecret(password, secret)))
      throw new HttpError(401, "管理员密码不正确");
    c.set("domainsDb", db);
    await next();
  });
});

async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON");
  }
}

function domainName(value) {
  const domain = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isDomain(domain)) throw new HttpError(400, "请输入有效的域名");
  return domain;
}

function requireAvailableDomain(c, domain) {
  if (!isTemporaryDomain(domain, c.get("config")))
    throw new HttpError(400, "该域名已用于转发或归档");
}

function newDeliveryKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

domainAdmin.get("/", async (c) => {
  const { rows } = await c.get("domainsDb").execute(
    "SELECT domain, delivery, enabled FROM tmail_domains ORDER BY domain",
  );
  return c.json({ domains: rows });
});

domainAdmin.post("/", async (c) => {
  const data = await readJson(c);
  const domain = domainName(data?.domain);
  const delivery = data.delivery;
  requireAvailableDomain(c, domain);
  if (delivery !== "cloudflare" && delivery !== "webhook")
    throw new HttpError(400, "请选择有效的投递方式");

  const key = delivery === "webhook" ? newDeliveryKey() : null;
  const { rows } = await c.get("domainsDb").execute({
    sql: `INSERT INTO tmail_domains (domain, delivery, key_digest) VALUES (?, ?, ?)
      ON CONFLICT (domain) DO NOTHING RETURNING domain, delivery, enabled`,
    args: [domain, delivery, key ? await hashToken(key) : null],
  });
  if (!rows.length) throw new HttpError(409, "该域名已添加");
  return c.json({ domain: rows[0], ...(key && { key }) }, 201);
});

domainAdmin.patch("/:domain", async (c) => {
  const domain = domainName(c.req.param("domain"));
  const data = await readJson(c);
  if (typeof data?.enabled !== "boolean")
    throw new HttpError(400, "请选择启用或停用");
  if (data.enabled) requireAvailableDomain(c, domain);

  const { rows } = await c.get("domainsDb").execute({
    sql: `UPDATE tmail_domains SET enabled = ? WHERE domain = ?
      RETURNING domain, delivery, enabled`,
    args: [Number(data.enabled), domain],
  });
  if (!rows.length) throw new HttpError(404, "域名不存在");
  return c.json({ domain: rows[0] });
});

domainAdmin.delete("/:domain", async (c) => {
  const domain = domainName(c.req.param("domain"));
  await c.get("domainsDb").execute({
    sql: "DELETE FROM tmail_domains WHERE domain = ?",
    args: [domain],
  });
  return c.json({ domain });
});

domainAdmin.post("/:domain/rotate-key", async (c) => {
  const domain = domainName(c.req.param("domain"));
  const key = newDeliveryKey();
  const { rows } = await c.get("domainsDb").execute({
    sql: `UPDATE tmail_domains SET key_digest = ? WHERE domain = ? AND delivery = 'webhook'
      RETURNING domain, delivery, enabled`,
    args: [await hashToken(key), domain],
  });
  if (!rows.length) throw new HttpError(404, "找不到使用 Webhook 投递的域名");
  return c.json({ domain: rows[0], key });
});
