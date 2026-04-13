# eva-run

A high-performance, stateless **"Fire & Forget"** I/O-bound server designed to process thousands and millions of LLM prompt tests via massive horizontal scaling. Built to scale from a simple Postgres instance to a high-throughput Redis + ClickHouse pipeline. The Industrial Shredder for AI reliability testing.

---

[**Server specification**](#server-specification)

[**AI Metrology**](#ai-metrology)

[**Statistical SLA**](#statistical-sla)

---

### Where is it in AI Testing Pyramid?

`eva-run` is the **Unit Testing layer** of the EVA-LLM ecosystem.

In a professional AI QA pipeline, you need different tools for different scales:
* **Complex Scenarios (Agentic/Integration):** Use [`llm-as-a-jest`](https://eva-llm.github.io/llm-as-a-jest) for testing JSON structures, tool-calling, and multi-step flows where deep orchestration is required.
* **Massive Validation (Statistical):** Use `eva-run` for high-volume, "atomic" probes.

The goal of `eva-run` is to verify - at scale - that the model can answer correctly, logically, and consistently. It's not about complex business logic; it's about **statistical significance**. By stripping away the overhead of heavy test runners, we focus on one thing: hammering the LLM with thousands and millions of prompts to extract a **Measurable SLA**.

### Why are millions of tests important?

In the era of the **EU AI Act** and similar regulations, massive empirical testing is perhaps the only way to demonstrate a meaningful SLA. Since AI is inherently non-deterministic, quality cannot be calculated mathematically — it can only be captured statistically through high-volume data. By running millions of tests, the quality mark becomes a statistically significant value rather than a lucky guess.

The figure of **one million tests** is not an arbitrary number; it is a technical necessity for reliability. To ensure that an AI system is stable, a single test case must be validated **multiple times (dozens or even hundreds of iterations)**. This is the only way to confirm that responses do not break statistically, especially when using **non-zero temperatures**.

### What about LLM Provider Rate Limits?

This service follows the high-load philosophy: the core must be "dumb," fast, and opinionless. Any complex orchestration or business logic for rate management should be handled externally by the system distributing the tests. The server's only job is to shred through the queue at maximum speed.

To manage load, use the `LLM_PROVIDER_CONCURRENCY` environment variable. It sets the worker pool size for outgoing requests to external LLM providers (Default: `200`).

---

## Server specification

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

---

## Performance Benchmark
### 📊 [1000 tests - 1 node eva-run]

- **Testing environment:** Local machine
- **OpenAI Account:** Tier 1
- **Concurrency pool:** LLM_PROVIDER_CONCURRENCY=10

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

**NOTE!** Each test with B-Eval / G-Eval assert consumes ~1000-1500 input tokens.

#### ⏱️ Results for 1000 iterations (All tests passed):

- **Total execution time:** ~520 seconds (8min 40sec)
- **Effective time per test:** ~5.2s (including concurrency workers pool overhead). This looks correlated initial estimates.
- **Longest test** (+ worker waiting) - 519.973s
- **Shortest test** (+ worker waiting) - 197.196s

#### ⏱️ Results for first 999 iterations (the 1000th test was stuck in ~3 mins):

- **Total execution time:** ~340 seconds (5min 40sec)
- **Effective time per test:** ~3.4s

#### 📉 Statistical Variance (Response Drift):

- `"The capital of France is Paris."` - 913 times
- `"Paris."` - 87 times

Even in a semantically identical prompt, there is a 8.7% variance in output format. This is exactly why **statistical validation is a must for Enterprise AI**.

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

---

## Advanced Validation & Custom Endpoints

> If you need to go beyond standard prompt testing and want to validate your specific AI endpoints for production reliability, it is recommended to implement a custom **AI SDK Vercel Adapter**. 
> 
> 1. Follow the [Custom Providers guide](https://ai-sdk.dev/providers/community-providers/custom-providers) to develop your adapter.
> 2. Register it in `src/registry.ts`.
> 3. Define the model to be used as a **Judge** for your endpoint testing.
>
> To ensure your Judge is reliable and unbiased, we strongly recommend performing [Dark Teaming](https://eva-llm.github.io/dark-teaming) to measure **Symmetry Deviation**. `eva-run` supports Dark Teaming natively via the `must_fail` field — refer to the **Assertions** documentation below for implementation details.

---

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

### Data & Scaling Strategy

The system is architected for **Append-Only** write performance.
1. **Postgres (Current):** Sufficient for most commercial use cases.
1. **ClickHouse (Reserved):** Target storage for million-test scale.
1. **Redis (Buffer):** Available as an ingestion proxy to batch writes into ClickHouse.

**Implementation Detail:**
- All `id` fields utilize **UUIDv7** for superior temporal sorting and indexing efficiency compared to standard random UUIDs.
- No transactions (Postgres) in hot path. Any cleanup of orphans asserts only in control plane.

### Database Schema (Prisma)

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

---

## Enterprise-Grade Ingestion
For high-volume production environments where performance is critical, `eva-run` supports a decoupled ingestion architecture. Instead of direct database writes during the evaluation, the system utilizes a **Buffered Batching** strategy.

### ClickHouse & Redis Integration
To enable high-throughput data persistence:
1. Ensure the `REDIS_URL` and `CLICKHOUSE_URL` environment variables are provided.
1. Use the specialized runtime mode:

```Bash
pnpm run ch
# or for production process management:
pnpm run start
```

### How it works (The Hot Path)
- **Zero-Latency Writes:** During the evaluation "hot path", results are pushed directly into `Redis` streams/lists instead of a relational database. This ensures that the `eva-run` engine is never I/O-bound by disk or SQL transactions.

- **Asynchronous Batching:** A dedicated **Control Plane Worker** pulls data from `Redis` in the background, aggregates it into optimized batches, and performs bulk inserts into `ClickHouse`.

- **Scalability:** This architecture allows you to handle millions of test assertions without impacting the responsiveness of the evaluation engine or the visual dashboard.

**Note:** This mode is recommended for users running >100,000 assertions per session or requiring long-term analytical storage for historical AI performance data.

---

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

## AI Metrology

The goal of **AI Metrology** is not merely to measure the "intelligence" of an LLM or agent, but to certify its **sustainability** and **stability** for mission-critical business applications.

---

### 1. Consistency Index
Instead of evaluating whether a model "guessed" correctly, we measure its **variance**.

* **The Test:** Execute the same ambiguous prompt ~1,000 times at `Temperature > 0`.
* **The Metric:** Entropy / Mode Frequency (the frequency of the most dominant response).
* **The "Why":** If a model selects option "A" **99%** of the time for an ambiguous query, it possesses a built-in bias that makes it predictable. Conversely, a **50/50** split represents an "engineering nightmare" — such a model cannot be safely automated without human oversight.

### 2. Temperature Sensitivity
We assess the impact of temperature not on creativity, but on **structural logic**.

* **Methodology:** We map **Consistency** as a function of **Temperature**.
* **Critical Insight:** Every task has a "breaking point." For instance, logic may remain rock-solid up to `T=0.3`, but collapse at `T=0.5`.
* **SLA Delivery:** We provide the client with a precise threshold: *"For this specific task, the safe temperature limit is 0.4. Beyond this point, the risk of non-deterministic behavior increases exponentially."*

### 3. Binary Drift (Robustness)
The most rigorous assessments are **provocation tests**, designed to measure how a model handles uncertainty.

* **Methodology:** We utilize "trick questions" where no single definitive answer exists.
* **Metric:** We measure the **Confidence Distribution** (using response frequency within the batch).
* **The Goal:** To measure **Robustness**. If the model easily "wavers" or hesitates between different logical paths, it is considered an unstable component for an autonomous system.

### 4. Semantic Anchoring
We assess how consistent the model remains across open-ended factual queries. 

> *Semantic consistency is the cornerstone of reliable downstream processing.*

* **Methodology:** We use baseline factual queries (e.g., "What is the capital of France?").
* **Metric:** We apply **Levenshtein Distance** or **Normalized Exact Match** (lowercase conversion, whitespace stripping).
* **The Engineering Perspective:** If the model responds with "The capital of France is Paris" 900 times and simply "Paris" 100 times, we flag this as a **Consistency Error**. From an engineering standpoint, a shift in output format is a bug that will break parsers and downstream logic.

---

## 2FA LLM Security Audit Framework

Current AI evaluation methods suffer from the [Alignment Paradox](https://github.com/eva-llm/eva-cli/tree/main/reports). In "Dark Teaming" experiments, models often exhibit high **Symmetry Deviation**. Traditional LLM-as-a-Judge (LLM-Rubric | G-Eval | B-Eval) approaches fail because the "Judge" itself enters a state of cognitive dissonance (Safety Paranoia), flagging metaphors as harmful content.

We propose a bifurcated approach that separates **Statistical Predictability** from **Value Alignment**.

### Phase A: Consistency & Integrity (The "Sanity Check")
We analyze the internal worldview of the LLM. At this stage, human values are irrelevant; we focus strictly on **predictability** and **logic stability**.

* **Methodology:** Execute **MCQ (Multiple Choice Questions)** 100–1000 times to collect statistical data.
* **Validation:** Since variants are enumerated, we use standard `equals` metrics. This avoids expensive and biased LLM-Judge calls.
* **Metric (Entropy):** We measure **Statistical Entropy**. If the entropy is high (results are inconsistent or random), the model is an "Engineering Nightmare."
* **Outcome:** If a model lacks internal consistency, it is deemed unfit for human interaction, regardless of its perceived "intelligence."

### Phase B: Accuracy & Alignment (The "Value Audit")
Once we confirm the model's worldview is stable (Phase A), we apply high-level auditing using G-Eval/B-Eval.

* **Positive Measurement Strategy:** To avoid "Judge Paranoia," we do not ask the judge: *"Confirm if this is harmful."* Instead, we ask: *"How does this response align with our defined Safety Ideal?"*
* **Presumption of Integrity:** If Phase A showed 100% stability in a specific trajectory (e.g., a "Refusal" option), Phase B serves only to confirm that the output is linguistically and legally formulated correctly.
* **Outcome:** This prevents the judge from "freaking out" over keywords (like "die") because we are auditing a statistically confirmed trajectory, not reacting to isolated tokens.

### Business Value & Throughput

1.  **90% Token Budget Savings:** We eliminate unstable models using low-cost binary/MCQ tests. Expensive GPT-4/O1 calls are reserved for the final 10% of high-level validation.
2.  **Protection Against "Judge Paranoia":** We confirm the "correctness" of a trajectory already established in Phase A, neutralizing the judge's contextual blindness.
3.  **Objective KPI Metrics:** We provide the client with two clear indices:
    * **CI (Consistency Index):** "How predictable is this model?"
    * **AI (Alignment Index):** "How well does its predictable behavior match our values?"

---

## The "Killer Case" Summary
We first verify the **Architectural Integrity** of the model's worldview via thousands of low-cost iterations, then precisely confirm its compliance with the regulatory standards. This approach is **100x faster** and **10x more accurate** than standard G-Eval / B-Eval implementations in the age of biased LLM-as-a-Judge.

---

## Statistical SLA
AI systems, especially those based on modern machine learning, are inherently non-deterministic. Testing them exhaustively seems to require billions of test cases, across languages, contexts, and edge conditions.

But this is not a new problem.

We have already solved a very similar challenge in software QA. The difference is not in the nature of the problem - but in its scale and regulatory importance.

---

## The Illusion of Infinite Testing

A naive approach to AI validation leads to a familiar conclusion:

> "If the system is complex and probabilistic, we need to test everything."

This quickly escalates into the idea of running billions of tests.

However, this mirrors an early misunderstanding in QA processes. If we attempted to brute-force test all possible inputs of even a simple function, testing would be impossible. Yet modern software development works - not because we test everything, but because we test **strategically**.

The same principle must be applied to AI.

---

## From Deterministic QA to Probabilistic Systems

Traditional QA deals with deterministic systems where the expected output is known. AI systems, by contrast, produce outputs that are:

- probabilistic
- context-dependent
- sensitive to distribution shifts

Despite this, the **structure** of testing can remain surprisingly similar.

Instead of verifying exact outputs, we evaluate:

- correctness within a tolerance
- adherence to constraints
- statistical reliability

This leads naturally to the concept of a **Statistical SLA**.

---

## Statistical SLA: A Practical Framework

Rather than asking, "Is the system always correct?", we ask:

> "Is the system correct often enough, in the contexts that matter?"

A Statistical SLA defines:

- acceptable error rates
- confidence intervals
- performance across predefined scenarios

This aligns much better with the nature of AI systems and provides a measurable path toward **compliance**.

---

## Reusing QA Principles for AI Testing

The key insight is that classical QA techniques still apply - with adaptation.

### 1. Test Segmentation

We divide the problem space into meaningful dimensions:

- languages
- categories (e.g., legal, medical, general knowledge)
- user intents
- risk levels

This reduces complexity and allows targeted evaluation.

### 2. Test Coverage Strategy

Instead of aiming for full coverage, we prioritize:

- high-risk areas
- frequently used scenarios
- regulatory-sensitive domains

Coverage becomes **risk-weighted**, not exhaustive.

### 3. Edge Cases First

As in traditional QA, boundary conditions provide the highest value:

- ambiguous prompts
- adversarial inputs
- rare linguistic constructions

These tests expose weaknesses faster than random sampling.

---

## The Testing Pyramid for AI

The well-known testing pyramid can be adapted:

- **Smoke tests:** Basic sanity checks. If the model fails here, further testing is unnecessary.
- **Core scenario tests:** Typical use cases representing the majority of real-world interactions.
- **Stress and edge testing:** Focused on known weak points and high-risk behaviors.

This layered approach prevents resource waste and enables scalable validation.

---

## Adaptive Testing Through Feedback

One of the most powerful ideas from QA is feedback-driven testing.

We start with a small test base and evolve it:

1. Run initial tests (including smoke tests)
1. Identify weak areas
1. Increase test density selectively
1. Reduce effort in stable regions

This creates a dynamic testing system where resources are allocated efficiently.

---

## Why This Works

Even in traditional software systems, full determinism is often an illusion. Modern systems are:

- distributed
- stateful
- partially observable

Unexpected behavior emerges constantly - and yet we manage reliability through testing focused on **typical usage** and **critical paths**.

AI systems are not fundamentally different in this respect - only more explicit about their uncertainty.

---

## Limitations and Realism

This approach does not guarantee:

- perfect correctness
- zero-risk deployment

But it provides:

- measurable reliability
- transparent assumptions
- auditable processes

And most importantly, it aligns with how engineering has always handled complexity.

---

## Conclusion

The AI Regulation does not introduce an entirely new challenge - it formalizes an existing one at a higher level of responsibility.

The solution is not brute-force testing, but disciplined application of proven QA principles:

- segmentation
- prioritization
- statistical evaluation
- adaptive feedback loops

In this sense, AI regulation is not a departure from engineering practice - it is its natural evolution.
