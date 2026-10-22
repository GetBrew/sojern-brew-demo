import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/demo.ts";
import { sign, hash } from "../lib/security.ts";
const secret = "local-test-signing-key";
process.env.DEMO_SESSION_SECRET = secret;
process.env.DEMO_ORIGIN = "https://demo.example";
process.env.BREW_API_KEY = "brew_must_never_be_used";
let calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({
    url: String(url),
    headers: Object.fromEntries(new Headers(options.headers)),
  });
  return Response.json({
    success: true,
    data: { data: [], pagination: { limit: 50, cursor: null, hasMore: false } },
  });
};
async function call(body, { method = "POST", headers = {} } = {}) {
  const req = {
    method,
    url: "/api/demo",
    body,
    headers: {
      origin: "https://demo.example",
      "content-type": "application/json",
      authorization: "Bearer brew_test_account_a",
      ...headers,
    },
  };
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.raw = s;
      this.data = JSON.parse(s);
    },
  };
  await handler(req, res);
  return res;
}
test("missing credentials never fall back to the deployment key", async () => {
  calls = [];
  const r = await call(
    { action: "brands" },
    { headers: { authorization: "" } },
  );
  assert.equal(r.statusCode, 401);
  assert.equal(calls.length, 0);
});
test("GET and cross-origin requests cannot proxy API calls", async () => {
  calls = [];
  assert.equal(
    (await call({ action: "brands" }, { method: "GET" })).statusCode,
    405,
  );
  assert.equal(
    (
      await call(
        { action: "brands" },
        { headers: { origin: "https://attacker.example" } },
      )
    ).statusCode,
    403,
  );
  assert.equal(calls.length, 0);
});
test("each request uses only its supplied key and explicit brand scope", async () => {
  calls = [];
  for (const key of ["brew_test_account_a", "brew_test_account_b"]) {
    const r = await call(
      { action: "emails", brandId: "brand-" + key.slice(-1) },
      { headers: { authorization: "Bearer " + key } },
    );
    assert.equal(r.statusCode, 200);
    assert.ok(!r.raw.includes(key));
    assert.equal(r.headers["Cache-Control"], "no-store");
  }
  assert.deepEqual(
    calls.map((c) => [c.headers.authorization, c.headers["x-brand-id"]]),
    [
      ["Bearer brew_test_account_a", "brand-a"],
      ["Bearer brew_test_account_b", "brand-b"],
    ],
  );
});
test("forged and cross-account canvas receipts fail before contacting Brew", async () => {
  calls = [];
  const p = sign(
    {
      kind: "canvas",
      principal: hash("brew_test_account_b"),
      brandId: "brand-a",
      targetKey: "email:email-a",
      sessionId: "session-a",
      exp: Date.now() + 10000,
    },
    secret,
  );
  for (const proof of ["forged", p]) {
    const r = await call({
      action: "revoke",
      brandId: "brand-a",
      target: { type: "email", emailId: "email-a" },
      proof,
    });
    assert.equal(r.statusCode, 403);
  }
  assert.equal(calls.length, 0);
});
test("invalid extraction and unsupported updates do not contact Brew", async () => {
  calls = [];
  for (const url of [
    "http://localhost",
    "https://127.0.0.1",
    "https://user:password@example.com",
  ])
    assert.equal(
      (await call({ action: "extract", url, actionId: "test" })).statusCode,
      400,
    );
  assert.equal(
    (
      await call({
        action: "brandPatch",
        brandId: "brand-a",
        patch: { unsupported: true },
      })
    ).statusCode,
    400,
  );
  assert.equal(calls.length, 0);
});

test("Vercel body-parser exceptions and malformed raw JSON return 400", async () => {
  calls = [];
  let r = await call("{");
  assert.equal(r.statusCode, 400);
  const req = {
    method: "POST",
    url: "/api/demo",
    headers: {
      origin: "https://demo.example",
      "content-type": "application/json",
      authorization: "Bearer brew_test_account_a",
    },
    get body() {
      throw new Error("Vercel body parser rejected JSON");
    },
  };
  const res = {
    setHeader() {},
    end(value) {
      this.data = JSON.parse(value);
    },
  };
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error.code, "INVALID_INPUT");
  assert.equal(calls.length, 0);
});
test("non-object JSON bodies return 400 before contacting Brew", async () => {
  calls = [];
  for (const body of ["null", "true", "42", "[]", null, true, 42, []])
    assert.equal((await call(body)).statusCode, 400);
  assert.equal(calls.length, 0);
});
