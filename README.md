# 📄 RAG Document Chat

Chat with your own documents. Upload a PDF, DOCX, Markdown, or text file and ask questions about it — get streaming answers with inline citations pointing to the exact source passages.

Built **from scratch** as a learning project: no LangChain, no LlamaIndex, no vector-DB SDK, no ORM hiding the interesting parts. Every layer — chunking, embedding calls, vector storage, the cosine-similarity search query, prompt assembly, and token streaming — is hand-written. The only external "intelligence" is the LLM / embeddings API itself.

## What is RAG?

**Retrieval-Augmented Generation.** An LLM only knows its training data plus whatever you paste into its context window — it has never seen *your* documents. RAG fixes that:

1. **Ingest:** split your documents into chunks, convert each chunk into an *embedding* (a vector of numbers representing its meaning), and store them.
2. **Retrieve:** when a question comes in, embed the question the same way and find the stored chunks whose vectors are closest (cosine similarity).
3. **Generate:** paste those chunks into the prompt and ask the model to answer *only from that context*, citing its sources.

RAG = semantic search + prompt stuffing + generation.

## Architecture

```mermaid
flowchart TD
    subgraph Ingestion ["📥 Ingestion (write path)"]
        U[Upload file<br/>PDF / DOCX / MD / TXT] --> P[Parse → raw text]
        P --> C[Chunk<br/>~600 tokens + overlap]
        C --> E1[Embed chunks<br/>direct API calls, batched]
        E1 --> S[(Postgres + pgvector<br/>documents / chunks)]
    end

    subgraph Query ["💬 Query (read path)"]
        Q[User question] --> E2[Embed question<br/>same model!]
        E2 --> VS[Cosine top-k search<br/>hand-written SQL, HNSW index]
        S --> VS
        VS --> PA[Prompt assembly<br/>context-window budgeting<br/>+ citation markers]
        PA --> L[LLM streaming API]
        L --> UI[Streaming UI<br/>live tokens + clickable citations]
    end
```

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One repo for API routes *and* the streaming React UI |
| UI | React + Tailwind CSS | Fast, polished frontend |
| Database | Postgres 16 + pgvector | Real SQL, real vector indexes — no separate vector service |
| DB access | `pg` (node-postgres), raw SQL | The cosine query is written by hand, on purpose |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) via `fetch` | Direct HTTP calls — no SDK abstraction |
| LLM | Anthropic Messages API with `stream: true` | Token streaming over SSE |
| Tokenizer | `js-tiktoken` | Accurate chunk sizing and context budgeting |
| Parsing | `pdf-parse` (PDF), `mammoth` (DOCX) | Text extraction isn't worth reimplementing |
| Migrations | Plain `.sql` files | Schema stays visible and owned |

## Project structure

```
├─ migrations/          # plain SQL schema files
├─ lib/
│  ├─ db.ts             # pg Pool
│  ├─ parse.ts          # file → text
│  ├─ chunk.ts          # text → overlapping chunks
│  ├─ embed.ts          # direct embeddings API calls
│  ├─ store.ts          # insert documents/chunks
│  ├─ retrieve.ts       # cosine top-k search
│  └─ prompt.ts         # context budgeting + citation formatting
├─ app/
│  ├─ api/
│  │  ├─ upload/        # ingestion endpoint
│  │  ├─ documents/     # status polling
│  │  └─ chat/          # retrieval + streaming answer
│  └─ page.tsx          # chat UI
├─ eval/                # Recall@k / MRR harness for tuning retrieval
└─ tests/
```

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres with pgvector (see docs for options)

# 3. Configure environment
cp .env.example .env.local   # add DATABASE_URL + API keys

# 4. Run migrations
npm run migrate

# 5. Start the dev server
npm run dev
```

## Learning goals

- Understand embeddings, vector similarity, and why chunk size is the highest-leverage tuning knob in RAG
- Write and index a cosine-similarity query in raw SQL (pgvector `<=>` + HNSW)
- Budget a context window by hand: system prompt + retrieved chunks + question + room for the answer
- Stream LLM tokens end-to-end: provider SSE → route handler → `ReadableStream` → React
- Measure retrieval quality (Recall@k, MRR) instead of guessing
