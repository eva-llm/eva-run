# eva-run

A high-performance, stateless **"Fire & Forget"** Fastify server designed to process millions of LLM prompt tests via massive horizontal scaling. Built to scale from a simple Postgres instance to a high-throughput Redis + ClickHouse pipeline. This is the industrial shredder for AI reliability testing.

---

## North Star Metrics

- **Performance:**
  - ~10s per G-Eval test (Cold Cache).
  - ~6s per test (Hot Cache of Evaluation Steps).
- **Concurrency:** Optimized for ~200+ concurrent I/O-bound connections to LLM providers.
- **Throughput:** 1,200-2,000 tests per minute per node.
- **Efficiency:** Processes ~1M tests in 8.3-14 hours on a **single** `eva-run` node.
- **Scaling:** Processes ~1M tests in **2.5-4.2 minutes** with horizontal scaling (~200 nodes).<br />
  *Note: Calculation based on the author's experience deploying on-demand clusters for 40k+ OS-GUI/Web-UI tests at Yandex.*

> **Disclaimer:** These represent theoretical baseline metrics. Real-world performance depends on external LLM provider rate limits, network jitter, and infrastructure overhead.

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
