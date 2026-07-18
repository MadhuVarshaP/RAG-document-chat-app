import { encodingForModel } from "js-tiktoken";

// Tokenize with the same model we embed with, so token counts here match
// what the embeddings API actually sees.
const enc = encodingForModel("text-embedding-3-small");
export const countTokens = (s: string) => enc.encode(s).length;

export interface Chunk {
  content: string;
  tokenCount: number;
  index: number;
}

export function chunkText(
  text: string,
  { maxTokens = 600, overlapTokens = 80 } = {}
): Chunk[] {
  // Split on paragraph boundaries first (blank lines). If a "paragraph" has
  // no blank-line breaks at all (e.g. PDF-extracted text, which only has
  // single line breaks), this produces one giant unit that immediately
  // exceeds maxTokens and falls through to sentence splitting below —
  // so PDFs still chunk correctly, just at sentence granularity instead
  // of paragraph granularity.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  for (const p of paragraphs) {
    if (countTokens(p) <= maxTokens) {
      units.push(p);
      continue;
    }
    // Paragraph too big: fall back to sentences.
    units.push(...p.split(/(?<=[.!?])\s+/).filter(Boolean));
  }

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  // Flush the current chunk, then seed the next one with an overlap tail —
  // the trailing whole units of the chunk we just flushed, walked backwards
  // until they add up to at least overlapTokens (never split mid-sentence,
  // so the actual overlap is a floor, not an exact number).
  const flushAndCarryOverlap = () => {
    if (!current.length) return;
    const content = current.join(" ");
    chunks.push({ content, tokenCount: countTokens(content), index: chunks.length });

    const tail: string[] = [];
    let tailTokens = 0;
    for (let i = current.length - 1; i >= 0 && tailTokens < overlapTokens; i--) {
      tail.unshift(current[i]);
      tailTokens += countTokens(current[i]);
    }
    current = tail;
    currentTokens = tailTokens;
  };

  for (const unit of units) {
    const t = countTokens(unit);
    if (currentTokens + t > maxTokens && current.length) {
      flushAndCarryOverlap();
    }
    current.push(unit);
    currentTokens += t;
    // The overlap tail plus this one unit can already exceed maxTokens on its
    // own (e.g. a long sentence landing right after a big tail). Flush now
    // instead of letting the overshoot compound with more units before the
    // next iteration's check — otherwise chunks can silently balloon well
    // past maxTokens, which defeats the point of a token budget.
    if (currentTokens > maxTokens) {
      flushAndCarryOverlap();
    }
  }
  flushAndCarryOverlap();
  return chunks;
}
