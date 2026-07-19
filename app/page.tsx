"use client";

import { useState } from "react";
import UploadPanel, { DocumentRow } from "@/components/UploadPanel";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const hasReadyDocuments = documents.some((d) => d.status === "ready");

  return (
    <div className="flex h-dvh flex-1 bg-background">
      <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-border bg-card p-4">
        <div>
          <h1 className="text-sm font-semibold text-foreground">RAG Document Chat</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Hand-built retrieval-augmented generation</p>
        </div>
        <UploadPanel onDocumentsChanged={setDocuments} />
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatPanel hasDocuments={hasReadyDocuments} />
      </main>
    </div>
  );
}
