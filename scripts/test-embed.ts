// Manual smoke test for lib/embed.ts — calls the REAL Gemini embeddings API (free tier).
// Run with: npx tsx scripts/test-embed.ts
process.loadEnvFile(".env.local");

import { embedAll } from "../lib/embed";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  if (!process.env.EMBEDDINGS_API_KEY || process.env.EMBEDDINGS_API_KEY.includes("your-gemini-key")) {
    console.log("SKIPPED — EMBEDDINGS_API_KEY not set in .env.local");
    return;
  }

  const inputs = ["a cat", "a dog", "a commercial airplane"];
  console.log(`Embedding ${inputs.length} strings via the real Gemini API...`);
  const vectors = await embedAll(inputs);

  assert(vectors.length === inputs.length, "returned one embedding per input, in order");
  assert(vectors.every((v) => v.length === 1536), "every embedding is 1536-dimensional (matches our vector(1536) column)");

  const [catVec, dogVec, planeVec] = vectors;
  const catDog = cosineSimilarity(catVec, dogVec);
  const catPlane = cosineSimilarity(catVec, planeVec);
  console.log(`\ncosine("a cat", "a dog")              = ${catDog.toFixed(4)}`);
  console.log(`cosine("a cat", "a commercial airplane") = ${catPlane.toFixed(4)}`);
  assert(catDog > catPlane, "semantically related pair (cat/dog) scores higher than unrelated pair (cat/airplane)");

  // Same input twice should produce (near) identical vectors — sanity check on determinism.
  const [dup1, dup2] = await embedAll(["a cat", "a cat"]);
  const selfSim = cosineSimilarity(dup1, dup2);
  console.log(`cosine("a cat", "a cat")              = ${selfSim.toFixed(4)}`);
  assert(selfSim > 0.999, "identical input embeds to (near) identical vectors");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
