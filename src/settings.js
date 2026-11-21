import config from "../config.js";

const list = (value = "") =>
  [...new Set(value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
export function settings(env = {}) {
  const { features } = config;
  const destination = (env.FORWARD_TO ?? "").trim().toLowerCase();
  const privateRecipient = (env.ARCHIVE_RECIPIENT ?? "").trim().toLowerCase();
  const isAddress = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (features.forward && !isAddress(destination))
    throw new Error("FORWARD_TO must be a valid email address when forwarding is enabled");
  if (features.archive && !isAddress(privateRecipient))
    throw new Error("ARCHIVE_RECIPIENT must be a valid email address when archiving is enabled");
  if (destination && destination === privateRecipient)
    throw new Error("FORWARD_TO must differ from ARCHIVE_RECIPIENT");
  return {
    ...config,
    destination,
    privateRecipient,
    sitePassword: env.SITE_PASSWORD ?? "",
    sessionSecret: env.SESSION_SECRET ?? "",
    turnstile: {
      ...config.turnstile,
      siteKey: env.TURNSTILE_SITE_KEY ?? "",
      secretKey: env.TURNSTILE_SECRET ?? "",
      hostnames: list(env.TURNSTILE_HOSTNAMES),
    },
  };
}

export function requireSessionSecret(secret) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
}
