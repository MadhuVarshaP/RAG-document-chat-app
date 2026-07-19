"use client";

import { useState } from "react";
import UploadPanel, { DocumentRow } from "@/components/UploadPanel";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const hasReadyDocuments = documents.some((d) => d.status === "ready");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">RAG Document Chat</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Upload a document, then ask questions about it — answers are grounded in and cited from your files.
        </p>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Documents</h2>
          <UploadPanel onDocumentsChanged={setDocuments} />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Chat</h2>
          <ChatPanel hasDocuments={hasReadyDocuments} />
        </section>
      </main>
    </div>
  );
}
