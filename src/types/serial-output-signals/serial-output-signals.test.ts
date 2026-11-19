import { describe, expectTypeOf, it } from 'vitest';
import type { SerialOutputSignals } from './serial-output-signals.ts';

describe('SerialOutputSignals', () => {
  it('exposes exactly the members of the Web Serial `SerialOutputSignals` dictionary', () => {
    expectTypeOf<SerialOutputSignals>().toEqualTypeOf<{
      readonly dataTerminalReady?: boolean;
      readonly requestToSend?: boolean;
      readonly break?: boolean;
    }>();
  });
});
