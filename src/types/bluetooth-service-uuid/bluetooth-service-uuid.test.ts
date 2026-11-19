import { describe, expectTypeOf, it } from 'vitest';
import type { BluetoothServiceUUID } from './bluetooth-service-uuid.ts';

describe('BluetoothServiceUUID', () => {
  it('accepts a 16/32-bit assigned number or a full UUID string', () => {
    expectTypeOf<BluetoothServiceUUID>().toEqualTypeOf<number | string>();
  });
});
