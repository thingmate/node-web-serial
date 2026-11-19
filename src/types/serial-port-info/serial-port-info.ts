import type { BluetoothServiceUUID } from '../bluetooth-service-uuid/bluetooth-service-uuid.ts';

/**
 * Identity of a serial port, mirroring the Web Serial API `SerialPortInfo`
 * dictionary. USB members are undefined for ports outside a USB bus, and
 * `bluetoothServiceClassId` is defined only for ports backed by a Bluetooth
 * service.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialportinfo
 */
export interface SerialPortInfo {
  /** USB vendor identifier of the device, when it sits on a USB bus. */
  readonly usbVendorId?: number;
  /** USB product identifier of the device, when it sits on a USB bus. */
  readonly usbProductId?: number;
  /** Bluetooth service class UUID, when the port is a Bluetooth service. */
  readonly bluetoothServiceClassId?: BluetoothServiceUUID;
}
