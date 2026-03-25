import { Static, Type } from '@sinclair/typebox';


export const ASSERT_NAMES = {
  GEVAL: 'g-eval',
  LLM_RUBRIC: 'llm-rubric',
  EQUALS: 'equals',
  NOT_EQUALS: 'not-equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not-contains',
  REGEX: 'regex',
} as const;

export const AssertNameEnum = Type.Union(
  Object.values(ASSERT_NAMES).map((val) => Type.Literal(val))
);

export type AssertName = (typeof ASSERT_NAMES)[keyof typeof ASSERT_NAMES];

/**
 * Unified Assert Schema.
 * We use a flat structure for simplicity and speed.
 * Specific fields (model, provider, temperature) are used only by LLM-based matchers.
 * Over-engineering with Discriminated Unions is avoided to keep the core lightweight.
 */
export const AssertSchema = Type.Object({
  name: AssertNameEnum,
  criteria: Type.String(),
  threshold: Type.Optional(Type.Number({ default: 0.5 })),
  // llm-as-judge fields
  provider: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  temperature: Type.Optional(Type.Number({ default: 0.0 })),
  // text compare fields
  case_sensitive: Type.Optional(Type.Boolean({ default: true })),
});
export type AssertSchemaT = Static<typeof AssertSchema>;

export const TestSchema = Type.Object({
  run_id: Type.String({ format: 'uuid' }),
  test_id: Type.Optional(Type.String({ format: 'uuid' })),
  provider: Type.String(),
  model: Type.String(),
  prompt: Type.String(),
  asserts: Type.Array(AssertSchema),
});
export type TestSchemaT = Static<typeof TestSchema>;

export const EvalResponse = Type.Object({
  test_id: Type.String({ format: 'uuid' }),
});
export type EvalResponseT = Static<typeof EvalResponse>;

export interface IAssertResult {
  name: string;
  criteria: string;
  passed: boolean;
  score: number;
  reason: string;
  threshold: number;
  metadata?: Record<string, any>;
  started_at: Date;
  finished_at: Date;
  diff_ms: number;
}

export interface ITestResult {
  id: string;
  run_id: string;
  provider: string;
  model: string;
  prompt: string;
  output: string;
  passed: boolean;
  started_at: Date;
  assert_started_at: Date;
  finished_at: Date;
  diff_ms: number;
  assert_diff_ms: number;
  output_diff_ms: number;
}
