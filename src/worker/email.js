import { settings } from "../settings.js";
import { storeEmail, tableForRecipient } from "./storage.js";

export async function email(message, env = {}) {
  const config = settings(env);
  const table = tableForRecipient(message.to, config);
  try {
    if (table) {
      const enabled = table === "public" ? config.features.temporaryMail : config.features.archive;
      if (!enabled) {
        message.setReject("This mailbox service is disabled");
        return;
      }
      if (table === "public" && message.rawSize > config.maxPublicEmailBytes)
        throw new Error("Public email exceeds storage size limit");
      await storeEmail(message, table, env);
    } else {
      if (config.routingDomains.includes(message.to.split("@").at(-1).toLowerCase())) {
        message.setReject("This temporary mailbox domain is unavailable");
        return;
      }
      if (!config.features.forward) {
        message.setReject("Email forwarding is disabled");
        return;
      }
      if (!config.destination || !config.destination.includes("@"))
        throw new Error("FORWARD_TO is required for forwarding");
      if (config.destination === message.to.toLowerCase() || tableForRecipient(config.destination, config))
        throw new Error("FORWARD_TO must be an external mailbox");
      await message.forward(config.destination);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: table ? "store" : "forward",
        error: "Email processing failed",
        stored: false,
        retry: true,
      }),
    );
    throw new AggregateError([error], "Email processing failed");
  }
}
