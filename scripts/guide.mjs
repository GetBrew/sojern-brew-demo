import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function loadGuide() {
  const markdown = await readFile(
    new URL("../web/implementation-guide.md", import.meta.url),
    "utf8",
  );
  const section = markdown
    .split("## Prompts for implementation agents\n")[1]
    ?.split("\n## Canonical resources")[0];
  if (!section)
    throw Error("The implementation guide needs its agent prompt section.");
  const brief = section.trim().split("\n\n")[0];
  const headings = [...section.matchAll(/^### Prompt (\d+) - (.+)\n/gm)];
  const prompts = headings.map((heading, index) => {
    const body = section
      .slice(heading.index + heading[0].length, headings[index + 1]?.index)
      .trim();
    if (!body.startsWith("> "))
      throw Error("Each agent prompt must be a complete quoted brief.");
    return {
      number: heading[1],
      title: heading[2],
      text: body.replace(/^> ?/gm, "").replace(/\s*\n\s*/g, " "),
    };
  });
  if (prompts.map((p) => p.number).join() !== "1,2,3,4")
    throw Error(
      "Expected four ordered, complete agent prompts in the Markdown guide.",
    );
  return { markdown, brief, prompts };
}
export async function verifyHandout(markdown) {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("web/guide-handout.json", root), "utf8"),
  );
  const pdf = await readFile(
    new URL("public/sojern-implementation-guide.pdf", root),
  );
  if (
    manifest.markdownSha256 !== digest(markdown) ||
    manifest.pdfSha256 !== digest(pdf)
  )
    throw Error(
      "The PDF is stale. Run python3 scripts/build-pdf.py before building.",
    );
}
