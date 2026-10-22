import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("the emitted ESM function loads its dependencies and rejects anonymous calls", async () => {
  mkdirSync(".artifacts", { recursive: true });
  const output = mkdtempSync(".artifacts/compiled-api-");
  try {
    execFileSync(process.execPath, [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "false",
      "--outDir",
      output,
    ]);
    const { default: handler } = await import(
      pathToFileURL(resolve(output, "api/demo.js")).href
    );
    process.env.DEMO_ORIGIN = "https://demo.example";
    process.env.DEMO_SESSION_SECRET = "compiled-test-only";
    const res = {
      setHeader() {},
      end(raw) {
        this.data = JSON.parse(raw);
      },
    };
    await handler(
      {
        method: "POST",
        url: "/api/demo",
        headers: {
          origin: "https://demo.example",
          "content-type": "application/json",
        },
        body: { action: "brands" },
      },
      res,
    );
    assert.equal(res.statusCode, 401);
    assert.equal(res.data.error.code, "API_KEY_REQUIRED");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
