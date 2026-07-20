import { extractText, normalizeText } from "@/lib/parse";
import { chunkText } from "@/lib/chunk";
import { embedAll } from "@/lib/embed";
import { storeDocument } from "@/lib/store";
import { MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/constants";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

function inferContentType(file: File): string {
  if (file.type) return file.type;
  // Some browsers/OSes leave `.type` empty for .md/.txt — fall back to extension.
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: `file exceeds the ${MAX_FILE_MB}MB limit` }, { status: 413 });
  }

  const contentType = inferContentType(file);
  if (!ALLOWED_TYPES.has(contentType)) {
    return Response.json({ error: `unsupported file type: ${contentType}` }, { status: 415 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const text = normalizeText(await extractText(buf, contentType));
    if (!text) {
      return Response.json({ error: "no extractable text found in this file" }, { status: 422 });
    }

    const chunks = chunkText(text);
    const embeddings = await embedAll(chunks.map((c) => c.content));
    const id = await storeDocument(file.name, contentType, chunks, embeddings);

    return Response.json({ id, filename: file.name, status: "ready", chunkCount: chunks.length });
  } catch (err) {
    return Response.json({ error: `ingestion failed: ${(err as Error).message}` }, { status: 500 });
  }
}
