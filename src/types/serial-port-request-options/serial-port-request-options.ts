import type { BluetoothServiceUUID } from '../bluetooth-service-uuid/bluetooth-service-uuid.ts';
import type { SerialPortFilter } from '../serial-port-filter/serial-port-filter.ts';

/**
 * Options of `Serial.requestPort()`, mirroring the Web Serial API
 * `SerialPortRequestOptions` dictionary. A port is offered to the user when it
 * matches at least one filter.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialportrequestoptions
 */
export interface SerialPortRequestOptions {
  /** Filters a port must match, any of them, to be offered to the user. */
  readonly filters?: SerialPortFilter[];
  /** Bluetooth service class UUIDs allowed during port selection. */
  readonly allowedBluetoothServiceClassIds?: BluetoothServiceUUID[];
}
