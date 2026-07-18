// Closes gaps the per-layer tests don't cover: retrieve() -> assemble() wired together for
// real, the transaction ROLLBACK path actually firing (not just the happy path), and
// markDocumentFailed actually working. Run with: npx tsx scripts/test-integration.ts
process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";
import path from "node:path";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";
import { embedAll } from "../lib/embed";
import { storeDocument, markDocumentFailed } from "../lib/store";
import { retrieve } from "../lib/retrieve";
import { assemble } from "../lib/prompt";
import { getPool } from "../lib/db";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  let docId: string | undefined;
  try {
    // --- retrieve() -> assemble() wired together for real, not with fake Hit objects ---
    console.log("=== Real end-to-end: ingest -> retrieve -> assemble ===");
    const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", "sample.txt"));
    const text = normalizeText(await extractText(buf, "text/plain"));
    const chunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
    const embeddings = await embedAll(chunks.map((c) => c.content));
    docId = await storeDocument("sample.txt", "text/plain", chunks, embeddings);

    const hits = await retrieve("What is the refund policy?", 3);
    const prompt = assemble("What is the refund policy?", hits);

    assert(hits.length > 0, "retrieve() returns real hits from the real DB");
    assert(prompt.citations.length === hits.length, "assemble() keeps all hits (well under budget)");
    assert(prompt.user.includes("refund"), "the real assembled prompt actually contains refund-related content");
    assert(/\[1\]/.test(prompt.user), "the real assembled prompt has real citation markers");
    console.log("\n--- Actual assembled system prompt ---");
    console.log(prompt.system);
    console.log("\n--- Actual assembled user prompt (this is what would be sent to the LLM) ---");
    console.log(prompt.user);

    // --- Rollback: previously UNTESTED. Force a real DB-level failure mid-transaction
    // (wrong vector dimension violates the vector(1536) column) and confirm the document
    // row does NOT persist — i.e. the transaction genuinely rolled back, not just the chunks. ---
    console.log("\n=== Transaction rollback (previously untested — only the happy path had been run) ===");
    const badEmbeddings = chunks.map(() => new Array(10).fill(0)); // wrong dimension on purpose
    let rollbackWorked = false;
    try {
      await storeDocument("bad-doc.txt", "text/plain", chunks, badEmbeddings);
    } catch (err) {
      rollbackWorked = true;
      console.log(`  Got the expected DB error: ${(err as Error).message.split("\n")[0]}`);
    }
    assert(rollbackWorked, "storeDocument() throws when the DB rejects a bad insert (wrong vector dimension)");

    const orphanCheck = await getPool().query(`SELECT count(*) FROM documents WHERE filename = 'bad-doc.txt'`);
    assert(Number(orphanCheck.rows[0].count) === 0, "ROLLBACK actually removed the documents row too — no orphaned 'ready' document with zero chunks");

    // --- markDocumentFailed: previously written but never actually called ---
    console.log("\n=== markDocumentFailed (previously written, never actually exercised) ===");
    await markDocumentFailed(docId, "simulated parse failure for testing");
    const failedRow = await getPool().query(`SELECT status, error FROM documents WHERE id = $1`, [docId]);
    assert(failedRow.rows[0].status === "failed", "markDocumentFailed actually flips status to 'failed'");
    assert(failedRow.rows[0].error === "simulated parse failure for testing", "error message is actually persisted");
  } finally {
    if (docId) await getPool().query(`DELETE FROM documents WHERE id = $1`, [docId]);
    await getPool().query(`DELETE FROM documents WHERE filename = 'bad-doc.txt'`); // safety net, should already be 0 rows
    await getPool().end();
  }
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await getPool().end();
  process.exit(1);
});
