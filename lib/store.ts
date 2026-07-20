import { getPool } from "./db";
import type { Chunk } from "./chunk";

const toVec = (v: number[]) => `[${v.join(",")}]`;

export async function storeDocument(
  filename: string,
  contentType: string,
  chunks: Chunk[],
  embeddings: number[][],
  sessionId: string
): Promise<string> {
  if (chunks.length !== embeddings.length) {
    throw new Error(`chunk/embedding count mismatch: ${chunks.length} chunks vs ${embeddings.length} embeddings`);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO documents (filename, content_type, status, chunk_count, session_id)
       VALUES ($1, $2, 'ready', $3, $4) RETURNING id`,
      [filename, contentType, chunks.length, sessionId]
    );
    const docId: string = rows[0].id;

    if (chunks.length > 0) {
      const values: unknown[] = [];
      const tuples = chunks.map((c, i) => {
        const b = i * 5;
        values.push(docId, c.index, c.content, c.tokenCount, toVec(embeddings[i]));
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
      });
      await client.query(
        `INSERT INTO chunks (document_id, chunk_index, content, token_count, embedding)
         VALUES ${tuples.join(",")}`,
        values
      );
    }

    await client.query("COMMIT");
    return docId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markDocumentFailed(docId: string, error: string): Promise<void> {
  await getPool().query(`UPDATE documents SET status = 'failed', error = $2 WHERE id = $1`, [docId, error]);
}
