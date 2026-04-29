import {
  type Static,
  Type,
} from '@sinclair/typebox';


export const ASSERT_NAMES = {
  BEVAL: 'b-eval',
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

export type TAssertName = (typeof ASSERT_NAMES)[keyof typeof ASSERT_NAMES];

/**
 * Unified Assert Schema.
 * We use a flat structure for simplicity and speed.
 * Specific fields (model, provider, temperature) are used only by LLM-based matchers.
 * Over-engineering with Discriminated Unions is avoided to keep the core lightweight.
 */
export const AssertSchema = Type.Object({
  name: AssertNameEnum,
  criteria: Type.String(),
  threshold: Type.Optional(Type.Number()),
  // llm-as-judge fields
  provider: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  options: Type.Optional(Type.Record(Type.String(), Type.Any())),
  must_fail: Type.Optional(Type.Boolean()),
  // G-Eval/B-Eval fields
  answer_only: Type.Optional(Type.Boolean()),
  // text compare fields
  case_sensitive: Type.Optional(Type.Boolean()),
});
export type TAssertSchema = Static<typeof AssertSchema>;

const BaseTest = Type.Object({
  run_id: Type.String({ format: 'uuid' }),
  test_id: Type.Optional(Type.String({ format: 'uuid' })),
  prompt: Type.String(),
  asserts: Type.Array(AssertSchema),
});

const LiveTest = Type.Intersect([
  BaseTest,
  Type.Object({
    provider: Type.String(),
    model: Type.String(),
    options: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
]);

const AuditTest = Type.Intersect([
  BaseTest,
  Type.Object({
    output: Type.String(),
  }),
]);

export const TestSchema = Type.Union([LiveTest, AuditTest]);
export type TTestSchema = Static<typeof TestSchema>;

export const EvalResponse = Type.Object({
  test_ids: Type.Array(Type.String({ format: 'uuid' })),
});
export type TEvalResponse = Static<typeof EvalResponse>;

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
  provider?: string;
  model?: string;
  prompt: string;
  output: string;
  passed: boolean;
  metadata?: Record<string, any>;
  started_at: Date;
  assert_started_at: Date;
  finished_at: Date;
  diff_ms: number;
  assert_diff_ms: number;
  output_diff_ms: number;
}

export type TSaveTestResult = (
  testResult: ITestResult,
  assertResults: IAssertResult[],
) => Promise<void>;

export interface ICluster {
  startPinging: () => void;
  notifyTestDone: (testId: string) => Promise<number>;
}
