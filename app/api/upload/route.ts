import { del, get } from "@vercel/blob";
import { extractText, normalizeText } from "@/lib/parse";
import { chunkText } from "@/lib/chunk";
import { embedAll } from "@/lib/embed";
import { storeDocument } from "@/lib/store";
import { ALLOWED_UPLOAD_TYPES, inferContentType } from "@/lib/constants";

const ALLOWED_TYPES = new Set<string>(ALLOWED_UPLOAD_TYPES);

// Called after the browser has already uploaded the file directly to Vercel
// Blob (see app/api/blob-upload/route.ts) — this route only ever receives a
// small JSON pointer, never the file bytes, so it isn't subject to Vercel's
// 4.5MB Function body limit. It fetches the real content from Blob storage,
// runs the ingestion pipeline, then deletes the blob — Postgres is the
// durable store; Blob storage is just a relay for getting the bytes here.
export async function POST(req: Request) {
  const { blobUrl, filename, contentType: providedType } = await req.json();

  if (!blobUrl || typeof blobUrl !== "string" || !filename || typeof filename !== "string") {
    return Response.json({ error: "blobUrl and filename are required" }, { status: 400 });
  }

  const contentType = inferContentType(filename, providedType);
  if (!ALLOWED_TYPES.has(contentType)) {
    await del(blobUrl).catch(() => {});
    return Response.json({ error: `unsupported file type: ${contentType}` }, { status: 415 });
  }

  try {
    // The store is private, so plain fetch(blobUrl) isn't authorized — get()
    // reads it using BLOB_READ_WRITE_TOKEN automatically.
    const result = await get(blobUrl, { access: "private" });
    if (!result?.stream) {
      return Response.json({ error: "failed to fetch uploaded file" }, { status: 502 });
    }
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    const text = normalizeText(await extractText(buf, contentType));
    if (!text) {
      await del(blobUrl).catch(() => {});
      return Response.json({ error: "no extractable text found in this file" }, { status: 422 });
    }

    const chunks = chunkText(text);
    const embeddings = await embedAll(chunks.map((c) => c.content));
    const id = await storeDocument(filename, contentType, chunks, embeddings);

    await del(blobUrl).catch(() => {}); // best-effort cleanup — the extracted text is already durably in Postgres

    return Response.json({ id, filename, status: "ready", chunkCount: chunks.length });
  } catch (err) {
    await del(blobUrl).catch(() => {});
    return Response.json({ error: `ingestion failed: ${(err as Error).message}` }, { status: 500 });
  }
}
