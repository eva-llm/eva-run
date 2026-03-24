import { Static, Type } from '@sinclair/typebox';


export const ASSERT_NAMES = {
  GEVAL: 'g-eval',
  LLM_RUBRIC: 'llm-rubric',
} as const;

export const AssertNameEnum = Type.Union(
  Object.values(ASSERT_NAMES).map((val) => Type.Literal(val))
);

export type AssertName = (typeof ASSERT_NAMES)[keyof typeof ASSERT_NAMES];

export const AssertSchema = Type.Object({
  name: AssertNameEnum,
  provider: Type.String(),
  model: Type.String(),
  criteria: Type.String(),
  threshold: Type.Optional(Type.Number({ default: 0.5 })),
  temperature: Type.Optional(Type.Number({ default: 0.0 })),
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
  passed: boolean;
  score: number;
  reason: string;
  started_at: Date;
  finished_at: Date;
  diff_ms: number;
}
