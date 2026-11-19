import type {
  BindingInterface,
  BindingPortInterface,
  OpenOptions,
  PortInfo,
} from '@serialport/bindings-cpp';
import { SerialPortMock } from 'serialport';
import { beforeEach, describe, expect, it } from 'vitest';
import { notifyPresence } from '../port-presence/port-presence.private.ts';
import { NodeSerialPort } from './node-serial-port.ts';

/**
 * Test double binding whose read and write sides record every request and can
 * be switched between delivering canned data, failing, and blocking, which
 * `binding-mock` cannot express.
 */
class GRecordingBinding implements BindingInterface {
  readonly reads: Array<{ offset: number; length: number }> = [];
  readonly writes: Buffer[] = [];
  readonly sets: Array<{ brk?: boolean; dtr?: boolean; rts?: boolean }> = [];
  drained = false;
  flushed = false;
  #data: Buffer;
  #failingRead: boolean;
  #failingWrite: boolean;
  #blockWrite: boolean;
  #disconnectedRead: boolean;
  #disconnectedWrite: boolean;
  #failingDrain: boolean;
  #failingGet: boolean;
  #failingSet: boolean;
  #disconnectedSet: boolean;
  #status: { cts: boolean; dsr: boolean; dcd: boolean };

  constructor({
    data,
    failingRead,
    failingWrite,
    blockWrite,
    disconnectedRead,
    disconnectedWrite,
    failingDrain,
    failingGet,
    failingSet,
    disconnectedSet,
    status,
  }: {
    data?: Buffer;
    failingRead?: boolean;
    failingWrite?: boolean;
    blockWrite?: boolean;
    disconnectedRead?: boolean;
    disconnectedWrite?: boolean;
    failingDrain?: boolean;
    failingGet?: boolean;
    failingSet?: boolean;
    disconnectedSet?: boolean;
    status?: { cts: boolean; dsr: boolean; dcd: boolean };
  } = {}) {
    this.#data = data ?? Buffer.alloc(0);
    this.#failingRead = failingRead ?? false;
    this.#failingWrite = failingWrite ?? false;
    this.#blockWrite = blockWrite ?? false;
    this.#disconnectedRead = disconnectedRead ?? false;
    this.#disconnectedWrite = disconnectedWrite ?? false;
    this.#failingDrain = failingDrain ?? false;
    this.#failingGet = failingGet ?? false;
    this.#failingSet = failingSet ?? false;
    this.#disconnectedSet = disconnectedSet ?? false;
    this.#status = status ?? { cts: false, dsr: false, dcd: false };
  }

  setFailingRead(failing: boolean): void {
    this.#failingRead = failing;
  }

  setFailingWrite(failing: boolean): void {
    this.#failingWrite = failing;
  }

  setDisconnectedRead(disconnected: boolean): void {
    this.#disconnectedRead = disconnected;
  }

  setFailingDrain(failing: boolean): void {
    this.#failingDrain = failing;
  }

  list(): Promise<PortInfo[]> {
    return Promise.resolve([]);
  }

  async open(options: OpenOptions): Promise<BindingPortInterface> {
    return {
      openOptions: options as Required<OpenOptions>,
      isOpen: true,
      close: async () => {},
      read: async (buffer: Buffer, offset: number, length: number) => {
        this.reads.push({ offset, length });
        if (this.#disconnectedRead) {
          const error: Error = new Error('device detached');
          (error as { disconnected?: boolean }).disconnected = true;
          throw error;
        }
        if (this.#failingRead) {
          throw new Error('driver read failure');
        }
        const chunk: Buffer = this.#data.subarray(0, length);
        chunk.copy(buffer, offset);
        this.#data = this.#data.subarray(chunk.length);
        return { buffer, bytesRead: chunk.length };
      },
      write: async (buffer: Buffer) => {
        if (this.#blockWrite) {
          return new Promise<void>(() => {});
        }
        if (this.#disconnectedWrite) {
          const error: Error = new Error('device detached');
          (error as { disconnected?: boolean }).disconnected = true;
          throw error;
        }
        if (this.#failingWrite) {
          throw new Error('driver write failure');
        }
        this.writes.push(Buffer.from(buffer));
      },
      update: async () => {},
      set: async (options: { brk?: boolean; dtr?: boolean; rts?: boolean }) => {
        if (this.#disconnectedSet) {
          const error: Error = new Error('device detached');
          (error as { disconnected?: boolean }).disconnected = true;
          throw error;
        }
        if (this.#failingSet) {
          throw new Error('driver set failure');
        }
        this.sets.push({ ...options });
      },
      get: async () => {
        if (this.#failingGet) {
          throw new Error('driver status failure');
        }
        return { ...this.#status };
      },
      getBaudRate: async () => ({ baudRate: 9600 }),
      flush: async () => {
        this.flushed = true;
      },
      drain: async () => {
        if (this.#failingDrain) {
          throw new Error('driver drain failure');
        }
        this.drained = true;
      },
    };
  }
}

describe('NodeSerialPort', () => {
  it('reports the operating system path of the port', () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    expect(port.path).toBe('/dev/ttyUSB0');
  });

  it('reports the USB identifiers when provided', () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      info: { usbVendorId: 0x10c4 },
    });
    expect(port.getInfo()).toEqual({ usbVendorId: 0x10c4 });
  });

  it('reports no identifiers by default', () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    expect(port.getInfo()).toEqual({});
  });

  it('returns a fresh object from getInfo so callers cannot corrupt the port identity', () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      info: { usbVendorId: 0x10c4 },
    });
    (port.getInfo() as { usbVendorId: number }).usbVendorId = 0x123;
    expect(port.getInfo()).toEqual({ usbVendorId: 0x10c4 });
  });

  it('throws when the onconnect handler surface is touched', () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    expect(() => port.onconnect).toThrow(TypeError);
    expect(() => port.onconnect).toThrow(/never fires/);
    expect(() => {
      port.onconnect = null;
    }).toThrow(TypeError);
  });

  it('throws when the ondisconnect handler surface is touched', () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    expect(() => port.ondisconnect).toThrow(TypeError);
    expect(() => port.ondisconnect).toThrow(/addEventListener\("disconnect", …\) instead/);
    expect(() => {
      port.ondisconnect = null;
    }).toThrow(TypeError);
  });

  it('is not connected before being opened', () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    expect(port.connected).toBe(false);
  });

  it('resolves forget(), which has no permission store to revoke in Node', async () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0' });
    await expect(port.forget()).resolves.toBeUndefined();
  });
});

describe('NodeSerialPort.open', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('rejects open() with a TypeError when baudRate is 0', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      binding: SerialPortMock.binding,
    });
    await expect(port.open({ baudRate: 0 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when dataBits is not 7 or 8', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      binding: SerialPortMock.binding,
    });
    await expect(port.open({ baudRate: 9600, dataBits: 7.5 })).rejects.toThrow(TypeError);
    await expect(port.open({ baudRate: 9600, dataBits: 9 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when stopBits is not 1 or 2', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      binding: SerialPortMock.binding,
    });
    await expect(port.open({ baudRate: 9600, stopBits: 0 })).rejects.toThrow(TypeError);
    await expect(port.open({ baudRate: 9600, stopBits: 3 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when bufferSize is 0', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/ttyUSB0',
      binding: SerialPortMock.binding,
    });
    await expect(port.open({ baudRate: 9600, bufferSize: 0 })).rejects.toThrow(TypeError);
  });

  it('rejects a second open() with an InvalidStateError DOMException', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: SerialPortMock.binding,
    });
    await port.open({ baudRate: 9600 });
    const rejection: Promise<void> = port.open({ baudRate: 9600 });
    await expect(rejection).rejects.toSatisfy(
      (error: unknown): boolean =>
        error instanceof DOMException && error.name === 'InvalidStateError',
    );
  });

  it('rejects open() with an InvalidStateError while opening is in flight', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: SerialPortMock.binding,
    });
    const pending: Promise<void> = port.open({ baudRate: 9600 });
    await expect(port.open({ baudRate: 9600 })).rejects.toSatisfy(
      (error: unknown): boolean =>
        error instanceof DOMException && error.name === 'InvalidStateError',
    );
    await pending;
  });

  it('opens the port through the binding and reports connected', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: SerialPortMock.binding,
    });
    await port.open({ baudRate: 9600 });
    expect(port.connected).toBe(true);
  });

  it('leaves the port closed and disconnected when the binding fails to open', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.missing',
      binding: SerialPortMock.binding,
    });
    const failure: Promise<void> = port.open({ baudRate: 9600 });
    await expect(failure).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
    expect(port.connected).toBe(false);
    await expect(port.open({ baudRate: 9600 })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
  });
});

describe('NodeSerialPort.close', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('rejects close() before open with an InvalidStateError DOMException', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: new GRecordingBinding(),
    });
    await expect(port.close()).rejects.toSatisfy(
      (error: unknown): boolean =>
        error instanceof DOMException && error.name === 'InvalidStateError',
    );
  });

  it('closes an idle opened port', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    await expect(port.close()).resolves.toBeUndefined();
    expect(port.readable).toBeNull();
    expect(port.writable).toBeNull();
  });

  it('rejects close() while a reader holds the lock, leaving the port open', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await expect(port.close()).rejects.toThrow(TypeError);
    expect(port.readable).not.toBeNull();
    await expect(port.getSignals()).resolves.toEqual({
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });
    reader.releaseLock();
  });

  it('rejects close() while a writer holds the lock, leaving the port open', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    await expect(port.close()).rejects.toThrow(TypeError);
    expect(port.writable).not.toBeNull();
    await expect(port.getSignals()).resolves.toEqual({
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });
    writer.releaseLock();
  });

  it('resolves close() after the reader is released', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    reader.releaseLock();
    await expect(port.close()).resolves.toBeUndefined();
  });

  it('reopens the same instance after close with fresh streams', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    const firstReadable: ReadableStream<Uint8Array> | null = port.readable;
    await port.close();
    await port.open({ baudRate: 9600 });
    const secondReadable: ReadableStream<Uint8Array> | null = port.readable;
    expect(secondReadable).not.toBeNull();
    expect(secondReadable).not.toBe(firstReadable);
    const reader: ReadableStreamDefaultReader<Uint8Array> = secondReadable!.getReader();
    mock.emitData(Buffer.from('again'));
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
    expect(Array.from(result.value ?? [])).toEqual([97, 103, 97, 105, 110]);
  });
});

/** Captures the mock port opened through `serialport`'s mock binding so tests can feed it data. */
class GMockPortCapture implements BindingInterface {
  #opened: { emitData(data: Buffer | string): void; lastWrite: Buffer | null } | undefined;

  createPort(path: string, options?: { echo?: boolean; record?: boolean }): void {
    SerialPortMock.binding.createPort(path, options);
  }

  reset(): void {
    SerialPortMock.binding.reset();
  }

  list(): Promise<PortInfo[]> {
    return SerialPortMock.binding.list();
  }

  async open(options: OpenOptions): Promise<BindingPortInterface> {
    const opened = await SerialPortMock.binding.open(options);
    this.#opened = opened as { emitData(data: Buffer | string): void; lastWrite: Buffer | null };
    return opened;
  }

  emitData(data: Buffer | string): void {
    this.#opened?.emitData(data);
  }

  get lastWrite(): Buffer | null {
    return this.#opened?.lastWrite ?? null;
  }
}

describe('NodeSerialPort.readable', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('returns null before open and the same stream instance while open', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    expect(port.readable).toBeNull();
    await port.open({ baudRate: 9600 });
    const first: ReadableStream<Uint8Array> | null = port.readable;
    expect(first).not.toBeNull();
    expect(port.readable).toBe(first);
  });

  it('delivers emitted data as Uint8Array chunks to a default reader', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    mock.emitData(Buffer.from('hello'));
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
    expect(Array.from(result.value ?? [])).toEqual([104, 101, 108, 108, 111]);
  });

  it('supports a BYOB reader', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamBYOBReader = port.readable!.getReader({ mode: 'byob' });
    mock.emitData(Buffer.from('abcdef'));
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read(new Uint8Array(4));
    expect(result.value?.byteLength).toBe(4);
    expect(Array.from(result.value ?? [])).toEqual([97, 98, 99, 100]);
  });

  it('reads into a BYOB view at a non-zero byte offset without touching foreign slots', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ data: Buffer.from('ABCD') });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamBYOBReader = port.readable!.getReader({ mode: 'byob' });
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read(
      new Uint8Array(8).subarray(2, 6),
    );
    expect(Array.from(result.value ?? [])).toEqual([65, 66, 67, 68]);
    expect(result.value?.byteOffset).toBe(2);
    // The backing buffer is transferred for the read and handed back with the
    // fulfilled view: its slots prove the bytes landed inside the view only.
    expect(Array.from(new Uint8Array(result.value!.buffer))).toEqual([0, 0, 65, 66, 67, 68, 0, 0]);
  });

  it('performs no OS read until a consumer pulls', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ data: Buffer.from('abc') });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await new Promise<void>((resolve: () => void) => {
      setImmediate(resolve);
    });
    expect(binding.reads).toEqual([]);
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await reader.read();
    expect(binding.reads.length).toBe(1);
  });

  it('gives each default-read its own buffer', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    mock.emitData(Buffer.from('abcd'));
    const first: ReadableStreamReadResult<Uint8Array> = await reader.read();
    mock.emitData(Buffer.from('efgh'));
    const second: ReadableStreamReadResult<Uint8Array> = await reader.read();
    expect(first.value!.buffer).not.toBe(second.value!.buffer);
  });

  it('reads at most bufferSize bytes per chunk', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600, bufferSize: 255 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    mock.emitData(Buffer.alloc(300, 7));
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
    expect(result.value!.byteLength).toBe(255);
  });

  it('surfaces a driver read error as UnknownError and recreates a fresh readable afterwards', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({
      data: Buffer.from('ok'),
      failingRead: true,
    });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const first: ReadableStream<Uint8Array> | null = port.readable;
    const reader: ReadableStreamDefaultReader<Uint8Array> = first!.getReader();
    const failure: Promise<ReadableStreamReadResult<Uint8Array>> = reader.read();
    await expect(failure).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'UnknownError',
    );
    const second: ReadableStream<Uint8Array> | null = port.readable;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    binding.setFailingRead(false);
    const recovered: ReadableStreamDefaultReader<Uint8Array> = second!.getReader();
    const result: ReadableStreamReadResult<Uint8Array> = await recovered.read();
    expect(Array.from(result.value ?? [])).toEqual([111, 107]);
  });
});

describe('NodeSerialPort.writable', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('returns null before open and the same stream instance while open', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    expect(port.writable).toBeNull();
    await port.open({ baudRate: 9600 });
    const first: WritableStream<Uint8Array> | null = port.writable;
    expect(first).not.toBeNull();
    expect(port.writable).toBe(first);
  });

  it('applies byte-counting backpressure', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ blockWrite: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600, bufferSize: 255 });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    const chunk: Uint8Array = new Uint8Array(10);
    for (let index = 0; index < 26; index += 1) {
      writer.write(chunk);
    }
    expect(writer.desiredSize).toBeLessThan(0);
  });

  it('writes a copied buffer through the binding', async () => {
    const mock: GMockPortCapture = new GMockPortCapture();
    mock.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: mock });
    await port.open({ baudRate: 9600 });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    const chunk: Uint8Array = new Uint8Array([1, 2, 3]);
    await writer.write(chunk);
    chunk[0] = 9;
    expect(Array.from(mock.lastWrite ?? [])).toEqual([1, 2, 3]);
  });

  it('rejects a write with UnknownError when the driver fails, and recreates a fresh writable', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ failingWrite: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const first: WritableStream<Uint8Array> | null = port.writable;
    const writer: WritableStreamDefaultWriter<Uint8Array> = first!.getWriter();
    await expect(writer.write(new Uint8Array([1]))).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'UnknownError',
    );
    const second: WritableStream<Uint8Array> | null = port.writable;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    binding.setFailingWrite(false);
    const recovered: WritableStreamDefaultWriter<Uint8Array> = second!.getWriter();
    await expect(recovered.write(new Uint8Array([2]))).resolves.toBeUndefined();
  });

  it('resolves stream close() after draining', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    await writer.write(new Uint8Array([1]));
    await writer.close();
    expect(binding.drained).toBe(true);
  });

  it('releases the writable and rejects with an UnknownError DOMException when the driver fails to drain', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ failingDrain: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const first: WritableStream<Uint8Array> | null = port.writable;
    const writer: WritableStreamDefaultWriter<Uint8Array> = first!.getWriter();
    await expect(writer.close()).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'UnknownError',
    );
    const second: WritableStream<Uint8Array> | null = port.writable;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    binding.setFailingDrain(false);
    const recovered: WritableStreamDefaultWriter<Uint8Array> = second!.getWriter();
    await expect(recovered.write(new Uint8Array([1]))).resolves.toBeUndefined();
  });

  it('fires disconnect when the driver disconnects during a write', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedWrite: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    await expect(writer.write(new Uint8Array([1]))).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
    expect(listenerCalls).toBe(1);
    expect(port.connected).toBe(false);
    expect(port.writable).toBeNull();
    expect(port.readable).toBeNull();
  });

  it('aborts by discarding queued writes without touching the OS buffers', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ blockWrite: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable!.getWriter();
    const inFlight: Promise<void> = writer.write(new Uint8Array([1]));
    writer.write(new Uint8Array([2])).catch(() => {});
    writer.abort(new Error('aborted by the test'));
    await expect(inFlight).rejects.toThrow();
    await new Promise<void>((resolve: () => void) => {
      setImmediate(resolve);
    });
    expect(binding.flushed).toBe(false);
  });
});

describe('NodeSerialPort.disconnect', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('flips connected to false and fires disconnect exactly once when the driver disconnects', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedRead: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let firstListenerCalls: number = 0;
    let secondListenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      firstListenerCalls += 1;
    });
    port.addEventListener('disconnect', (): void => {
      secondListenerCalls += 1;
    });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await expect(reader.read()).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
    expect(firstListenerCalls).toBe(1);
    expect(secondListenerCalls).toBe(1);
    expect(port.connected).toBe(false);
  });

  it('nulls both readable and writable after a disconnect', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedRead: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await expect(reader.read()).rejects.toThrow();
    expect(port.readable).toBeNull();
    expect(port.writable).toBeNull();
  });

  it('delivers a bubbling disconnect event to listeners', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedRead: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let eventType: string | undefined;
    let eventBubbles: boolean | undefined;
    port.addEventListener('disconnect', (event: Event): void => {
      eventType = event.type;
      eventBubbles = event.bubbles;
    });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await expect(reader.read()).rejects.toThrow();
    expect(eventType).toBe('disconnect');
    expect(eventBubbles).toBe(true);
  });
});

describe('NodeSerialPort.signals', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('rejects setSignals before open with an InvalidStateError DOMException', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: new GRecordingBinding(),
    });
    await expect(port.setSignals({ dataTerminalReady: true })).rejects.toSatisfy(
      (error: unknown): boolean =>
        error instanceof DOMException && error.name === 'InvalidStateError',
    );
  });

  it('rejects getSignals before open with an InvalidStateError DOMException', async () => {
    const port: NodeSerialPort = new NodeSerialPort({
      path: '/dev/tty.mock',
      binding: new GRecordingBinding(),
    });
    await expect(port.getSignals()).rejects.toSatisfy(
      (error: unknown): boolean =>
        error instanceof DOMException && error.name === 'InvalidStateError',
    );
  });

  it('rejects an empty setSignals() with a TypeError', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await expect(port.setSignals({})).rejects.toThrow(TypeError);
    await expect(port.setSignals()).rejects.toThrow(TypeError);
    expect(binding.sets).toEqual([]);
  });

  it('sends the complete tracked signal state in one set() call, starting from the open-time default', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await port.setSignals({ requestToSend: true });
    expect(binding.sets).toEqual([{ dtr: true, rts: true, brk: false }]);
    await port.setSignals({ dataTerminalReady: false });
    expect(binding.sets).toEqual([
      { dtr: true, rts: true, brk: false },
      { dtr: false, rts: true, brk: false },
    ]);
  });

  it('rejects setSignals with a NetworkError DOMException when the driver fails', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ failingSet: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await expect(port.setSignals({ requestToSend: true })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
  });

  it('rejects setSignals and fires disconnect when the driver disconnects', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedSet: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    await expect(port.setSignals({ requestToSend: true })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
    expect(listenerCalls).toBe(1);
    expect(port.connected).toBe(false);
  });

  it('maps modem status to input signals with ringIndicator always false', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({
      status: { cts: true, dsr: false, dcd: true },
    });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await expect(port.getSignals()).resolves.toEqual({
      clearToSend: true,
      dataSetReady: false,
      dataCarrierDetect: true,
      ringIndicator: false,
    });
  });

  it('rejects getSignals with a NetworkError DOMException when the driver fails', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ failingGet: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await expect(port.getSignals()).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NetworkError',
    );
  });
});

describe('NodeSerialPort.presence', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('reports absence of a closed port as a disconnect', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await port.close();
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    port[notifyPresence](false);
    expect(port.connected).toBe(false);
    expect(listenerCalls).toBe(1);
  });

  it('runs the disconnect algorithm when the hub reports absence of an open port', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    port.readable!.getReader();
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    port[notifyPresence](false);
    expect(port.connected).toBe(false);
    expect(port.readable).toBeNull();
    expect(port.writable).toBeNull();
    expect(listenerCalls).toBe(1);
  });

  it('makes a replugged port usable again without closing it', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ data: Buffer.from('ok') });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let connectCalls: number = 0;
    port.addEventListener('connect', (): void => {
      connectCalls += 1;
    });
    port[notifyPresence](false);
    port[notifyPresence](true);
    expect(connectCalls).toBe(1);
    expect(port.connected).toBe(true);
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
    expect(Array.from(result.value ?? [])).toEqual([111, 107]);
  });

  it('fires disconnect exactly once when a driver disconnect is followed by reported absence', async () => {
    const binding: GRecordingBinding = new GRecordingBinding({ disconnectedRead: true });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable!.getReader();
    await expect(reader.read()).rejects.toThrow();
    port[notifyPresence](false);
    expect(listenerCalls).toBe(1);
  });

  it('ignores repeated absence reports', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await port.close();
    let listenerCalls: number = 0;
    port.addEventListener('disconnect', (): void => {
      listenerCalls += 1;
    });
    port[notifyPresence](false);
    port[notifyPresence](false);
    expect(listenerCalls).toBe(1);
  });

  it('ignores a connect report for an already connected port', async () => {
    const binding: GRecordingBinding = new GRecordingBinding();
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    let listenerCalls: number = 0;
    port.addEventListener('connect', (): void => {
      listenerCalls += 1;
    });
    port[notifyPresence](true);
    expect(listenerCalls).toBe(0);
  });
});
