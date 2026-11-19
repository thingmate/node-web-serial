import { describe, expectTypeOf, it } from 'vitest';
import type { FlowControlType } from '../flow-control-type/flow-control-type.ts';
import type { ParityType } from '../parity-type/parity-type.ts';
import type { SerialOptions } from './serial-options.ts';

describe('SerialOptions', () => {
  it('exposes exactly the members of the Web Serial `SerialOptions` dictionary', () => {
    expectTypeOf<SerialOptions>().toEqualTypeOf<{
      readonly baudRate: number;
      readonly dataBits?: number;
      readonly stopBits?: number;
      readonly parity?: ParityType;
      readonly bufferSize?: number;
      readonly flowControl?: FlowControlType;
    }>();
  });

  it('requires `baudRate`', () => {
    // @ts-expect-error: `baudRate` is a required dictionary member in the spec.
    expectTypeOf<{ readonly dataBits?: number }>().toEqualTypeOf<SerialOptions>();
  });
});
