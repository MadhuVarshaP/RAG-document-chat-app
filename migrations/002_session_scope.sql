-- Per-browser-session privacy: each document is stamped with the anonymous
-- session that uploaded it (see lib/session.ts), so one visitor's uploads
-- are never listed, queried, or deletable by another visitor. Existing rows
-- get a random session_id each (DEFAULT gen_random_uuid() fires per-row on
-- ALTER ... ADD COLUMN), which correctly makes them invisible to everyone
-- rather than leaking them to whichever session happens to load next.
ALTER TABLE documents
  ADD COLUMN session_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX documents_session_id_idx ON documents (session_id);
