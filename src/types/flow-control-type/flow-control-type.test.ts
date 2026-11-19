import { describe, expectTypeOf, it } from 'vitest';
import type { FlowControlType } from './flow-control-type.ts';

describe('FlowControlType', () => {
  it('exposes exactly the values of the Web Serial `FlowControlType` enum', () => {
    expectTypeOf<FlowControlType>().toEqualTypeOf<'none' | 'hardware'>();
  });
});
