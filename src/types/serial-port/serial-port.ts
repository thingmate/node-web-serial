import type { SerialInputSignals } from '../serial-input-signals/serial-input-signals.ts';
import type { SerialOptions } from '../serial-options/serial-options.ts';
import type { SerialOutputSignals } from '../serial-output-signals/serial-output-signals.ts';
import type { SerialPortInfo } from '../serial-port-info/serial-port-info.ts';

/**
 * A serial port, mirroring the Web Serial API `SerialPort` interface.
 *
 * `readable` and `writable` are `null` while the port is not open.
 *
 * @see https://serial.spec.whatwg.org/#serialport-interface
 */
export interface SerialPort extends EventTarget {
  /** Handles the port being connected to the system. */
  onconnect: ((this: SerialPort, event: Event) => any) | null;
  /** Handles the port being disconnected from the system. */
  ondisconnect: ((this: SerialPort, event: Event) => any) | null;
  /** Whether the port is logically connected to the system. */
  readonly connected: boolean;
  /** Incoming bytes, or `null` while the port is not open. */
  readonly readable: ReadableStream<Uint8Array> | null;
  /** Outgoing bytes, or `null` while the port is not open. */
  readonly writable: WritableStream<Uint8Array> | null;

  /** Reports the USB and Bluetooth identity of the port. */
  getInfo(): SerialPortInfo;
  /** Opens the port. */
  open(options: SerialOptions): Promise<void>;
  /** Sets modem control signals; omitted members keep their current state. */
  setSignals(signals?: SerialOutputSignals): Promise<void>;
  /** Reads modem control signals. */
  getSignals(): Promise<SerialInputSignals>;
  /** Closes the port, returning it to the operating system. */
  close(): Promise<void>;
  /** Revokes the permission granted to this port. */
  forget(): Promise<void>;

  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: SerialPort, event: Event) => any,
  ): void;
  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: SerialPort, event: Event) => any,
  ): void;
}
