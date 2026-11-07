// Adapted from oiov/vmail (GPL-3.0-only). See NOTICE.
const encoder = new TextEncoder();
const encode = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
async function hashToken(token) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(token)),
    ),
  );
}
export { hashToken };
