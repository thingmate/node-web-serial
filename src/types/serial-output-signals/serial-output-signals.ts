/**
 * Modem control signals to set on a serial port, mirroring the Web Serial API
 * `SerialOutputSignals` dictionary. Omitted members keep their current state.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialoutputsignals
 */
export interface SerialOutputSignals {
  /** Data Terminal Ready (DTR) signal. */
  readonly dataTerminalReady?: boolean;
  /** Request To Send (RTS) signal. */
  readonly requestToSend?: boolean;
  /** Break signal. */
  readonly break?: boolean;
}
