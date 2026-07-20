"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import { MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/constants";

export interface DocumentRow {
  id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

export default function UploadPanel({ onDocumentsChanged }: { onDocumentsChanged?: (docs: DocumentRow[]) => void }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const docs = await res.json();
      setDocuments(docs);
      onDocumentsChanged?.(docs);
    }
  }, [onDocumentsChanged]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function uploadFile(file: File) {
    // Check client-side first — Vercel's platform enforces a hard 4.5MB request
    // body limit before our route code even runs, returning a raw, unfriendly
    // error. Catching oversized files here means we never send the request at
    // all for anything we already know will fail.
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is ${MAX_FILE_MB}MB.`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
      } else {
        await refresh();
      }
    } catch {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await refresh();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="file-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
          dragging ? "border-primary bg-accent" : "border-border hover:border-primary/30 hover:bg-accent/40"
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-upload"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Processing document…</p>
          </>
        ) : (
          <>
            <div className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${dragging ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
              <Upload className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {dragging ? "Drop to upload" : "Drag a file here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, or MD — up to {MAX_FILE_MB}MB</p>
          </>
        )}
      </label>

      {uploadError && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{uploadError}</p>
      )}

      <div className="flex flex-col gap-1">
        {documents.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No documents uploaded yet.</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
              <p className="truncate text-xs text-muted-foreground">
                <StatusBadge status={doc.status} />
                {doc.status === "ready" && ` · ${doc.chunkCount} chunks`}
                {doc.status === "failed" && doc.error && ` · ${doc.error}`}
              </p>
            </div>
            <button
              onClick={() => deleteDocument(doc.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-secondary hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              aria-label={`Remove ${doc.filename}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  const styles = {
    ready: "text-green-600",
    failed: "text-red-600",
    processing: "text-amber-600",
  };
  return <span className={styles[status]}>{status}</span>;
}
