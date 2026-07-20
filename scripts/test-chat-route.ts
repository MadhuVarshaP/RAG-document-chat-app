// End-to-end test of the actual HTTP route: spins up `next dev`, ingests a real document,
// POSTs a real question to /api/chat, and parses the real SSE stream from the real
// Gemini API. This is the first test that exercises the app as a real user's browser would.
// Run with: npx tsx scripts/test-chat-route.ts
process.loadEnvFile(".env.local");

import { spawn, ChildProcess } from "node:child_process";
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

function waitForServerReady(proc: ChildProcess, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for dev server to start")), timeoutMs);
    let resolved = false;
    // IMPORTANT: keep draining stdout/stderr for the child's entire lifetime.
    // Next.js logs every request to stdout — if nobody reads that pipe after
    // the ready-check, the OS pipe buffer fills up and the child process can
    // block on its own stdout.write(), silently stalling request handling.
    // (This caused a real hang here: curl against the same server worked
    // fine, but this script's server appeared to freeze on the first request.)
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (!resolved && text.includes("Ready in")) {
        resolved = true;
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr?.on("data", (d) => process.stderr.write(d));
  });
}

async function main() {
  console.log("Starting `next dev`...");
  const server = spawn("npx", ["next", "dev"], {
    cwd: path.join(__dirname, ".."),
    env: process.env,
  });
  let docId: string | undefined;

  try {
    await waitForServerReady(server);
    console.log("Dev server ready.\n");

    console.log("Ingesting a real document...");
    const buf = readFileSync(path.join(__dirname, "..", "tests", "fixtures", "sample.txt"));
    const text = normalizeText(await extractText(buf, "text/plain"));
    const chunks = chunkText(text, { maxTokens: 150, overlapTokens: 30 });
    const embeddings = await embedAll(chunks.map((c) => c.content));
    docId = await storeDocument("sample.txt", "text/plain", chunks, embeddings, sessionId);
    console.log(`Ingested as ${docId}\n`);

    console.log("POSTing a real question to /api/chat...\n");
    // Same session_id as a cookie so the route sees the document just ingested.
    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ question: "What is the refund policy?" }),
    });

    assert(res.status === 200, "route returns 200");
    assert(res.headers.get("content-type") === "text/event-stream", "route returns text/event-stream");

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let citations: unknown[] = [];
    let answer = "";
    let tokenEventCount = 0;
    let sawDone = false;
    let sawCitationsBeforeTokens = false;
    let citationsReceived = false;

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
        if (event === "citations") {
          citations = data;
          citationsReceived = true;
        }
        if (event === "token") {
          if (citationsReceived && tokenEventCount === 0) sawCitationsBeforeTokens = true;
          tokenEventCount++;
          answer += data;
          process.stdout.write(data);
        }
        if (event === "done") sawDone = true;
      }
    }
    console.log("\n");

    assert(Array.isArray(citations) && citations.length > 0, "citations event carried real citation data");
    assert(sawCitationsBeforeTokens, "citations event arrives before the first token (so the UI can render sources immediately)");
    assert(tokenEventCount > 1, `answer streamed as multiple token events (got ${tokenEventCount}), not one big blob`);
    assert(sawDone, "stream ends with a done event");
    assert(answer.toLowerCase().includes("14 day") || answer.toLowerCase().includes("refund"), "the real LLM answer actually reflects the retrieved context");
  } finally {
    if (docId) await getPool().query(`DELETE FROM documents WHERE id = $1`, [docId]);
    await getPool().end();
    server.kill();
  }
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  await getPool().end();
  process.exit(1);
});
