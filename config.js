// Public defaults. Keep credentials and deployment-specific addresses in environment variables.
export default {
  name: "Tmail",
  github: "https://github.com/tiouoo/tmail",
  features: {
    temporaryMail: true,
    forward: true,
    archive: true,
    cleanup: true,
  },
  turnstile: { enabled: true },
  mailboxTtlSeconds: 86400,
  sessionTtlSeconds: 2592000,
  retentionDays: 7,
  maxPublicEmailBytes: 2097152,
  createPerDay: 20,
};
