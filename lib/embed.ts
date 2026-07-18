const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;

// Must match the vector(1536) column in migrations/001_init.sql. Gemini's
// embedding model defaults to a much larger size, but supports truncating to
// a chosen dimensionality via embedContentConfig — we ask for 1536 directly
// so no schema migration is needed.
const OUTPUT_DIMENSIONALITY = 1536;

// Google's docs don't state a documented max requests-per-call for
// batchEmbedContents, so this is a conservative default rather than a
// verified ceiling — safe to raise later if real usage shows it holds.
const DEFAULT_BATCH_SIZE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.EMBEDDINGS_API_KEY ?? "",
    },
    body: JSON.stringify({
      // NOTE: outputDimensionality must be a direct field on each request object.
      // Google's own docs describe it as nested under `embedContentConfig`, but that
      // was verified empirically to be ignored (silently returns the default 3072-dim
      // vector); this direct-field form is what actually truncates to 1536 dims.
      requests: inputs.map((text) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      })),
    }),
  });

  if (res.status === 429 && attempt < 5) {
    await sleep(1000 * 2 ** attempt); // exponential backoff: 1s, 2s, 4s, 8s, 16s
    return embedBatch(inputs, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Embeddings API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Google's docs state batchEmbedContents returns embeddings in the same
  // order as the requests array, so no re-sorting is needed (unlike OpenAI,
  // which requires sorting by an `index` field).
  return data.embeddings.map((e: { values: number[] }) => e.values);
}

export async function embedAll(texts: string[], batchSize = DEFAULT_BATCH_SIZE): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await embedBatch(texts.slice(i, i + batchSize))));
  }
  return out;
}
