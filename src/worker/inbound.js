import { withDatabase } from "./database.js";
import { addressDomain, findDomain, isTemporaryDomain } from "./domains.js";
import { hashToken } from "./hash.js";
import { equalSecret, HttpError } from "./security.js";
import { storeEmail } from "./storage.js";

const envelopeAddress = /^[^\s@<>,]{1,64}@[^\s@<>,]+$/;

async function readRawEmail(body, maxBytes) {
  if (!body) throw new HttpError(400, "邮件内容不能为空");
  let size = 0;
  const limited = body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new HttpError(413, "邮件超出大小限制");
      controller.enqueue(chunk);
    },
  }));
  const raw = new Uint8Array(await new Response(limited).arrayBuffer());
  if (!raw.byteLength) throw new HttpError(400, "邮件内容不能为空");
  return raw;
}

export async function receiveEmail(c) {
  const config = c.get("config");
  if (!config.features.temporaryMail)
    throw new HttpError(403, "临时邮箱功能未启用");
  const key = /^Bearer ([a-f0-9]{64})$/i.exec(c.req.header("Authorization") ?? "")?.[1];
  if (!key) throw new HttpError(401, "投递密钥无效");

  const to = c.req.header("X-Envelope-To") ?? "";
  const from = c.req.header("X-Envelope-From");
  if (to.length > 254 || !envelopeAddress.test(to) ||
      from === undefined || from.length > 254 ||
      (from !== "" && from !== "<>" && !envelopeAddress.test(from)))
    throw new HttpError(400, "SMTP 信封地址无效");
  const contentType = c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "message/rfc822")
    throw new HttpError(415, "请使用 message/rfc822 投递原始邮件");

  const name = addressDomain(to);
  if (!isTemporaryDomain(name, config)) throw new HttpError(401, "投递密钥无效");
  return withDatabase(c.env, async (db) => {
    const domain = await findDomain(db, name);
    if (domain?.delivery !== "webhook" || domain.enabled !== 1 ||
        !(await equalSecret(await hashToken(key), domain.key_digest)))
      throw new HttpError(401, "投递密钥无效");
    const raw = await readRawEmail(c.req.raw.body, config.maxPublicEmailBytes);
    await storeEmail(db, { from: from === "<>" ? "" : from, to, raw }, config, domain);
    return c.body(null, 204);
  });
}
