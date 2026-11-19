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
  #connected = false;

  constructor({ path, info }: { path: string; info?: SerialPortInfo }) {
    this.#path = path;
    this.#info = info ?? {};
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
}
