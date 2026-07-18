import { getPool } from "./db";
import { embedAll } from "./embed";

const toVec = (v: number[]) => `[${v.join(",")}]`;

export interface Hit {
  id: string;
  content: string;
  filename: string;
  documentId: string;
  chunkIndex: number;
  similarity: number;
}

export async function retrieve(question: string, k = 6, minSimilarity = 0): Promise<Hit[]> {
  const [qVec] = await embedAll([question]); // SAME model as ingestion — different models' vectors aren't comparable

  const { rows } = await getPool().query(
    `SELECT
       c.id,
       c.content,
       c.chunk_index AS "chunkIndex",
       c.document_id AS "documentId",
       d.filename,
       1 - (c.embedding <=> $1) AS similarity   -- cosine distance -> similarity
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE 1 - (c.embedding <=> $1) >= $3        -- similarity floor: drop irrelevant hits
     ORDER BY c.embedding <=> $1                 -- ascending distance = descending similarity;
                                                  -- lets the HNSW index accelerate the search
     LIMIT $2`,
    [toVec(qVec), k, minSimilarity]
  );

  return rows as Hit[];
}
