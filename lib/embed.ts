const ENDPOINT = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });

  if (res.status === 429 && attempt < 5) {
    await sleep(1000 * 2 ** attempt); // exponential backoff: 1s, 2s, 4s, 8s, 16s
    return embedBatch(inputs, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Embeddings API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // The API can return results out of order under batching — the `index` field
  // on each item tells us its position in the original `inputs` array.
  return data.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

export async function embedAll(texts: string[], batchSize = 96): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await embedBatch(texts.slice(i, i + batchSize))));
  }
  return out;
}
