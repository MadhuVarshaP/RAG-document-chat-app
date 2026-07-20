import { retrieve } from "@/lib/retrieve";
import { assemble } from "@/lib/prompt";
import { getOrCreateSessionId } from "@/lib/session";

// gemini-3.1-flash-lite: free-tier daily quota is tracked separately per model
// per project. gemini-3.5-flash's free quota is only 20 requests/DAY (hit for
// real during this project's own testing — confirmed via the API's own error
// message, not assumed) — flash-lite is the lighter, higher-quota sibling,
// verified empirically to have quota available when 3.5-flash and 2.0-flash
// were both exhausted. gemini-2.5-flash-lite is deprecated (404 for new users).
const MODEL = "gemini-3.1-flash-lite";

export async function POST(req: Request) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question is required" }), { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const hits = await retrieve(question, sessionId, 6, 0.2);
  const { system, user, citations } = assemble(question, hits);

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.LLM_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: system }] },
      }),
    }
  );

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

          // A single "data: {...}" line's JSON can arrive split across two
          // raw network chunks — buffering and only processing complete
          // lines (keeping the last, possibly-partial one for next read)
          // avoids parsing a truncated JSON payload.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            const evt = JSON.parse(jsonStr);
            // Gemini's final chunk (finishReason: STOP) carries an empty text
            // part alongside internal thinking metadata — only forward chunks
            // that actually contain answer text.
            const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              controller.enqueue(enc.encode(`event: token\ndata: ${JSON.stringify(text)}\n\n`));
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
