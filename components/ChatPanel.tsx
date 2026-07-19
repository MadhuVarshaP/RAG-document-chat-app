"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Search, Sparkles, BookOpen } from "lucide-react";

interface Citation {
  id: string;
  content: string;
  filename: string;
  documentId: string;
  chunkIndex: number;
  similarity: number;
}

type Status = "idle" | "searching" | "streaming" | "done" | "error";

// Turn "...refund [1]..." into a real markdown link "[\[1\]](#cite-1)" so
// react-markdown renders it as a clickable, properly-escaped "[1]" — the
// backslash-escaped inner brackets avoid any ambiguity with nested link syntax.
function linkifyCitations(text: string): string {
  return text.replace(/\[(\d+)\]/g, (_, n) => `[\\[${n}\\]](#cite-${n})`);
}

export default function ChatPanel({ hasDocuments }: { hasDocuments: boolean }) {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const citationRefs = useRef<Record<number, HTMLDivElement | null>>({});

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || status === "searching" || status === "streaming") return;

    setAskedQuestion(q);
    setQuestion("");
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
    citationRefs.current[n]?.classList.add("ring-2", "ring-primary/40", "border-primary/40");
    setTimeout(() => citationRefs.current[n]?.classList.remove("ring-2", "ring-primary/40", "border-primary/40"), 1200);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!askedQuestion && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <Sparkles className="h-5 w-5 text-accent-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Ask your documents</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {hasDocuments
                ? "Ask anything grounded in what you've uploaded — every answer cites its source."
                : "Upload a document on the left to get started."}
            </p>
          </div>
        )}

        {askedQuestion && (
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <div className="flex justify-end animate-rise-in">
              <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-sm text-foreground">
                {askedQuestion}
              </div>
            </div>

            {status === "searching" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4 animate-pulse" aria-hidden="true" />
                Searching your documents…
              </div>
            )}

            {errorMessage && (
              <p className="rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{errorMessage}</p>
            )}

            {answer && (
              <div className="max-w-none animate-rise-in text-sm leading-relaxed text-foreground">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-primary">{children}</ul>,
                    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-primary">{children}</ol>,
                    li: ({ children }) => <li className="pl-1">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    a: ({ href, children }) => {
                      const match = href?.match(/^#cite-(\d+)$/);
                      if (match) {
                        const n = Number(match[1]);
                        return (
                          <button
                            type="button"
                            onClick={() => scrollToCitation(n)}
                            className="mx-0.5 rounded-md bg-accent px-1 align-baseline text-xs font-medium text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            {children}
                          </button>
                        );
                      }
                      return <a href={href}>{children}</a>;
                    },
                  }}
                >
                  {linkifyCitations(answer)}
                </ReactMarkdown>
                {status === "streaming" && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />
                )}
              </div>
            )}

            {status === "done" && citations.length === 0 && (
              <p className="animate-rise-in rounded-2xl bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                Nothing relevant was found in your documents for this question.
              </p>
            )}

            {citations.length > 0 && (
              <div className="flex flex-col gap-2 animate-rise-in">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Sources
                </p>
                {citations.map((c, i) => (
                  <div
                    key={c.id}
                    ref={(el) => {
                      citationRefs.current[i + 1] = el;
                    }}
                    className="rounded-xl border border-border p-3 text-xs transition-all hover:border-primary/30 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]"
                  >
                    <p className="mb-1 font-medium text-foreground">
                      <span className="text-primary">[{i + 1}]</span> {c.filename} · similarity {c.similarity.toFixed(2)}
                    </p>
                    <p className="text-muted-foreground">{c.content.slice(0, 220)}…</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-4">
        <form
          onSubmit={ask}
          className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,87,88,0.08)]"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!hasDocuments}
            aria-label="Ask a question about your documents"
            placeholder={hasDocuments ? "Ask a question about your documents…" : "Upload a document first"}
            className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!hasDocuments || !question.trim() || status === "searching" || status === "streaming"}
            aria-label="Send question"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
