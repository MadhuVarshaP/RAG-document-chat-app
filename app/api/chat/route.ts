import { retrieve } from "@/lib/retrieve";
import { assemble } from "@/lib/prompt";

const MODEL = "claude-sonnet-5";

export async function POST(req: Request) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question is required" }), { status: 400 });
  }

  const hits = await retrieve(question, 6, 0.2);
  const { system, user, citations } = assemble(question, hits);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.LLM_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      stream: true,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: `LLM API ${upstream.status}: ${errText}` }), { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      // Send citations first so the UI can render sources before any tokens arrive.
      controller.enqueue(enc.encode(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`));

      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the last (possibly partial) line for the next read

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            const evt = JSON.parse(jsonStr);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              controller.enqueue(enc.encode(`event: token\ndata: ${JSON.stringify(evt.delta.text)}\n\n`));
            } else if (evt.type === "error") {
              controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify(evt.error)}\n\n`));
            }
          }
        }
      } finally {
        controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
