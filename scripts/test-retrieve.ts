// Retrieval smoke test: stores two topically distinct documents, then verifies
// semantic search actually discriminates between them — not just "returns something."
// Run with: npx tsx scripts/test-retrieve.ts
process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";
import path from "node:path";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";
import { embedAll } from "../lib/embed";
import { storeDocument } from "../lib/store";
import { retrieve } from "../lib/retrieve";
import { getPool } from "../lib/db";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

async function ingest(filename: string): Promise<string> {
  const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", filename));
  const text = normalizeText(await extractText(buf, "text/plain"));
  const chunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
  const embeddings = await embedAll(chunks.map((c) => c.content));
  const docId = await storeDocument(filename, "text/plain", chunks, embeddings);
  console.log(`Ingested ${filename} -> ${chunks.length} chunks, document ${docId}`);
  return docId;
}

async function main() {
  console.log("Ingesting two topically unrelated documents...");
  const docIds = [await ingest("sample.txt"), await ingest("sample2.txt")];

  try {
    console.log("\n=== Query: \"How do I get a refund?\" ===");
    const refundHits = await retrieve("How do I get a refund?", 3);
    refundHits.forEach((h) => console.log(`  [${h.similarity.toFixed(3)}] ${h.filename}: ${h.content.slice(0, 70)}...`));
    assert(refundHits.length > 0, "returns results");
    assert(refundHits[0].filename === "sample.txt", "top hit for a refund question comes from the product doc, not the hiking doc");
    assert(refundHits[0].content.toLowerCase().includes("refund"), "top hit's content actually mentions refunds");

    console.log("\n=== Query: \"What gear should I bring on a hike?\" ===");
    const gearHits = await retrieve("What gear should I bring on a hike?", 3);
    gearHits.forEach((h) => console.log(`  [${h.similarity.toFixed(3)}] ${h.filename}: ${h.content.slice(0, 70)}...`));
    assert(gearHits.length > 0, "returns results");
    assert(gearHits[0].filename === "sample2.txt", "top hit for a gear question comes from the hiking doc, not the product doc");

    console.log("\n=== Similarity floor: unrelated query with a high minSimilarity ===");
    const offTopic = await retrieve("How do I file my taxes in Germany?", 5, 0.5);
    console.log(`  -> ${offTopic.length} hits above 0.5 similarity`);
    assert(offTopic.length === 0, "an unrelated query with a similarity floor returns nothing, instead of forcing irrelevant chunks into the prompt");

    console.log("\n=== Confirm the HNSW index is usable by the query planner ===");
    const dummyVec = "[" + new Array(1536).fill(0).join(",") + "]";

    // With only a handful of rows in the table, Postgres's planner will
    // honestly (and correctly) prefer a sequential scan — for a table this
    // small, scanning everything IS cheaper than walking an index. That's
    // expected, not a bug; it only matters once the table has real volume.
    const naturalPlan = await getPool().query(`EXPLAIN SELECT id FROM chunks ORDER BY embedding <=> $1 LIMIT 5`, [dummyVec]);
    console.log("Planner's natural choice on this tiny table:");
    console.log(naturalPlan.rows.map((r) => r["QUERY PLAN"]).join("\n"));

    // Force the planner to avoid seq scans, to prove the HNSW index itself
    // is valid and usable — this is the real assertion: can the index serve
    // this query at all, independent of whether the planner picks it today.
    await getPool().query(`SET enable_seqscan = off`);
    const forcedPlan = await getPool().query(`EXPLAIN SELECT id FROM chunks ORDER BY embedding <=> $1 LIMIT 5`, [dummyVec]);
    await getPool().query(`SET enable_seqscan = on`);
    const forcedPlanText = forcedPlan.rows.map((r) => r["QUERY PLAN"]).join("\n");
    console.log("\nWith seq scan disabled (proves the index is valid and usable):");
    console.log(forcedPlanText);
    assert(forcedPlanText.includes("Index Scan") && forcedPlanText.includes("hnsw"), "the HNSW index can serve this query when the planner is forced to use an index");
  } finally {
    console.log("\nCleaning up test documents...");
    for (const id of docIds) {
      await getPool().query(`DELETE FROM documents WHERE id = $1`, [id]);
    }
    await getPool().end();
  }
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await getPool().end();
  process.exit(1);
});
