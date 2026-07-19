import { getPool } from "@/lib/db";

export async function GET() {
  const { rows } = await getPool().query(
    `SELECT id, filename, status, error, chunk_count AS "chunkCount", created_at AS "createdAt"
     FROM documents
     ORDER BY created_at DESC`
  );
  return Response.json(rows);
}
