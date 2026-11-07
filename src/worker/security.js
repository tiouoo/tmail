export { settings } from "../settings.js";
import { requireSessionSecret } from "../settings.js";
import { createMailboxToken, verifyMailboxToken } from "./mailbox-token.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function equalSecret(left, right) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all(
    [left, right].map((value) =>
      crypto.subtle.digest("SHA-256", encode.encode(value)),
    ),
  );
  const bytesA = new Uint8Array(a),
    bytesB = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

export async function verifyTurnstile(request, token, config) {
  if (!config.turnstile.enabled) return;
  if (!config.turnstile.siteKey || !config.turnstile.secretKey)
    throw new HttpError(503, "管理员尚未配置人机验证");
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new HttpError(403, "请先完成人机验证");
  let result;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: config.turnstile.secretKey,
          response: token,
          remoteip: request.headers.get("CF-Connecting-IP") ?? "",
        }),
      },
    );
    if (!response.ok) throw new Error("siteverify unavailable");
    result = await response.json();
  } catch {
    throw new HttpError(503, "人机验证暂时不可用，请重试");
  }
  const hostname = new URL(request.url).hostname;
  const allowed = config.turnstile.hostnames.length
    ? config.turnstile.hostnames
    : [hostname];
  if (
    result.success !== true ||
    result.action !== "tmail_access" ||
    result.hostname !== hostname ||
    !allowed.includes(result.hostname)
  ) {
    // Log only controlled metadata; never log tokens, secrets, IPs or raw responses.
    const knownCodes = new Set([
      "missing-input-secret", "invalid-input-secret",
      "missing-input-response", "invalid-input-response",
      "bad-request", "timeout-or-duplicate", "internal-error",
    ]);
    const codes = Array.isArray(result["error-codes"])
      ? result["error-codes"].filter((code) => knownCodes.has(code))
      : [];
    console.warn(JSON.stringify({
      operation: "turnstile",
      codes,
      success: result.success === true,
      actionMatches: result.action === "tmail_access",
      hostnameMatches: result.hostname === hostname,
      hostnameAllowed: allowed.includes(result.hostname),
    }));
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret"))
      throw new HttpError(503, "人机验证服务端配置异常，请联系管理员");
    throw new HttpError(403, "人机验证失败或已过期，请重新验证");
  }
}

export async function session(request, config) {
  requireSessionSecret(config.sessionSecret);
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("tmail_session="))
    ?.slice(14);
  if (!token || token.length > 2048) return null;
  const owner = await verifyMailboxToken(token, config.sessionSecret);
  return owner?.startsWith("owner:") ? owner.slice(6) : null;
}

export async function sessionCookie(owner, request, config) {
  requireSessionSecret(config.sessionSecret);
  const token = await createMailboxToken(
    `owner:${owner}`,
    config.sessionSecret,
    Date.now(),
    config.sessionTtlSeconds,
  );
  return `tmail_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.sessionTtlSeconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
