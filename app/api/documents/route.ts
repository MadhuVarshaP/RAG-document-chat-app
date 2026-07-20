import { getPool } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";

export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const { rows } = await getPool().query(
    `SELECT id, filename, status, error, chunk_count AS "chunkCount", created_at AS "createdAt"
     FROM documents
     WHERE session_id = $1
     ORDER BY created_at DESC`,
    [sessionId]
  );
  return Response.json(rows);
}
