-- Extensions: pgcrypto gives us gen_random_uuid(); vector gives us the vector type + distance operators.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      text NOT NULL,
  content_type  text,
  status        text NOT NULL DEFAULT 'processing',  -- processing | ready | failed
  error         text,
  chunk_count   int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   int  NOT NULL,               -- order within the document
  content       text NOT NULL,
  token_count   int  NOT NULL,
  embedding     vector(1536) NOT NULL,       -- MUST match the embedding model's output dimension
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Approximate-nearest-neighbour index for cosine distance.
-- HNSW: higher recall + fast queries, no separate "training" step needed before it's usable.
CREATE INDEX chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- Helps ORDER BY / joins when re-reading a document in order.
CREATE INDEX chunks_document_id_idx ON chunks (document_id, chunk_index);
