import { build } from "esbuild";
import { loadGuide, verifyHandout } from "./scripts/guide.mjs";
import { mkdir, copyFile } from "node:fs/promises";
const guide = await loadGuide();
await verifyHandout(guide.markdown);
await mkdir("public", { recursive: true });
for (const file of ["index.html", "styles.css", "favicon.svg"])
  await copyFile("web/" + file, "public/" + file);
await copyFile(
  "node_modules/@brew.new/sdk/dist/embed.js",
  "public/brew-embed.js",
);
await copyFile(
  "web/implementation-guide.md",
  "public/sojern-implementation-guide.md",
);
await build({
  entryPoints: ["web/app.ts"],
  outfile: "public/app.js",
  bundle: true,
  format: "esm",
  minify: true,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    __BREW_AGENT_PROMPTS__: JSON.stringify(guide.prompts),
    __BREW_AGENT_BRIEF__: JSON.stringify(guide.brief),
  },
});
console.log(
  "Built static guide and SDK host; live actions run only in the server function.",
);
