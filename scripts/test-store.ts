// Full pipeline smoke test: parse -> chunk -> embed (real API) -> store -> verify in Postgres -> cascade delete.
// Run with: npx tsx scripts/test-store.ts
process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";
import { embedAll } from "../lib/embed";
import { storeDocument } from "../lib/store";
import { getPool } from "../lib/db";

const sessionId = randomUUID();

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", "sample.txt"));
  const text = normalizeText(await extractText(buf, "text/plain"));
  const chunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
  console.log(`Parsed + chunked sample.txt into ${chunks.length} chunks.`);

  console.log("Embedding via the real Gemini API...");
  const embeddings = await embedAll(chunks.map((c) => c.content));

  const docId = await storeDocument("sample.txt", "text/plain", chunks, embeddings, sessionId);
  console.log(`Stored as document ${docId}`);

  // --- Verify what actually landed in Postgres, not just "no exception was thrown" ---
  const docRes = await getPool().query(`SELECT filename, status, chunk_count FROM documents WHERE id = $1`, [docId]);
  assert(docRes.rows.length === 1, "document row exists");
  assert(docRes.rows[0].status === "ready", "document status is 'ready'");
  assert(docRes.rows[0].chunk_count === chunks.length, "document.chunk_count matches actual chunk count");

  const chunkRes = await getPool().query(
    `SELECT chunk_index, content, vector_dims(embedding) AS dims FROM chunks WHERE document_id = $1 ORDER BY chunk_index`,
    [docId]
  );
  assert(chunkRes.rows.length === chunks.length, "correct number of chunk rows inserted");
  assert(
    chunkRes.rows.every((r) => r.dims === 1536),
    "every stored embedding is 1536-dimensional"
  );
  assert(
    chunkRes.rows.every((r, i) => r.chunk_index === i),
    "chunk_index is sequential and matches insertion order"
  );
  assert(chunkRes.rows[0].content === chunks[0].content, "stored content matches the chunk text exactly (round-trips through Postgres text column)");

  // --- Cascade delete: removing the document should remove its chunks too ---
  await getPool().query(`DELETE FROM documents WHERE id = $1`, [docId]);
  const afterDelete = await getPool().query(`SELECT count(*) FROM chunks WHERE document_id = $1`, [docId]);
  assert(Number(afterDelete.rows[0].count) === 0, "deleting the document cascade-deletes its chunks (ON DELETE CASCADE)");

  await getPool().end();
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await getPool().end();
  process.exit(1);
});
