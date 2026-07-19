"use client";

import { useState } from "react";
import { FileSearch2 } from "lucide-react";
import UploadPanel, { DocumentRow } from "@/components/UploadPanel";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const hasReadyDocuments = documents.some((d) => d.status === "ready");

  return (
    <div className="flex h-dvh flex-1 bg-background">
      <aside className="flex w-92 shrink-0 flex-col gap-5 border-r border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <FileSearch2 className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">RAG Document Chat</h1>
            <p className="text-xs text-muted-foreground">Hand-built retrieval-augmented generation</p>
          </div>
        </div>
        <UploadPanel onDocumentsChanged={setDocuments} />
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatPanel hasDocuments={hasReadyDocuments} />
      </main>
    </div>
  );
}
