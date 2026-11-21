import { canReceiveCloudflareMail } from "../../email-routing.js";
import { settings } from "../settings.js";
import { withDatabase } from "./database.js";
import { addressDomain, findDomain } from "./domains.js";
import { storeEmail } from "./storage.js";

export async function email(message, env = {}) {
  const config = settings(env);
  const to = message.to.toLowerCase();
  let operation = "store";
  try {
    await withDatabase(env, async (db) => {
      if (to === config.privateRecipient) {
        if (!config.features.archive) {
          message.setReject("Email archiving is disabled");
          return;
        }
        const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
        await storeEmail(db, { from: message.from, to, raw }, config);
        return;
      }

      const name = addressDomain(to);
      const domain = await findDomain(db, name);
      if (domain) {
        if (!canReceiveCloudflareMail(name, domain, config)) {
          message.setReject("This temporary mailbox domain is unavailable");
          return;
        }
        if (message.rawSize > config.maxPublicEmailBytes) {
          message.setReject("Email exceeds temporary mailbox size limit");
          return;
        }
        const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
        await storeEmail(db, { from: message.from, to, raw }, config, domain);
        return;
      }

      operation = "forward";
      if (!config.features.forward) {
        message.setReject("Email forwarding is disabled");
        return;
      }
      if (config.destination === to || await findDomain(db, addressDomain(config.destination)))
        throw new Error("FORWARD_TO must be an external mailbox");
      await message.forward(config.destination);
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        operation,
        error: "Email processing failed",
        stored: false,
        retry: true,
      }),
    );
    throw new AggregateError([error], "Email processing failed");
  }
}
