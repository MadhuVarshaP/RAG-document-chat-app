import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_FILE_BYTES, ALLOWED_UPLOAD_TYPES } from "@/lib/constants";

// Issues short-lived client tokens so the browser can upload directly to
// Vercel Blob storage, bypassing the 4.5MB Vercel Functions body limit
// entirely — the raw file bytes never pass through our route handler.
// Deliberately does NOT use onUploadCompleted: that callback requires Vercel
// Blob to reach a publicly accessible URL, which doesn't work against a local
// dev server without a tunnel. Ingestion is instead triggered by an explicit
// follow-up call from the client (see app/api/upload/route.ts) once the
// direct upload finishes — identical code path locally and in production.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
        maximumSizeInBytes: MAX_FILE_BYTES,
        addRandomSuffix: true,
      }),
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
