import { SerialPort as SerialPortDriver } from 'serialport';
import type { BindingInterface, BindingPortInterface } from '@serialport/bindings-cpp';
import { specError } from '../spec-errors/spec-errors.private.ts';
import type { SerialInputSignals } from '../../types/serial-input-signals/serial-input-signals.ts';
import type { SerialOptions } from '../../types/serial-options/serial-options.ts';
import type { SerialOutputSignals } from '../../types/serial-output-signals/serial-output-signals.ts';
import type { SerialPort } from '../../types/serial-port/serial-port.ts';
import type { SerialPortInfo } from '../../types/serial-port-info/serial-port-info.ts';

/**
 * A Web Serial API `SerialPort` implementation for Node.js, speaking to real
 * hardware through a `serialport` binding. Browser code written against a
 * native `SerialPort` runs against this class unchanged; the Web Serial
 * semantics (state machine, stream lifecycle, errors) are implemented per the
 * WHATWG specification.
 */
export class NodeSerialPort extends EventTarget implements SerialPort {
  readonly #path: string;
  readonly #info: SerialPortInfo;
  readonly #binding: BindingInterface;
  #state: 'closed' | 'opening' | 'opened' | 'closing' = 'closed';
  #connected = false;
  #port: BindingPortInterface | undefined;
  #bufferSize = 255;
  #readable: ReadableStream<Uint8Array> | null = null;
  #readFatal = false;
  #readController: ReadableByteStreamController | undefined;
  #writable: WritableStream<Uint8Array> | null = null;
  #writeFatal = false;
  #writeController: WritableStreamDefaultController | undefined;
  #signals = { dtr: true, rts: true, brk: false };

  /** Handles the port being connected to the system. Never fired in Node: there is no hotplug detection. */
  onconnect: ((this: SerialPort, event: Event) => any) | null = null;

  /** Handles the port being disconnected from the system, fired when the driver reports a disconnect. */
  ondisconnect: ((this: SerialPort, event: Event) => any) | null = null;

  constructor({
    path,
    info,
    binding,
  }: {
    path: string;
    info?: SerialPortInfo;
    binding?: BindingInterface;
  }) {
    super();
    this.#path = path;
    this.#info = info ?? {};
    this.#binding = binding ?? SerialPortDriver.binding;
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
      this.#port = await this.#binding.open({
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
    this.#bufferSize = options.bufferSize ?? 255;
    this.#signals = { dtr: true, rts: true, brk: false };
  }

  /**
   * Incoming bytes as a byte-oriented web stream, or `null` while the port is
   * not open. A driver read error errors the stream with an `UnknownError`
   * DOMException and releases it — the next access creates a fresh stream, so
   * consumers can recover the way the specification's read loop describes.
   * Only a driver disconnect makes `readable` permanently `null`.
   *
   * Reads are pull-based: the operating system is only asked for data when a
   * consumer pulls, and each read fills at most `bufferSize` bytes.
   */
  get readable(): ReadableStream<Uint8Array> | null {
    if (this.#readable !== null) {
      return this.#readable;
    }
    if (this.#state !== 'opened' || this.#readFatal) {
      return null;
    }
    const port: BindingPortInterface = this.#port!;
    this.#readable = new ReadableStream(
      {
        type: 'bytes',
        autoAllocateChunkSize: this.#bufferSize,
        start: (controller) => {
          this.#readController = controller;
        },
        pull: (controller) => this.#pullRead(port, controller),
        cancel: (): void => {
          this.#readable = null;
        },
      },
      { highWaterMark: this.#bufferSize },
    );
    return this.#readable;
  }

  /** Pull algorithm of the readable stream: one driver read into the BYOB view. */
  async #pullRead(
    port: BindingPortInterface,
    controller: ReadableByteStreamController,
  ): Promise<void> {
    const view: ArrayBufferView | null = controller.byobRequest?.view ?? null;
    if (view === null) {
      // The spec guarantees a BYOB view here, but Node also invokes pull without
      // one while cancelling a locked stream: treat it as nothing to do.
      return;
    }
    try {
      const { bytesRead }: { buffer: Buffer; bytesRead: number } = await port.read(
        Buffer.from(view.buffer, view.byteOffset, view.byteLength),
        view.byteOffset,
        view.byteLength,
      );
      if (this.#readable === null || this.#state !== 'opened') {
        return;
      }
      controller.byobRequest?.respond(bytesRead);
    } catch (error) {
      if (this.#isCanceled(error)) {
        return;
      }
      if (this.#isDisconnect(error)) {
        this.#disconnect(error instanceof Error ? error.message : String(error));
        return;
      }
      if (this.#state !== 'opened') {
        return;
      }
      controller.error(
        specError(
          'UnknownError',
          `Failed to read from the serial port: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      this.#readable = null;
    }
  }

  /**
   * Outgoing bytes as a web stream, or `null` while the port is not open.
   * Chunks are queued with byte-counting backpressure (`bufferSize` bytes of
   * high water mark, the specification's model) and each chunk is copied
   * before reaching the driver. A driver write error errors the stream with
   * an `UnknownError` DOMException and releases it — the next access creates
   * a fresh stream. Only a driver disconnect makes `writable` permanently
   * `null`.
   *
   * Closing the stream drains the driver (waits until everything was
   * transmitted); aborting it discards queued chunks without touching the
   * operating system buffers.
   */
  get writable(): WritableStream<Uint8Array> | null {
    if (this.#writable !== null) {
      return this.#writable;
    }
    if (this.#state !== 'opened' || this.#writeFatal) {
      return null;
    }
    const port: BindingPortInterface = this.#port!;
    this.#writable = new WritableStream<Uint8Array>(
      {
        start: (controller) => {
          this.#writeController = controller;
        },
        write: async (chunk: Uint8Array): Promise<void> => {
          await this.#writeChunk(port, chunk);
        },
        close: async (): Promise<void> => {
          await port.drain();
          this.#writable = null;
        },
        abort: async (): Promise<void> => {
          this.#writable = null;
        },
      },
      {
        highWaterMark: this.#bufferSize,
        size: (chunk: Uint8Array): number => chunk.byteLength,
      },
    );
    return this.#writable;
  }

  /** Write algorithm of the writable stream: copy the chunk, then hand it to the driver. */
  async #writeChunk(port: BindingPortInterface, chunk: Uint8Array): Promise<void> {
    const buffer: Buffer = Buffer.from(chunk);
    try {
      await port.write(buffer);
    } catch (error) {
      if (this.#isCanceled(error)) {
        return;
      }
      if (this.#isDisconnect(error)) {
        this.#disconnect(error instanceof Error ? error.message : String(error));
        return;
      }
      this.#writable = null;
      throw specError(
        'UnknownError',
        `Failed to write to the serial port: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Whether a driver error reports a device disconnect (bindings mark raw failures with the flag). */
  #isDisconnect(error: unknown): boolean {
    return error instanceof Error && (error as { disconnected?: boolean }).disconnected === true;
  }

  /** Whether a driver error reports an orderly cancellation, as raised when closing in-flight operations. */
  #isCanceled(error: unknown): boolean {
    return error instanceof Error && (error as { canceled?: boolean }).canceled === true;
  }

  /**
   * Shared disconnect algorithm: both streams become fatally broken, the port
   * reports itself as disconnected, and a single `disconnect` event is fired.
   */
  #disconnect(reason: string): void {
    if (this.#readFatal) {
      return;
    }
    const networkError: DOMException = specError('NetworkError', reason);
    const readable: ReadableStream<Uint8Array> | null = this.#readable;
    const writable: WritableStream<Uint8Array> | null = this.#writable;
    this.#readFatal = true;
    this.#writeFatal = true;
    this.#connected = false;
    this.#readable = null;
    this.#writable = null;
    if (readable !== null) {
      this.#readController?.error(networkError);
    }
    if (writable !== null) {
      this.#writeController?.error(networkError);
    }
    this.#fireEvent('disconnect');
  }

  /** Fires a connect or disconnect event to the property handler, then to the event listeners. */
  #fireEvent(type: 'connect' | 'disconnect'): void {
    const event: Event = new Event(type);
    const handler: ((this: NodeSerialPort, event: Event) => any) | null =
      type === 'connect' ? this.onconnect : this.ondisconnect;
    handler?.call(this, event);
    this.dispatchEvent(event);
  }

  /**
   * Sets modem control signals, mirroring the `SerialPort.setSignals` steps:
   * an `InvalidStateError` DOMException when the port is not open, a
   * `TypeError` when no signal is specified.
   *
   * The driver asserts or deasserts every flag on each call, so each call
   * sends the complete tracked state — untouched signals keep the value they
   * had at open time (`dtr` and `rts` asserted, `break` deasserted). Successive
   * calls therefore apply the specification's DTR → RTS → break ordering
   * across calls.
   */
  async setSignals(signals?: SerialOutputSignals): Promise<void> {
    if (this.#state !== 'opened') {
      throw specError('InvalidStateError', 'The serial port is not open.');
    }
    const touched: SerialOutputSignals = signals ?? {};
    if (
      touched.dataTerminalReady === undefined &&
      touched.requestToSend === undefined &&
      touched.break === undefined
    ) {
      throw new TypeError('"signals" must specify at least one signal.');
    }
    if (touched.dataTerminalReady !== undefined) {
      this.#signals.dtr = touched.dataTerminalReady;
    }
    if (touched.requestToSend !== undefined) {
      this.#signals.rts = touched.requestToSend;
    }
    if (touched.break !== undefined) {
      this.#signals.brk = touched.break;
    }
    const port: BindingPortInterface = this.#port!;
    try {
      await port.set({ brk: this.#signals.brk, dtr: this.#signals.dtr, rts: this.#signals.rts });
    } catch (error) {
      if (this.#isCanceled(error)) {
        return;
      }
      if (this.#isDisconnect(error)) {
        this.#disconnect(error instanceof Error ? error.message : String(error));
        return;
      }
      throw specError(
        'UnknownError',
        `Failed to set the signals of the serial port: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reads the modem status signals of the port, mirroring the
   * `SerialPort.getSignals` steps. `ringIndicator` is always `false`: the
   * driver cannot report that line.
   */
  async getSignals(): Promise<SerialInputSignals> {
    if (this.#state !== 'opened') {
      throw specError('InvalidStateError', 'The serial port is not open.');
    }
    const port: BindingPortInterface = this.#port!;
    let status: { cts: boolean; dsr: boolean; dcd: boolean };
    try {
      status = await port.get();
    } catch (error) {
      if (this.#isDisconnect(error)) {
        this.#disconnect(error instanceof Error ? error.message : String(error));
      }
      throw specError(
        'NetworkError',
        `Failed to read the signals of the serial port: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      dataCarrierDetect: status.dcd,
      clearToSend: status.cts,
      ringIndicator: false,
      dataSetReady: status.dsr,
    };
  }

  /**
   * Closes the port, mirroring the `SerialPort.close` steps: an
   * `InvalidStateError` DOMException when the port is not open; otherwise the
   * readable stream is cancelled and the writable stream aborted — which
   * rejects with the streams' `TypeError` while a reader or writer holds a
   * lock, leaving the port open — and once both streams are released the
   * driver port is closed and the state returns to `closed`, making the
   * instance openable again.
   */
  async close(): Promise<void> {
    if (this.#state !== 'opened') {
      throw specError('InvalidStateError', 'The serial port is not open.');
    }
    let cancelPromise: Promise<void> | undefined;
    let abortPromise: Promise<void> | undefined;
    try {
      cancelPromise = this.#readable?.cancel();
      abortPromise = this.#writable?.abort();
    } catch (error) {
      // cancel()/abort() throw synchronously while a reader or writer holds the lock: the port stays open.
      throw error;
    }
    const port: BindingPortInterface = this.#port!;
    this.#state = 'closing';
    try {
      await Promise.all([cancelPromise, abortPromise]);
      await port.close();
    } catch (error) {
      // The spec's step order leaves the state at "closing" on rejection, which
      // wedges the port: a locked close (or a driver failure) never happened
      // operationally, so the port stays open and usable.
      this.#state = 'opened';
      throw error;
    }
    this.#state = 'closed';
    this.#readFatal = false;
    this.#writeFatal = false;
    this.#readable = null;
    this.#writable = null;
    this.#port = undefined;
  }
}
