// Retrieval-quality eval harness: measures Recall@k and MRR against a small
// labeled question set (eval/dataset.json), so chunk size, overlap, and top-k
// can be tuned against real numbers instead of guessing whether retrieval
// "looks right." Ingests the fixture documents fresh, runs every question
// through the real retrieve(), scores it, then cleans up.
//
// Tune via env vars, e.g.:
//   EVAL_MAX_TOKENS=150 EVAL_OVERLAP_TOKENS=30 EVAL_TOP_K=3 npx tsx eval/run.ts
process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";
import { embedAll } from "../lib/embed";
import { storeDocument } from "../lib/store";
import { retrieve } from "../lib/retrieve";
import { getPool } from "../lib/db";

const sessionId = randomUUID();

interface EvalCase {
  question: string;
  expectedFilename: string;
}

const MAX_TOKENS = Number(process.env.EVAL_MAX_TOKENS) || 600;
const OVERLAP_TOKENS = Number(process.env.EVAL_OVERLAP_TOKENS) || 80;
const TOP_K = Number(process.env.EVAL_TOP_K) || 6;

async function ingestFixture(filename: string): Promise<string> {
  const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", filename));
  const text = normalizeText(await extractText(buf, "text/plain"));
  const chunks = chunkText(text, { maxTokens: MAX_TOKENS, overlapTokens: OVERLAP_TOKENS });
  const embeddings = await embedAll(chunks.map((c) => c.content));
  return storeDocument(filename, "text/plain", chunks, embeddings, sessionId);
}

async function main() {
  const dataset: EvalCase[] = JSON.parse(readFileSync(path.join(__dirname, "dataset.json"), "utf8"));
  const fixtures = [...new Set(dataset.map((c) => c.expectedFilename))];

  console.log(`Config: maxTokens=${MAX_TOKENS}, overlapTokens=${OVERLAP_TOKENS}, topK=${TOP_K}`);
  console.log(`Ingesting ${fixtures.length} fixture documents fresh...`);
  const docIds: string[] = [];
  for (const f of fixtures) docIds.push(await ingestFixture(f));

  try {
    let hits = 0;
    let reciprocalRankSum = 0;
    console.log(`\nRunning ${dataset.length} eval questions...\n`);

    for (const c of dataset) {
      const results = await retrieve(c.question, sessionId, TOP_K);
      const rankIndex = results.findIndex((r) => r.filename === c.expectedFilename);
      const found = rankIndex !== -1;
      if (found) {
        hits++;
        reciprocalRankSum += 1 / (rankIndex + 1);
      }
      const marker = found ? `PASS (rank ${rankIndex + 1})` : "FAIL (not in top-k)";
      console.log(`${marker.padEnd(20)} "${c.question}" -> expected ${c.expectedFilename}`);
    }

    const recallAtK = hits / dataset.length;
    const mrr = reciprocalRankSum / dataset.length;

    console.log(`\n=== Results ===`);
    console.log(`Recall@${TOP_K}: ${(recallAtK * 100).toFixed(1)}% (${hits}/${dataset.length} questions found the right document in the top ${TOP_K})`);
    console.log(`MRR: ${mrr.toFixed(3)} (1.0 = always ranked #1, 0 = never found)`);
  } finally {
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
