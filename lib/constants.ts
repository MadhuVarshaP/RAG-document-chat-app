// Vercel Functions have a hard, non-configurable 4.5MB request body limit on
// every plan (Hobby/Pro/Enterprise) — confirmed against Vercel's own docs and
// reproduced directly against this project's live deployment. That limit only
// applies to bytes sent *directly to a Function*. Uploads now go client ->
// Vercel Blob storage directly (bypassing Functions entirely for the file
// bytes), so this ceiling is a real product decision again, not a platform
// workaround — 10MB comfortably covers PDFs/DOCX for a document-chat app.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export function inferContentType(filename: string, providedType?: string): string {
  if (providedType) return providedType;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}
