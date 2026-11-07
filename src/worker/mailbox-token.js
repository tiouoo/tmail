// Adapted from oiov/vmail sender.ts (GPL-3.0-only). See NOTICE.
const textEncoder = new TextEncoder();
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function createMailboxToken(
  address,
  secret,
  now = Date.now(),
  ttlSeconds = 24 * 60 * 60,
) {
  const payload = {
    v: 1,
    address: address.trim().toLowerCase(),
    expiresAt: now + ttlSeconds * 1e3,
  };
  const encodedPayload = bytesToBase64Url(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    textEncoder.encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
async function verifyMailboxToken(token, secret, now = Date.now()) {
  try {
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra) {
      return null;
    }
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(encodedPayload),
    );
    if (!validSignature) {
      return null;
    }
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    );
    if (
      payload.v !== 1 ||
      typeof payload.address !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= now
    ) {
      return null;
    }
    return payload.address;
  } catch {
    return null;
  }
}
export { createMailboxToken, verifyMailboxToken };
