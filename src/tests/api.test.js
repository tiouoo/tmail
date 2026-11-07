import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.window = { addEventListener() {} };
const { api, ApiError } = await import("../frontend/src/api.js");

test("empty or HTML API failures produce a useful message instead of a JSON exception", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [
      new Response(null, { status: 502 }),
      new Response("<!doctype html>", { status: 200 }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(api("/api/config"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 502);
        assert.match(error.message, /开发服务/);
        return true;
      });
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("JSON API errors and cache validation retain their original behavior", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(
      { error: { message: "需要有效邮箱密码" } }, { status: 401 },
    );
    await assert.rejects(api("/api/mailboxes/test/messages"), {
      status: 401, message: "需要有效邮箱密码",
    });
    globalThis.fetch = async () => new Response(null, { status: 304 });
    assert.deepEqual(await api("/api/mailboxes/test/messages"), { notModified: true });
  } finally {
    globalThis.fetch = original;
  }
});
