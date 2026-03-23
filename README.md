# eva-run

**eva-run** is a TypeScript/Node.js service for running LLM evaluation jobs. It provides an HTTP API for submitting evaluation requests, running model outputs through a configurable set of assertions, and storing results in a database for later analysis.

## Features

- Fastify-based HTTP server for evaluation requests
- Supports multiple LLM providers (OpenAI, Anthropic, Google, Mistral, Bedrock, Azure, DeepSeek, Groq, Perplexity, xAI via Vercel ai-sdk)
- Pluggable assertion system (e.g., g-eval, llm-rubric via @eva-llm/eva-judge)
- Results stored in a database (Prisma/PostgreSQL)
- Model caching for performance
- Type-safe schemas using TypeBox

## Getting Started

### Prerequisites
- Node.js >= 22
- PostgreSQL database

### Installation

```bash
npm install
tsc
```

### Configuration
- Edit `prisma/schema.prisma` to configure your database connection.
- Update environment variables as needed (e.g., for API keys, database URL).

### Running the Server

```bash
node dst/server.js
```

The server will listen on `http://localhost:3000` by default.

### API Usage

#### POST /eval
Submit an evaluation job:

```json
{
  "run_id": "<uuid>",
  "provider": "openai",
  "model": "gpt-5-mini",
  "prompt": "Translate to French: Hello, world!",
  "asserts": [
    {
      "name": "g-eval",
      "provider": "openai",
      "model": "gpt-4.1-mini",
      "criteria": "Correct translation"
    }
  ]
}
```

Response:
```json
{ "test_id": "<uuid>" }
```

### Database
- Uses Prisma ORM. See `prisma/schema.prisma` for models.
- Run `npx prisma generate` and `npx prisma migrate dev` to set up the database.

## Project Structure

- `src/` — TypeScript source code
- `dst/` — Compiled JavaScript output
- `prisma/` — Prisma schema and config
- `package.json` — Project metadata and dependencies

## Development

- Build: `npm run build`
- Type-check: `tsc`
- (No tests yet)

## License
MIT
