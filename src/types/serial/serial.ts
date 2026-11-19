import type { SerialPortRequestOptions } from '../serial-port-request-options/serial-port-request-options.ts';
import type { SerialPort } from '../serial-port/serial-port.ts';

/**
 * Entry point of the Web Serial API, mirroring the `Serial` interface exposed
 * as `navigator.serial` in browsers. A Node.js implementation enumerates ports
 * directly instead of driving a user permission prompt.
 *
 * @see https://serial.spec.whatwg.org/#serial-interface
 */
export interface Serial extends EventTarget {
  /** Handles a port being connected to the system. */
  onconnect: ((this: Serial, event: Event) => any) | null;
  /** Handles a port being disconnected from the system. */
  ondisconnect: ((this: Serial, event: Event) => any) | null;

  /** Lists every serial port the system exposes. */
  getPorts(): Promise<SerialPort[]>;
  /** Selects a serial port; browsers require a user gesture for this call. */
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;

  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: Serial, event: Event) => any,
  ): void;
  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: Serial, event: Event) => any,
  ): void;
}
