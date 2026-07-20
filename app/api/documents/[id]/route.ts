import { getPool } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = await getOrCreateSessionId();
  // Scoping the DELETE by session_id means a stranger who guesses/finds an id
  // from another session simply gets a 404 — they can't delete it.
  const { rowCount } = await getPool().query(
    `DELETE FROM documents WHERE id = $1 AND session_id = $2`,
    [id, sessionId]
  );
  if (rowCount === 0) {
    return Response.json({ error: "document not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
