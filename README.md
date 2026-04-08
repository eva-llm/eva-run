# eva-run

A high-performance, stateless **"Fire & Forget"** Fastify server designed to process thousands and millions of LLM prompt tests via massive horizontal scaling. Built to scale from a simple Postgres instance to a high-throughput Redis + ClickHouse pipeline. The Industrial Shredder for AI reliability testing.

---

## Performance Potential

- **Latency:**
  - ~10s per G-Eval test (Cold Cache).
  - ~6s per test (Hot Cache of Evaluation Steps).
- **Concurrency:** Optimized for ~200+ concurrent I/O-bound connections to LLM providers.
- **Throughput:** 1,200-2,000 tests per minute per node.
- **Efficiency:** Processes ~1M tests in 8.3-14 hours on a **single** `eva-run` node.
- **Scaling:** Processes ~1M tests in **2.5-4.2 minutes** with horizontal scaling (~200 nodes).<br />
  *Note: Calculation based on the author's experience deploying on-demand clusters of this size for 40k+ OS-GUI/Web-UI tests at Yandex.*

> **Disclaimer:** These represent theoretical baseline metrics. Real-world performance depends on external LLM provider rate limits, network jitter, and infrastructure overhead.

**Down-to-earth** calculation - accounting rate limits, moderate prompts, and other factors - for LLM Provider with ~100 connections - **1M** tests in ~**1d** (600-1000 tests per minute).

## Performance Benchmark

### 📊 [1000 tests - 1 node eva-run]

**Testing environment:** Local machine

**OpenAI Account:** Tier 1

**Concurrency pool:** LLM_PROVIDER_CONCURRENCY=10

#### 🧪 Test Payload:

```json
{
  "run_id": "<UUIDv7>",
  "provider": "openai",
  "model": "gpt-5-mini",
  "prompt": "Question #[id]: What is the capital of France?",
  "asserts": [
    {
      "name": "b-eval",
      "provider": "openai",
      "model": "gpt-4.1-mini",
      "criteria": "the answer should be relevant to the question"
    }
  ]
}
```

Each test with B-Eval/G-Eval assert consumes ~1000-1500 LLM tokens.

#### ⏱️ Results for 1000 iterations (All tests passed):

**Total execution time:** ~520 seconds (8min 40sec)

**Effective time per test:** ~5.2s (including concurrency workers pool overhead). This looks correlated initial estimates.

**Longest test** (+ worker waiting) - 519.973s

**Shortest test** (+ worker waiting) - 197.196s

#### ⏱️ NOTE! Results for first 999 iterations (one test was stuck in ~3 mins):

**Total execution time:** ~340 seconds (5min 40sec)

**Effective time per test:** ~3.4s

#### 📉 Statistical Variance (Response Drift):

- "The capital of France is Paris." - 913 times
- "Paris." - 87 times

Even in a semantically identical prompt, we see a 8.7% variance in output format. This is exactly why **statistical validation is a must for Enterprise AI**.

---

## Where is it in AI Testing Pyramid?

`eva-run` is the **Unit Testing layer** of the EVA-LLM ecosystem.

In a professional AI QA pipeline, you need different tools for different scales:
* **Complex Scenarios (Agentic/Integration):** Use [`llm-as-a-jest`](https://eva-llm.github.io/llm-as-a-jest) for testing JSON structures, tool-calling, and multi-step flows where deep orchestration is required.
* **Massive Validation (Statistical):** Use `eva-run` for high-volume, "atomic" probes.

The goal of `eva-run` is to verify - at scale - that the model can answer correctly, logically, and consistently. It's not about complex business logic; it's about **statistical significance**. By stripping away the overhead of heavy test runners, we focus on one thing: hammering the LLM with thousands and millions of prompts to extract a **Measurable SLA**.

## Why are millions of tests important?

In the era of the **EU AI Act** and similar regulations, massive empirical testing is perhaps the only way to demonstrate a meaningful SLA. Since AI is inherently non-deterministic, quality cannot be calculated mathematically — it can only be captured statistically through high-volume data. By running millions of tests, the quality mark becomes a statistically significant value rather than a lucky guess.

The figure of **one million tests** is not an arbitrary number; it is a technical necessity for reliability. To ensure that an AI system is stable, a single test case must be validated **multiple times (dozens or even hundreds of iterations)**. This is the only way to confirm that responses do not break statistically, especially when using **non-zero temperatures**.

## What about LLM Provider Rate Limits?

This service follows the high-load philosophy: the core must be "dumb," fast, and opinionless. Any complex orchestration or business logic for rate management should be handled externally by the system distributing the tests. The server's only job is to shred through the queue at maximum speed.

To manage load, use the `LLM_PROVIDER_CONCURRENCY` environment variable. It sets the worker pool size for outgoing requests to external LLM providers (Default: `200`).

---

## Quick Start

```bash
git clone https://github.com/eva-llm/eva-run
cd eva-run
nvm use
pnpm i
export DATABASE_URL="postgresql://..."
pnpx prisma db push
pnpx prisma generate
pnpm run server
```

> [!IMPORTANT]
> **Advanced Validation & Custom Endpoints**
>
> If you need to go beyond standard prompt testing and want to validate your specific AI endpoints for production reliability, it is recommended to implement a custom **AI SDK Vercel Adapter**. 
> 
> 1. Follow the [Custom Providers guide](https://ai-sdk.dev/providers/community-providers/custom-providers) to develop your adapter.
> 2. Register it in `src/registry.ts`.
> 3. Define the model to be used as a **Judge** for your endpoint testing.
>
> To ensure your Judge is reliable and unbiased, we strongly recommend performing [Dark Teaming](https://eva-llm.github.io/dark-teaming) to measure **Symmetry Deviation**. `eva-run` supports Dark Teaming natively via the `must_fail` field — refer to the **Assertions** documentation below for implementation details.

## Architecture
### API

It exposes a single high-speed endpoint: `POST /eval`.
The server accepts an **array of test configurations**, validates the payload, triggers the background evaluation process for each item, and immediately returns an array of `test_ids`. This batch-first approach minimizes HTTP overhead and is designed for massive ingestion. Results are tracked directly via the database or its replicas, ensuring zero blocking on the API level.

### Test Data Structure (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "description": "Batch of evaluation tests",
  "items": {
    "type": "object",
    "properties": {
      "run_id": { "type": "string", "format": "uuid", "description": "Global ID for the entire test suite run" },
      "test_id": { "type": "string", "format": "uuid", "description": "Optional. If not provided, eva-run generates a UUIDv7" },
      "provider": { "type": "string" },
      "model": { "type": "string" },
      "prompt": { "type": "string" },
      "asserts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "enum": ["b-eval", "g-eval", "llm-rubric", "equals", "not-equals", "contains", "not-contains", "regex"] },
            "criteria": { "type": "string" },
            "threshold": { "type": "number", "default": 0.5 },
            "provider": { "type": "string" },
            "model": { "type": "string" },
            "temperature": { "type": "number", "default": 0 },
            "must_fail": { "type": "boolean", "default": false },
            "answer_only": { "type": "boolean", "default": false },
            "case_sensitive": { "type": "boolean", "default": true }
          },
          "required": ["name", "criteria"]
        }
      }
    },
    "required": ["run_id", "provider", "model", "prompt", "asserts"]
  }
}
```

### Supported asserts

We cover 90% of production AI evaluation needs, with a heavy focus on LLM-as-a-Judge matchers:
- **AI-Native:** `b-eval`, `g-eval`, `llm-rubric` (via `eva-judge`).
- **Classic:** `equals`, `not-equals`, `contains`, `not-contains`, `regex`.

## Data & Scaling Strategy

The system is architected for **Append-Only** write performance.
1. **Postgres (Current):** Sufficient for most commercial use cases.
1. **ClickHouse (Future):** Target storage for million-test scale.
1. **Redis (Buffer):** Planned as an ingestion proxy to batch writes into ClickHouse.

**Implementation Detail:** All `id` fields utilize **UUIDv7** for superior temporal sorting and indexing efficiency compared to standard random UUIDs.

## Database Schema (Prisma)

```prisma
model AssertResult {
  id          String   @id // uuid7
  test_id     String
  run_id      String
  name        String
  criteria    String
  passed      Boolean
  score       Float
  reason      String
  threshold   Float
  metadata    Json?
  started_at  DateTime
  finished_at DateTime
  diff_ms     Int
}

model TestResult {
  id                String   @id // uuid7
  run_id            String
  provider          String
  model             String
  prompt            String
  output            String
  passed            Boolean
  started_at        DateTime
  assert_started_at DateTime
  finished_at       DateTime
  diff_ms           Int
  assert_diff_ms    Int
  output_diff_ms    Int
}
```

## Industrial Philosophy
### Dark Teaming

It natively supports [Dark Teaming](https://eva-llm.github.io/dark-teaming) for measuring **Epistemic Honesty**. By using the `must_fail` flag on assertions, you can calculate **Symmetry Deviation** in real-time across massive datasets.

### Zero-Overhead Traceability

We intentionally omit heavy traceability layers. In `eva-run`, **the data is the trace**. If a record is missing from the database, the test is considered failed. This "minimum-evil" approach prioritizes raw throughput over logging overhead.

### AI-Tests Shredder

The server acts as a "dumb" executor to minimize latency:
- **Worker Isolation:** Each assertion is independent and processed via a worker pool.
- **Optimized Paths:** We use specialized code chunks for different matchers to avoid the performance tax of complex abstractions.
- **Validation:** JSON-schema validation is the only "inevitable evil" allowed in the hot path.

---

## License
MIT
