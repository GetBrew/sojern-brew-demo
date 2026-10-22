import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/demo.ts";
import { sign, hash } from "../lib/security.ts";
const origin = "https://demo.example",
  secret = "test-only-secret";
process.env.DEMO_ORIGIN = origin;
process.env.DEMO_SESSION_SECRET = secret;
let calls = [];
let writeResponse = null;
globalThis.fetch = async (url, options) => {
  const path = new URL(url).pathname,
    body = options.body ? JSON.parse(options.body) : null;
  calls.push({
    path,
    body,
    headers: Object.fromEntries(new Headers(options.headers)),
  });
  if (path.endsWith("/emails") && options.method === "POST" && writeResponse)
    return writeResponse();
  const data = path.endsWith("/brand")
    ? { brandId: "brand-a", ready: true }
    : path.endsWith("/canvas/sessions")
      ? {
          sessionId: "session-a",
          target: body.target,
          embedUrl: "https://brew.new/embed/canvas/session-a",
          bootstrapToken: "test-only",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }
      : {
          emailId: "email-result",
          emailVersionId: "version-result",
          groupId: "grp-a",
        };
  return Response.json(data);
};
async function call(body) {
  const req = {
      method: "POST",
      url: "/api/demo",
      headers: {
        origin,
        "content-type": "application/json",
        authorization: "Bearer brew_test_account_a",
      },
      body: { brandId: "brand-a", ...body },
    },
    res = {
      setHeader() {},
      end(raw) {
        this.data = JSON.parse(raw);
      },
    };
  await handler(req, res);
  return res;
}
test("generation forwards explicit group and template, with stable idempotency", async () => {
  calls = [];
  const input = {
    action: "generate",
    groupId: "grp-a",
    referenceEmailId: "email-template",
    prompt: "Create a French localization.",
    subjectLine: "Votre prochain séjour",
    actionId: "locale-fr-request",
  };
  const result = await call(input);
  assert.equal(
    result.statusCode,
    200,
    JSON.stringify(calls.map((c) => c.path)),
  );
  const created = calls.find((c) => c.path.endsWith("/emails"));
  assert.equal(created.body.referenceEmailId, "email-template");
  assert.equal(created.body.groupId, "grp-a");
  assert.equal(created.body.subjectLine, "Votre prochain séjour");
  assert.ok(created.headers["idempotency-key"]);
  assert.equal(result.data.receipt.emailId, "email-result");
});
test("renames are metadata patches scoped to the supplied brand", async () => {
  calls = [];
  assert.equal(
    (
      await call({
        action: "renameEmail",
        emailId: "email-a",
        name: "French welcome",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call({
        action: "renameGroup",
        groupId: "grp-a",
        name: "Welcome locales",
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    calls.map((c) => c.body),
    [{ title: "French welcome" }, { name: "Welcome locales" }],
  );
  assert.ok(calls.every((c) => c.headers["x-brand-id"] === "brand-a"));
});
test("group canvas grants bind renewal and revocation to the exact target", async () => {
  calls = [];
  const target = { type: "group", groupId: "grp-a" },
    created = await call({ action: "canvas", target, visitorId: "visitor-a" });
  assert.equal(created.statusCode, 200);
  assert.deepEqual(calls[0].body.target, target);
  const proof = sign(
    {
      kind: "canvas",
      principal: hash("brew_test_account_a"),
      brandId: "brand-a",
      targetKey: "group:grp-a",
      sessionId: "session-a",
      exp: Date.now() + 10000,
    },
    secret,
  );
  calls = [];
  assert.equal(
    (
      await call({
        action: "revoke",
        target: { type: "email", emailId: "grp-a" },
        proof,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call({
        action: "canvas",
        target: { type: "group", groupId: "grp-b" },
        sessionId: "session-a",
        visitorId: "visitor-a",
      })
    ).statusCode,
    403,
  );
  assert.equal(calls.length, 0);
});

test("a prose generation response is returned without inventing a saved email", async () => {
  writeResponse = () =>
    Response.json({ response: "Please supply approved hotel facts." });
  try {
    const r = await call({
      action: "generate",
      prompt: "Create an email",
      subjectLine: "Welcome",
      actionId: "prose-request",
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.data.answer, "Please supply approved hotel facts.");
    assert.equal(r.data.receipt, undefined);
  } finally {
    writeResponse = null;
  }
});

test("a committed result error returns saved IDs without repeating generation", async () => {
  calls = [];
  writeResponse = () =>
    Response.json(
      {
        error: {
          code: "EMAIL_RESULT_UNAVAILABLE",
          type: "conflict_error",
          message: "Saved, but the response is unavailable.",
          details: {
            committed: true,
            emailId: "email-committed",
            emailVersionId: "version-committed",
            runId: "run-committed",
          },
        },
      },
      { status: 409 },
    );
  try {
    const r = await call({
      action: "generate",
      prompt: "Create an email",
      subjectLine: "Welcome",
      actionId: "committed-request",
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.data.receipt, {
      emailId: "email-committed",
      emailVersionId: "version-committed",
      runId: "run-committed",
    });
    assert.equal(calls.filter((c) => c.path.endsWith("/emails")).length, 1);
  } finally {
    writeResponse = null;
  }
});
