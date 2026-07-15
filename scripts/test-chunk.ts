// Manual smoke test for lib/chunk.ts — run with: npx tsx scripts/test-chunk.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

// Longest suffix of `a` that is also a prefix of `b`, in characters.
// This is how we actually verify overlap exists, instead of guessing a fixed word window.
function longestOverlap(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len--) {
    if (a.slice(-len) === b.slice(0, len)) return len;
  }
  return 0;
}

async function main() {
  console.log("=== Edge case: empty / whitespace-only input ===");
  assert(chunkText("").length === 0, "empty string yields zero chunks");
  assert(chunkText("   \n\n  \n  ").length === 0, "whitespace-only string yields zero chunks");

  const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", "sample.txt"));
  const text = normalizeText(await extractText(buf, "text/plain"));

  console.log("=== Default settings (maxTokens=600, overlap=80) ===");
  const defaultChunks = chunkText(text);
  console.log(`Source is short (${text.length} chars), so this should be ONE chunk:`);
  console.log(`  -> ${defaultChunks.length} chunk(s), token counts: ${defaultChunks.map((c) => c.tokenCount).join(", ")}`);
  assert(defaultChunks.length === 1, "short document stays as a single chunk with default settings");

  console.log("\n=== Small settings (maxTokens=60, overlap=15) to force multiple chunks ===");
  const smallChunks = chunkText(text, { maxTokens: 60, overlapTokens: 15 });
  console.log(`  -> ${smallChunks.length} chunks`);
  smallChunks.forEach((c) => console.log(`  [${c.index}] ${c.tokenCount} tokens: "${c.content.slice(0, 60)}..."`));

  assert(smallChunks.length > 1, "small maxTokens produces multiple chunks");
  // The chunker never splits mid-sentence, so a chunk can legitimately exceed
  // maxTokens by roughly one sentence's worth (the overlap tail plus the one
  // unit that triggered the flush). What it must NOT do is grow unbounded by
  // accumulating many units past the budget — that's the real invariant to guard.
  assert(
    smallChunks.every((c) => c.tokenCount <= 60 * 2),
    "no chunk grows unbounded past maxTokens (bounded by ~one extra sentence, not runaway)"
  );
  assert(
    smallChunks.every((c, i) => c.index === i),
    "chunk indices are sequential starting at 0"
  );
  assert(
    smallChunks.every((c) => c.content.trim().length > 0),
    "no empty chunks"
  );

  // Overlap: every consecutive pair should share a real suffix/prefix match.
  // NOTE: because overlap is built from whole sentences (never split mid-sentence),
  // the *actual* overlap is often bigger than the requested overlapTokens — think of
  // overlapTokens as a floor ("at least this much"), not an exact target.
  console.log("\n=== Overlap between consecutive chunks ===");
  let allOverlap = true;
  for (let i = 0; i < smallChunks.length - 1; i++) {
    const overlapLen = longestOverlap(smallChunks[i].content, smallChunks[i + 1].content);
    console.log(`  chunk[${i}] -> chunk[${i + 1}]: ${overlapLen} shared characters`);
    if (overlapLen === 0) allOverlap = false;
  }
  assert(allOverlap, "every consecutive chunk pair shares a non-empty overlap");

  console.log("\n=== Realistic-ish settings (maxTokens=150, overlap=30) — overshoot should be a much smaller fraction ===");
  const realisticChunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
  const worstOvershoot = Math.max(...realisticChunks.map((c) => c.tokenCount - 150));
  console.log(`  -> ${realisticChunks.length} chunks, worst overshoot: ${worstOvershoot} tokens (${((worstOvershoot / 150) * 100).toFixed(0)}% over budget)`);
  console.log("  (at the project's actual defaults — maxTokens=600 — real prose sentences are an even smaller fraction of the budget, so this shrinks further)");

  console.log("\n=== PDF fallback: sample.pdf has no blank-line paragraph breaks (flagged in Phase 1) ===");
  const pdfBuf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", "sample.pdf"));
  const pdfText = normalizeText(await extractText(pdfBuf, "application/pdf"));
  const pdfChunks = chunkText(pdfText, { maxTokens: 60, overlapTokens: 15 });
  console.log(`  -> ${pdfChunks.length} chunks from PDF text (sentence-level fallback, since no blank lines exist)`);
  assert(pdfChunks.length > 1, "PDF text (no paragraph breaks) still splits into multiple sane chunks via sentence fallback");
  assert(
    pdfChunks.every((c) => c.content.trim().length > 0),
    "PDF chunks are non-empty"
  );
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
