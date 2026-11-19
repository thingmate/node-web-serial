import { describe, expectTypeOf, it } from 'vitest';
import type { ParityType } from './parity-type.ts';

describe('ParityType', () => {
  it('exposes exactly the values of the Web Serial `ParityType` enum', () => {
    expectTypeOf<ParityType>().toEqualTypeOf<'none' | 'even' | 'odd'>();
  });
});
