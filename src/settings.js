import defaults from "../config.js";

const list = (value = "") =>
  [...new Set(value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
function flag(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Feature flags must be true or false");
}

export function settings(env = {}) {
  const emailDomains = list(env.EMAIL_DOMAINS);
  if (
    emailDomains.some(
      (domain) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain),
    )
  )
    throw new Error("Invalid EMAIL_DOMAINS");
  const features = Object.fromEntries([
    ["temporaryMail", "TEMPORARY_MAIL_ENABLED"], ["forward", "FORWARD_ENABLED"],
    ["archive", "ARCHIVE_ENABLED"], ["cleanup", "CLEANUP_ENABLED"],
  ].map(([key, name]) => [key, flag(env[name], defaults.features[key])]));
  if (features.temporaryMail && emailDomains.length === 0)
    throw new Error("EMAIL_DOMAINS is required when temporary mail is enabled");
  const destination = (env.FORWARD_TO ?? "").trim().toLowerCase();
  const privateRecipient = (env.ARCHIVE_RECIPIENT ?? "").trim().toLowerCase();
  const isAddress = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (features.forward && !isAddress(destination))
    throw new Error("FORWARD_TO must be a valid email address when forwarding is enabled");
  if (features.archive && !isAddress(privateRecipient))
    throw new Error("ARCHIVE_RECIPIENT must be a valid email address when archiving is enabled");
  if (
    destination &&
    (destination === privateRecipient ||
      emailDomains.some((domain) => destination.endsWith(`@${domain}`)))
  )
    throw new Error("FORWARD_TO must be outside the archive address and EMAIL_DOMAINS");
  if (emailDomains.some((domain) => privateRecipient.endsWith(`@${domain}`)))
    throw new Error("ARCHIVE_RECIPIENT must be outside EMAIL_DOMAINS");
  return {
    ...defaults,
    features,
    emailDomains: features.temporaryMail ? emailDomains : [],
    // Retained even when disabled, so temporary mail can never fall through to forwarding.
    routingDomains: emailDomains,
    destination,
    privateRecipient,
    sitePassword: env.SITE_PASSWORD ?? "",
    sessionSecret: env.SESSION_SECRET ?? "",
    turnstile: {
      enabled: flag(env.TURNSTILE_ENABLED, defaults.turnstile.enabled),
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
