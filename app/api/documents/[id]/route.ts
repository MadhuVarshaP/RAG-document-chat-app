import { getPool } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rowCount } = await getPool().query(`DELETE FROM documents WHERE id = $1`, [id]);
  if (rowCount === 0) {
    return Response.json({ error: "document not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
