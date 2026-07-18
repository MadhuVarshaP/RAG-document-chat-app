// Unit test for lib/prompt.ts — deterministic, no network/DB (matches the guide's own
// testing tier for the prompt assembler: this is pure logic, so fake Hit objects are enough).
// Run with: npx tsx scripts/test-prompt.ts
import { assemble } from "../lib/prompt";
import type { Hit } from "../lib/retrieve";
import { countTokens } from "../lib/chunk";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

function fakeHit(overrides: Partial<Hit>): Hit {
  return {
    id: "id",
    content: "filler content",
    filename: "doc.txt",
    documentId: "doc-id",
    chunkIndex: 0,
    similarity: 0.9,
    ...overrides,
  };
}

function main() {
  console.log("=== Empty hits: honest fallback, not a broken/empty prompt ===");
  const empty = assemble("What is the refund policy?", []);
  assert(empty.citations.length === 0, "no citations when there are no hits");
  assert(empty.user.toLowerCase().includes("no relevant"), "user prompt says plainly that nothing relevant was found");
  assert(empty.system.toLowerCase().includes("cannot find"), "system prompt instructs the model to say so, not invent an answer");

  console.log("\n=== Citation numbering matches context order ===");
  const hits = [
    fakeHit({ id: "a", content: "Refunds are available within 14 days.", filename: "policy.txt" }),
    fakeHit({ id: "b", content: "Refunds take 5-7 business days to process.", filename: "policy.txt" }),
  ];
  const result = assemble("refund policy?", hits);
  assert(result.citations.length === 2, "both hits kept (well under budget)");
  assert(result.user.includes("[1] (source: policy.txt)\nRefunds are available"), "citation [1] wraps the first hit's content");
  assert(result.user.includes("[2] (source: policy.txt)\nRefunds take 5-7"), "citation [2] wraps the second hit's content");
  assert(result.citations[0].id === "a" && result.citations[1].id === "b", "citations array order matches input order");

  console.log("\n=== Context-window budget is enforced ===");
  // Build hits whose combined size clearly exceeds a small test budget.
  const bigContent = "This is a moderately long sentence about refunds and billing. ".repeat(20); // ~260 tokens
  const bigHits: Hit[] = Array.from({ length: 5 }, (_, i) => fakeHit({ id: `big-${i}`, content: bigContent }));
  const totalTokensIfAllKept = bigHits.reduce((sum, h) => sum + countTokens(h.content), 0);
  const budget = Math.floor(totalTokensIfAllKept / 2); // force some hits to be dropped

  const budgeted = assemble("question", bigHits, { contextTokenBudget: budget });
  assert(budgeted.citations.length < bigHits.length, "budget forces some hits to be dropped rather than overflow the window");
  const keptTokens = budgeted.citations.reduce((sum, h) => sum + countTokens(h.content), 0);
  assert(keptTokens <= budget, "kept citations never exceed the context token budget");
  assert(
    budgeted.citations.every((h, i) => h.id === bigHits[i].id),
    "kept hits are the highest-ranked ones (best-first order preserved, tail dropped)"
  );

  console.log("\n=== Hits comfortably under budget are all kept ===");
  const small = assemble("question", hits, { contextTokenBudget: 6000 });
  assert(small.citations.length === hits.length, "no hits dropped when well under budget");
}

main();
