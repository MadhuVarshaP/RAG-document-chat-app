// Vercel Functions have a hard, non-configurable 4.5MB request body limit on
// every plan (Hobby/Pro/Enterprise) — confirmed against Vercel's own docs and
// reproduced directly against this project's live deployment (a 5.7MB upload
// returned a raw platform 413 FUNCTION_PAYLOAD_TOO_LARGE before our route code
// ever ran). 4MB leaves headroom under that ceiling for multipart/form-data
// overhead. Shared between the client (pre-check, avoids a wasted round trip
// for files we already know will fail) and the server (authoritative check).
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
