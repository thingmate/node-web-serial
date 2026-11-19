import { SerialPort } from 'serialport';
import type { BindingInterface } from '@serialport/bindings-cpp';
import { specError } from '../spec-errors/spec-errors.private.ts';
import type { SerialOptions } from '../../types/serial-options/serial-options.ts';
import type { SerialPortInfo } from '../../types/serial-port-info/serial-port-info.ts';

/**
 * A Web Serial API `SerialPort` implementation for Node.js, speaking to real
 * hardware through a `serialport` binding. Browser code written against a
 * native `SerialPort` runs against this class unchanged; the Web Serial
 * semantics (state machine, stream lifecycle, errors) are implemented per the
 * WHATWG specification.
 */
export class NodeSerialPort {
  readonly #path: string;
  readonly #info: SerialPortInfo;
  readonly #binding: BindingInterface;
  #state: 'closed' | 'opening' | 'opened' | 'closing' = 'closed';
  #connected = false;

  constructor({
    path,
    info,
    binding,
  }: {
    path: string;
    info?: SerialPortInfo;
    binding?: BindingInterface;
  }) {
    this.#path = path;
    this.#info = info ?? {};
    this.#binding = binding ?? SerialPort.binding;
  }

  /**
   * The operating system path of the port, for example `/dev/ttyUSB0` or
   * `COM3`. Node extension: the `SerialPort` interface identifies ports by
   * USB or Bluetooth identity, which a plain serial device does not carry.
   */
  get path(): string {
    return this.#path;
  }

  /**
   * Whether the device behind the port is connected to the system. True from
   * a successful {@linkcode NodeSerialPort.open} until the driver reports a
   * disconnect.
   */
  get connected(): boolean {
    return this.#connected;
  }

  /** Reports the USB identity of the underlying device, when it has one. */
  getInfo(): SerialPortInfo {
    return this.#info;
  }

  /**
   * Revokes the permission granted to this port. Node keeps no permission
   * store, so this resolves without acting — the specification explicitly
   * allows an agent that cannot revoke to resolve with `undefined`.
   */
  async forget(): Promise<void> {}

  /**
   * Opens the port with the given connection parameters, mirroring the
   * `SerialPort.open` steps: dictionary validation rejects with `TypeError`,
   * an already-open (or opening/closing) port rejects with an
   * `InvalidStateError` DOMException, and a failed driver open rejects with a
   * `NetworkError` DOMException while leaving the port closed and openable.
   *
   * On success the port is `connected` and the readable and writable streams
   * become available.
   */
  async open(options: SerialOptions): Promise<void> {
    if (this.#state !== 'closed') {
      throw specError('InvalidStateError', 'The serial port is not closed.');
    }
    if (options.baudRate === 0) {
      throw new TypeError('"baudRate" must not be 0.');
    }
    if (options.dataBits !== undefined && options.dataBits !== 7 && options.dataBits !== 8) {
      throw new TypeError('"dataBits" must be 7 or 8.');
    }
    if (options.stopBits !== undefined && options.stopBits !== 1 && options.stopBits !== 2) {
      throw new TypeError('"stopBits" must be 1 or 2.');
    }
    if (options.bufferSize !== undefined && options.bufferSize === 0) {
      throw new TypeError('"bufferSize" must not be 0.');
    }
    this.#state = 'opening';
    try {
      await this.#binding.open({
        path: this.#path,
        baudRate: options.baudRate,
        // The checks above narrowed the values; the binding's numeric unions cannot see it.
        dataBits: (options.dataBits ?? 8) as 7 | 8,
        stopBits: (options.stopBits ?? 1) as 1 | 1.5 | 2,
        parity: options.parity ?? 'none',
        rtscts: options.flowControl === 'hardware',
        lock: true,
      });
    } catch (error) {
      this.#state = 'closed';
      throw specError(
        'NetworkError',
        `Failed to open the serial port: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.#state = 'opened';
    this.#connected = true;
  }
}
