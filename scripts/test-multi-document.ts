// Answers a real question: when multiple documents are uploaded, does retrieval treat them
// as separate silos, or can a single question pull relevant chunks from several documents
// at once and get one synthesized, cited answer? Spins up the real dev server, ingests two
// topically DISTINCT-but-related documents, and asks a question that only makes sense if
// both are consulted together.
// Run with: npx tsx scripts/test-multi-document.ts
process.loadEnvFile(".env.local");

import { spawn, ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractText, normalizeText } from "../lib/parse";
import { chunkText } from "../lib/chunk";
import { embedAll } from "../lib/embed";
import { storeDocument } from "../lib/store";
import { getPool } from "../lib/db";

function assert(condition: boolean, message: string) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${message}`);
  if (!condition) process.exitCode = 1;
}

function waitForServerReady(proc: ChildProcess, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for dev server to start")), timeoutMs);
    let resolved = false;
    proc.stdout?.on("data", (data: Buffer) => {
      if (!resolved && data.toString().includes("Ready in")) {
        resolved = true;
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr?.on("data", (d) => process.stderr.write(d));
  });
}

async function ingest(filename: string): Promise<string> {
  const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", filename));
  const text = normalizeText(await extractText(buf, "text/plain"));
  const chunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
  const embeddings = await embedAll(chunks.map((c) => c.content));
  const id = await storeDocument(filename, "text/plain", chunks, embeddings);
  console.log(`Ingested ${filename} -> ${chunks.length} chunks`);
  return id;
}

async function main() {
  console.log("Starting `next dev`...");
  const server = spawn("npx", ["next", "dev"], { cwd: path.join(__dirname, ".."), env: process.env });
  const docIds: string[] = [];

  try {
    await waitForServerReady(server);
    console.log("Dev server ready.\n");

    // Two documents about the SAME product but covering entirely different facts —
    // pricing/support in one, security/company info in the other.
    docIds.push(await ingest("sample.txt"));  // pricing, refunds, support
    docIds.push(await ingest("sample3.txt")); // encryption, certifications, company location

    const question = "What are the pricing plans, and separately, is the data encrypted and where is the company based?";
    console.log(`\nAsking a question that spans both documents:\n"${question}"\n`);

    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let citations: { filename: string }[] = [];
    let answer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const raw of events) {
        if (!raw.trim()) continue;
        const [evLine, dataLine] = raw.split("\n");
        const event = evLine.replace("event: ", "");
        const data = JSON.parse(dataLine.replace("data: ", ""));
        if (event === "citations") citations = data;
        if (event === "token") answer += data;
      }
    }

    console.log("--- Answer ---");
    console.log(answer);
    console.log("\n--- Citations (in order returned) ---");
    citations.forEach((c, i) => console.log(`[${i + 1}] ${c.filename}`));

    const filenamesUsed = new Set(citations.map((c) => c.filename));
    assert(filenamesUsed.has("sample.txt"), "citations include a chunk from sample.txt (pricing doc)");
    assert(filenamesUsed.has("sample3.txt"), "citations include a chunk from sample3.txt (security doc) — proves retrieval pulled from BOTH documents for one question");
    assert(filenamesUsed.size === 2, "exactly two distinct source documents were cited, confirming real cross-document mixing, not a fluke");

    const lower = answer.toLowerCase();
    assert(/\$?\d+ ?dollars?|\$\d+/.test(lower) || lower.includes("dollar"), "the single generated answer actually contains pricing info from doc 1");
    assert(lower.includes("encrypt") || lower.includes("aes"), "the SAME answer also contains security info from doc 2");
    assert(lower.includes("toronto"), "the SAME answer also contains the company-location fact from doc 2 — a genuinely synthesized, multi-document answer");
  } finally {
    for (const id of docIds) {
      await getPool().query(`DELETE FROM documents WHERE id = $1`, [id]);
    }
    await getPool().end();
    server.kill();
  }
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await getPool().end();
  process.exit(1);
});
