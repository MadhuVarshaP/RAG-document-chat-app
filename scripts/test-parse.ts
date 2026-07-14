// Manual smoke test for lib/parse.ts — run with: npx tsx scripts/test-parse.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractText, normalizeText } from "../lib/parse";

const fixtures: { file: string; contentType: string }[] = [
  { file: "sample.txt", contentType: "text/plain" },
  { file: "sample.md", contentType: "text/markdown" },
  { file: "sample.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { file: "sample.pdf", contentType: "application/pdf" },
];

async function main() {
  for (const { file, contentType } of fixtures) {
    const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", file));
    const raw = await extractText(buf, contentType);
    const clean = normalizeText(raw);
    console.log(`\n=== ${file} (${contentType}) ===`);
    console.log(`raw length: ${raw.length}, normalized length: ${clean.length}`);
    console.log(clean.slice(0, 200) + (clean.length > 200 ? "..." : ""));
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
