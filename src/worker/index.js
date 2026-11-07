import { email } from "./email.js";
import { database } from "./database.js";
import { settings } from "../settings.js";

export default {
  email,
  async scheduled(_event, env) {
    const config = settings(env);
    if (!config.features.cleanup) return;
    const db = await database(env);
    try {
      const now = Date.now();
      await db.batch(
        [
          {
            sql: "DELETE FROM tmail_inboxes WHERE expires_at <= ?",
            args: [now],
          },
          {
            sql: `DELETE FROM "public" WHERE received_at < ?`,
            args: [new Date(now - config.retentionDays * 86400000).toISOString()],
          },
          {
            sql: "DELETE FROM tmail_limits WHERE window < ? AND key NOT LIKE 'create:%'",
            args: [Math.floor(now / 60000) - 1440],
          },
          {
            sql: "DELETE FROM tmail_limits WHERE window < ? AND key LIKE 'create:%'",
            args: [Math.floor(now / 86400000) - 2],
          },
        ],
        "write",
      );
    } finally {
      db.close();
    }
  },
};
