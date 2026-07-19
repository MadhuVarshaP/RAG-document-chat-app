// Must be imported before PDFParse — without it, pdf.js's "fake worker" setup
// tries to dynamically import pdf.worker.mjs by a path that Next.js's bundler
// (Turbopack) has already rewritten, and fails with a module-not-found error.
// Only reproduces when bundled (a real Next.js route); the plain-Node test
// script in Phase 1 never hit this because there's no bundler involved there.
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function extractText(buf: Buffer, contentType: string): Promise<string> {
  if (contentType === "application/pdf") {
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (contentType.includes("wordprocessingml")) {
    // .docx
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  // txt / md / anything text-like
  return buf.toString("utf8");
}

// Collapse runs of blank lines and stray whitespace so chunking later
// works on clean text instead of PDF/DOCX extraction noise.
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
