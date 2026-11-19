import type { FlowControlType } from '../flow-control-type/flow-control-type.ts';
import type { ParityType } from '../parity-type/parity-type.ts';

/**
 * Options opening a serial port, mirroring the Web Serial API `SerialOptions`
 * dictionary.
 *
 * Defaults: `dataBits` 8, `stopBits` 1, `parity` 'none', `bufferSize` 255,
 * `flowControl` 'none'.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialoptions
 */
export interface SerialOptions {
  /** Baud rate of the connection, in bits per second. */
  readonly baudRate: number;
  /** Number of data bits per frame: 7 or 8. Defaults to 8. */
  readonly dataBits?: number;
  /** Number of stop bits per frame: 1 or 2. Defaults to 1. */
  readonly stopBits?: number;
  /** Parity mode of the connection. Defaults to 'none'. */
  readonly parity?: ParityType;
  /** Size, in bytes, of the read and write buffers. Defaults to 255. */
  readonly bufferSize?: number;
  /** Flow control mode of the connection. Defaults to 'none'. */
  readonly flowControl?: FlowControlType;
}
