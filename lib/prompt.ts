import type { Hit } from "./retrieve";
import { countTokens } from "./chunk";

// Reserves room in the model's context window for the system prompt, the
// question, and the answer being generated — this budget is only for the
// retrieved context blocks.
const DEFAULT_CONTEXT_TOKEN_BUDGET = 6000;

export interface AssembledPrompt {
  system: string;
  user: string;
  citations: Hit[];
}

export function assemble(
  question: string,
  hits: Hit[],
  { contextTokenBudget = DEFAULT_CONTEXT_TOKEN_BUDGET } = {}
): AssembledPrompt {
  // hits arrive best-first from retrieve(); keep chunks until the budget runs out,
  // then drop the (less relevant) tail rather than truncate mid-chunk.
  const kept: Hit[] = [];
  let used = 0;
  for (const h of hits) {
    const t = countTokens(h.content);
    if (used + t > contextTokenBudget) break;
    kept.push(h);
    used += t;
  }

  const context =
    kept.length > 0
      ? kept.map((h, i) => `[${i + 1}] (source: ${h.filename})\n${h.content}`).join("\n\n")
      : "(No relevant passages were found in the uploaded documents.)";

  const system =
    "You answer strictly from the provided context. Cite sources inline as [1], [2] " +
    "matching the numbered context blocks. If the answer is not in the context, say you " +
    "cannot find it in the provided documents. Never invent facts. " +
    "Respond in plain prose sentences — no markdown formatting, no bullet points, no asterisks.";

  const user = `Context:\n${context}\n\nQuestion: ${question}`;

  return { system, user, citations: kept };
}
