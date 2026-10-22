import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sign,
  verify,
  hash,
  requireProof,
  credentials,
} from "../lib/security.ts";
const secret = "test-only-signing-key";
test("canvas receipts reject forgery, expiration and different credentials or targets", () => {
  const principal = hash("brew_test_account_a"),
    p = {
      kind: "canvas",
      principal,
      brandId: "brand-a",
      targetKey: "email:email-a",
      sessionId: "session-a",
      exp: Date.now() + 10000,
    },
    token = sign(p, secret);
  assert.equal(
    requireProof(token, secret, principal, "brand-a", "email:email-a")
      .sessionId,
    "session-a",
  );
  assert.equal(verify(sign({ ...p, exp: 1 }, secret), secret, "canvas"), null);
  assert.equal(verify(token + "x", secret, "canvas"), null);
  for (const args of [
    [hash("brew_test_account_b"), "brand-a", "email:email-a"],
    [principal, "brand-b", "email:email-a"],
    [principal, "brand-a", "email:email-b"],
  ])
    assert.throws(
      () => requireProof(token, secret, ...args),
      (e) => e.code === "SESSION_NOT_OWNED",
    );
});
test("credentials require exact origin, JSON and an explicit bearer key", () => {
  const origin = "https://demo.example",
    headers = {
      origin,
      "content-type": "application/json",
      authorization: "Bearer brew_test_account_a",
    };
  assert.equal(credentials({ headers }, origin), "brew_test_account_a");
  for (const patch of [
    { origin: "https://attacker.example" },
    { authorization: "" },
    { "content-type": "text/plain" },
  ])
    assert.throws(() =>
      credentials({ headers: { ...headers, ...patch } }, origin),
    );
});
