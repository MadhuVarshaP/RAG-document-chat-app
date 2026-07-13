# Contributing

Thanks for your interest in this project. It's primarily a learning-in-public build, but contributions, bug reports, and suggestions are welcome.

## Setup

```bash
git clone git@github.com:MadhuVarshaP/RAG-document-chat-app.git
cd RAG-document-chat-app
npm install
cp .env.example .env.local   # fill in DATABASE_URL + API keys
# start Postgres with the pgvector extension (see README)
npm run migrate
npm run dev
```

## Making changes

1. Create a branch off `main`: `git checkout -b feat/short-description`.
2. Keep commits small and scoped to one logical change (e.g. "add chunker unit tests", not "misc changes").
3. Write commit messages in the imperative mood: `fix: ...`, `feat: ...`, `docs: ...`, `chore: ...`.
4. Open a pull request against `main` describing what changed and why.

## Code style

- No RAG frameworks (LangChain, LlamaIndex) and no vector-DB/embeddings SDKs — this project intentionally calls APIs directly and writes retrieval SQL by hand. Keep that spirit in any contribution.
- Prefer plain, readable code over cleverness. Comments should explain *why*, not *what*.
- Run existing tests before opening a PR (`npm test`, once the test suite is in place).

## Reporting issues

Open a GitHub issue with steps to reproduce, expected behavior, and actual behavior. For retrieval-quality issues, include the question asked and which document(s) it should have matched.
