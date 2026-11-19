/**
 * Modem control signals reported by a serial port, mirroring the Web Serial
 * API `SerialInputSignals` dictionary.
 *
 * @see https://serial.spec.whatwg.org/#dom-serialinputsignals
 */
export interface SerialInputSignals {
  /** Data Carrier Detect (DCD) signal. */
  readonly dataCarrierDetect: boolean;
  /** Clear To Send (CTS) signal. */
  readonly clearToSend: boolean;
  /** Ring Indicator (RI) signal. */
  readonly ringIndicator: boolean;
  /** Data Set Ready (DSR) signal. */
  readonly dataSetReady: boolean;
}
