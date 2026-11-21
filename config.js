// Public settings. Keep credentials and deployment-specific addresses in environment variables.
export default {
  name: "Tmail",
  features: {
    temporaryMail: true,
    forward: true,
    archive: true,
    cleanup: true,
  },
  turnstile: { enabled: true, verifyTimeoutMs: 10000 },
  mailboxTtlSeconds: 86400,
  sessionTtlSeconds: 2592000,
  retentionDays: 7,
  maxPublicEmailBytes: 2097152,
  createPerDay: 20,
  mailboxRequestsPerMinute: 12,
  inboxPolling: { intervalMs: 20000, maxIntervalMs: 120000 },
};
