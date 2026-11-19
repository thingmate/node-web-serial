import { describe, expectTypeOf, it } from 'vitest';
import type { SerialInputSignals } from './serial-input-signals.ts';

describe('SerialInputSignals', () => {
  it('exposes exactly the members of the Web Serial `SerialInputSignals` dictionary', () => {
    expectTypeOf<SerialInputSignals>().toEqualTypeOf<{
      readonly dataCarrierDetect: boolean;
      readonly clearToSend: boolean;
      readonly ringIndicator: boolean;
      readonly dataSetReady: boolean;
    }>();
  });
});
