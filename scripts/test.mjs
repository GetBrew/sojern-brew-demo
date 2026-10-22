import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Separate processes keep each test file's fetch mock and environment isolated.
// Running the file directly also retains Node's test registration across TS imports.
for (const file of (await readdir("tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()) {
  const result = spawnSync(process.execPath, ["tests/" + file], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
