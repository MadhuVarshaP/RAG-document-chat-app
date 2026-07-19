"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900 dark:border-t-zinc-100" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Processing document…</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {dragging ? "Drop to upload" : "Drag a file here, or click to browse"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">PDF, DOCX, TXT, or MD — up to 10MB</p>
          </>
        )}
      </div>

      {uploadError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {uploadError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {documents.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">No documents uploaded yet.</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{doc.filename}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                <StatusBadge status={doc.status} />
                {doc.status === "ready" && ` · ${doc.chunkCount} chunks`}
                {doc.status === "failed" && doc.error && ` · ${doc.error}`}
              </p>
            </div>
            <button
              onClick={() => deleteDocument(doc.id)}
              className="shrink-0 text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
              aria-label={`Delete ${doc.filename}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  const styles = {
    ready: "text-green-700 dark:text-green-400",
    failed: "text-red-700 dark:text-red-400",
    processing: "text-amber-700 dark:text-amber-400",
  };
  return <span className={styles[status]}>{status}</span>;
}
