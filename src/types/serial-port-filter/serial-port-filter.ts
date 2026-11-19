import type { BluetoothServiceUUID } from '../bluetooth-service-uuid/bluetooth-service-uuid.ts';

/**
 * Filter selecting serial ports during `Serial.requestPort()`, mirroring the
 * Web Serial API `SerialPortFilter` dictionary. A port matches a filter when
 * every present member equals the port identity.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialportfilter
 */
export interface SerialPortFilter {
  /** USB vendor identifier to match, when the port sits on a USB bus. */
  readonly usbVendorId?: number;
  /** USB product identifier to match, when the port sits on a USB bus. */
  readonly usbProductId?: number;
  /** Bluetooth service class UUID to match, when the port is a Bluetooth service. */
  readonly bluetoothServiceClassId?: BluetoothServiceUUID;
}
