"use client";

import { useRef, useState } from "react";

interface Citation {
  id: string;
  content: string;
  filename: string;
  documentId: string;
  chunkIndex: number;
  similarity: number;
}

type Status = "idle" | "searching" | "streaming" | "done" | "error";

export default function ChatPanel({ hasDocuments }: { hasDocuments: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const citationRefs = useRef<Record<number, HTMLDivElement | null>>({});

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || status === "searching" || status === "streaming") return;

    setAnswer("");
    setCitations([]);
    setErrorMessage(null);
    setStatus("searching");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? `Request failed (${res.status})`);
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

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
            setCitations(data);
            setStatus("streaming");
          }
          if (event === "token") {
            setAnswer((prev) => prev + data);
          }
          if (event === "error") {
            setErrorMessage(data.message ?? "The model returned an error.");
          }
          if (event === "done") {
            setStatus("done");
          }
        }
      }
    } catch {
      setErrorMessage("Something went wrong while streaming the answer.");
      setStatus("error");
    }
  }

  function scrollToCitation(n: number) {
    citationRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" });
    citationRefs.current[n]?.classList.add("ring-2", "ring-zinc-900", "dark:ring-zinc-100");
    setTimeout(() => citationRefs.current[n]?.classList.remove("ring-2", "ring-zinc-900", "dark:ring-zinc-100"), 1200);
  }

  const answerParts = answer.split(/(\[\d+\])/g);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!hasDocuments}
          placeholder={hasDocuments ? "Ask a question about your documents…" : "Upload a document first"}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={!hasDocuments || status === "searching" || status === "streaming"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Ask
        </button>
      </form>

      {status === "searching" && (
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-zinc-400" />
          Searching your documents…
        </p>
      )}

      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {answer && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          {answerParts.map((part, i) => {
            const match = part.match(/^\[(\d+)\]$/);
            if (match) {
              const n = Number(match[1]);
              return (
                <button
                  key={i}
                  onClick={() => scrollToCitation(n)}
                  className="mx-0.5 rounded bg-zinc-100 px-1 font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {part}
                </button>
              );
            }
            return <span key={i}>{part}</span>;
          })}
          {status === "streaming" && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-400" />}
        </div>
      )}

      {status === "done" && citations.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Nothing relevant was found in your documents for this question.
        </p>
      )}

      {citations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">Sources</p>
          {citations.map((c, i) => (
            <div
              key={c.id}
              ref={(el) => {
                citationRefs.current[i + 1] = el;
              }}
              className="rounded-lg border border-zinc-200 p-3 text-xs transition-shadow dark:border-zinc-800"
            >
              <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">
                [{i + 1}] {c.filename} · similarity {c.similarity.toFixed(2)}
              </p>
              <p className="text-zinc-500 dark:text-zinc-500">{c.content.slice(0, 220)}…</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
