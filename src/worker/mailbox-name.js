import { mailboxWords } from "./mailbox-words.js";
import { HttpError } from "./security.js";

const separators = ["-", "_", "."];

function randomInt(max) {
  const limit = 2 ** 32 - (2 ** 32 % max);
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

export function createMailboxName() {
  const count = 2 + randomInt(4);
  const pool = [...mailboxWords];
  return Array.from({ length: count }, (_, index) => {
    const separator = index ? separators[randomInt(separators.length)] : "";
    const word = pool.splice(randomInt(pool.length), 1)[0];
    return separator + word;
  }).join("");
}

export async function createMailboxAddress(db, domain) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const address = `${createMailboxName()}@${domain}`;
    const existing = await db.execute({
      sql: 'SELECT 1 FROM tmail_inboxes WHERE address = ? UNION ALL SELECT 1 FROM "public" WHERE envelope_to = ? LIMIT 1',
      args: [address, address],
    });
    if (!existing.rows.length) return address;
  }
  throw new HttpError(503, "暂时无法分配邮箱名，请重试");
}
