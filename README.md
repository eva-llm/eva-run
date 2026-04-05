# eva-run

A high-performance, stateless **"Fire & Forget"** Fastify server designed to process thousands and millions of LLM prompt tests via massive horizontal scaling. Built to scale from a simple Postgres instance to a high-throughput Redis + ClickHouse pipeline. This is the industrial shredder for AI reliability testing.

---

## North Star Metrics

- **Performance:**
  - ~10s per G-Eval test (Cold Cache).
  - ~6s per test (Hot Cache of Evaluation Steps).
- **Concurrency:** Optimized for ~200+ concurrent I/O-bound connections to LLM providers.
- **Throughput:** 1,200-2,000 tests per minute per node.
- **Efficiency:** Processes ~1M tests in 8.3-14 hours on a **single** `eva-run` node.
- **Scaling:** Processes ~1M tests in **2.5-4.2 minutes** with horizontal scaling (~200 nodes).<br />
  *Note: Calculation based on the author's experience deploying on-demand clusters of this size for 40k+ OS-GUI/Web-UI tests at Yandex.*

> **Disclaimer:** These represent theoretical baseline metrics. Real-world performance depends on external LLM provider rate limits, network jitter, and infrastructure overhead.

---

## Where is it in AI Testing Pyramid?

`eva-run` is the **Unit Testing layer** of the EVA-LLM ecosystem.

In a professional AI QA pipeline, you need different tools for different scales:
* **Complex Scenarios (Agentic/Integration):** Use [`llm-as-a-jest`](https://eva-llm.github.io/llm-as-a-jest) for testing JSON structures, tool-calling, and multi-step flows where deep orchestration is required.
* **Massive Validation (Statistical):** Use `eva-run` for high-volume, "atomic" probes.

The goal of `eva-run` is to verify - at scale - that the model can answer correctly, logically, and consistently. It's not about complex business logic; it's about **statistical significance**. By stripping away the overhead of heavy test runners, we focus on one thing: hammering the LLM with thousands and millions of prompts to extract a **Measurable SLA**.

## Why are millions of tests important?

In the era of the **EU AI Act** and similar regulations, massive empirical testing is perhaps the only way to demonstrate a meaningful SLA. Since AI is inherently non-deterministic, quality cannot be calculated mathematically — it can only be captured statistically through high-volume data. By running millions of tests, the quality mark becomes a statistically significant value rather than a lucky guess.

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
pnpm run server
```

## Architecture
### API

It exposes a single high-speed endpoint: `POST /eval`.
The server validates the payload, triggers the background evaluation process, and immediately returns a `test_id`. Results are tracked directly via the database or its replicas, ensuring zero blocking on the API level.

### Test Data Structure (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "run_id": { "type": "string", "format": "uuid" },
    "test_id": { "type": "string", "format": "uuid" },
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
          // llm-as-judge fields
          "provider": { "type": "string" },
          "model": { "type": "string" },
          "temperature": { "type": "number", "default": 0 },
          "must_fail": { "type": "boolean", "default": false },
          // G-Eval/B-Eval fields
          "answer_only": { "type": "boolean", "default": false },
          // text compare fields
          "case_sensitive": { "type": "boolean", "default": true }
        },
        "required": ["name", "criteria"]
      }
    }
  },
  "required": ["run_id", "provider", "model", "prompt", "asserts"]
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
