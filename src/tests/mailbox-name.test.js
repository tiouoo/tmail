import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mailboxWords } from "../worker/mailbox-words.js";
import { createMailboxName, createMailboxAddress } from "../worker/mailbox-name.js";

test("all 2–5 word combinations fit SMTP local-part limits with every separator", () => {
  assert.ok(mailboxWords.length > 1000);
  const longestWord = Math.max(...mailboxWords.map(word => word.length));
  assert.ok(longestWord * 5 + 4 <= 64);
  assert.ok(mailboxWords.every(word => /^[a-z]+$/.test(word)));
  for (let count = 2; count <= 5; count++) {
    for (let separator = 0; separator < 3; separator++) {
      let call = 0;
      const random = mock.method(crypto, "getRandomValues", array => {
        array[0] = call === 0 ? count - 2 : call >= 2 && call % 2 === 0 ? separator : 0;
        call++;
        return array;
      });
      try {
        const name = createMailboxName();
        const words = name.split(/[-_.]/);
        assert.equal(words.length, count);
        assert.equal(new Set(words).size, count);
        assert.ok(words.every(word => mailboxWords.includes(word)));
        assert.ok(name.length <= 64);
        assert.deepEqual([...new Set(name.match(/[-_.]/g))], [["-", "_", "."][separator]]);
      } finally { random.mock.restore(); }
    }
  }
});

test("mailbox generation rejects biased RNG values and allows mixed separators", () => {
  const draws = [2, 0, 0xffffffff, 0, 0, 1, 0, 2, 0];
  const random = mock.method(crypto, "getRandomValues", array => {
    assert.ok(draws.length, "unexpected random draw");
    array[0] = draws.shift();
    return array;
  });
  try {
    assert.match(createMailboxName(), /^[a-z]+-[a-z]+_[a-z]+\.[a-z]+$/);
    assert.equal(draws.length, 0);
  } finally { random.mock.restore(); }
});

test("address allocation skips names present in inboxes or stored public mail", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec('CREATE TABLE tmail_inboxes (address TEXT UNIQUE); CREATE TABLE "public" (envelope_to TEXT)');
  let calls = 0;
  const draws = [];
  const random = mock.method(crypto, "getRandomValues", array => {
    calls++;
    array[0] = draws.shift() ?? 0;
    return array;
  });
  const client = {
    async execute({ sql, args }) {
      return { rows: db.prepare(sql).all(...args) };
    },
  };
  try {
    const address = await createMailboxAddress(client, "t.example.com");
    for (const [table, column] of [["tmail_inboxes", "address"], ["public", "envelope_to"]]) {
      db.prepare(`INSERT INTO "${table}" (${column}) VALUES (?)`).run(address);
      calls = 0;
      await assert.rejects(createMailboxAddress(client, "t.example.com"), { status: 503 });
      assert.equal(calls, 32, "eight occupied candidates must be tried before failing");
      db.exec(`DELETE FROM "${table}"`);
    }
    db.prepare("INSERT INTO tmail_inboxes (address) VALUES (?)").run(address);
    draws.push(0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    let queries = 0;
    const available = await createMailboxAddress({
      async execute(input) {
        queries++;
        return client.execute(input);
      },
    }, "t.example.com");
    assert.equal(queries, 2, "an occupied candidate must be retried");
    assert.notEqual(available, address);
  } finally {
    random.mock.restore();
    db.close();
  }
});
