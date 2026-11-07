import { test } from "node:test";
import assert from "node:assert/strict";

class Storage {
  getItem(key) {
    return Object.hasOwn(this, key) ? this[key] : null;
  }
  setItem(key, value) {
    this[key] = String(value);
  }
  removeItem(key) {
    delete this[key];
  }
}
const listeners = new Map();
globalThis.window = {
  localStorage: new Storage(),
  addEventListener: (name, callback) => listeners.set(name, callback),
};
const cache = await import("../frontend/src/cache.js");
const { mailboxRequest } = await import("../frontend/src/api.js");
const box = (id) => ({
  id,
  address: `${id}@t.example.com`,
  token: `credential-${id}`,
  expiresAt: Date.now() + 60000,
});

test("mailbox switching clears old content but preserves nonsensitive site config", () => {
  cache.setMailbox(box("first"));
  cache.writeCache("site", "config", { name: "Tmail" }, 60000);
  cache.writeCache(
    "first",
    "mail:message",
    { subject: "old private content" },
    60000,
  );
  cache.setMailbox(box("second"));
  assert.equal(cache.readCache("first", "mail:message"), undefined);
  assert.equal(cache.readCache("site", "config").name, "Tmail");
});

test("late responses cannot repopulate caches after changing mailbox", async () => {
  const oldFetch = globalThis.fetch;
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const old = box("old");
  cache.setMailbox(old);
  const request = mailboxRequest(old, "list:0", "/api/mailboxes/old/messages");
  cache.setMailbox(box("new"));
  finish(Response.json({ messages: [{ subject: "must not appear" }] }));
  try {
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(cache.readCache("old", "list:0"), undefined);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("cache expires no later than mailbox and other tabs receive reset notification", () => {
  cache.writeCache("new", "expired", { value: 1 }, 60000, Date.now() - 1);
  assert.equal(cache.readCache("new", "expired"), undefined);
  cache.writeCache("new", "mail", { value: 2 }, 60000);
  const before = cache.generation();
  listeners.get("storage")({ key: "tmail.active" });
  assert.equal(cache.generation(), before + 1);
  assert.equal(cache.readCache("new", "mail"), undefined);
});
