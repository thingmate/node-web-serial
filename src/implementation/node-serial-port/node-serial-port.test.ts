import { beforeEach, describe, expect, it } from 'vitest';
import { SerialPortMock } from 'serialport';
import type {
  BindingInterface,
  BindingPortInterface,
  OpenOptions,
  PortInfo,
} from '@serialport/bindings-cpp';
import { NodeSerialPort } from './node-serial-port.ts';

/**
 * Test double binding whose read side records every request and can be
 * switched between delivering canned data and failing, which `binding-mock`
 * cannot express.
 */
class GRecordingReadBinding implements BindingInterface {
  readonly reads: Array<{ offset: number; length: number }> = [];
  #data: Buffer;
  #failing: boolean;

  constructor({ data, failing }: { data?: Buffer; failing?: boolean }) {
    this.#data = data ?? Buffer.alloc(0);
    this.#failing = failing ?? false;
  }

  setFailing(failing: boolean): void {
    this.#failing = failing;
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
        if (this.#failing) {
          throw new Error('driver read failure');
        }
        const chunk: Buffer = this.#data.subarray(0, length);
        chunk.copy(buffer, offset);
        this.#data = this.#data.subarray(chunk.length);
        return { buffer, bytesRead: chunk.length };
      },
      write: async () => {},
      update: async () => {},
      set: async () => {},
      get: async () => ({ cts: false, dsr: false, dcd: false }),
      getBaudRate: async () => ({ baudRate: 9600 }),
      flush: async () => {},
      drain: async () => {},
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
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0', binding: SerialPortMock.binding });
    await expect(port.open({ baudRate: 0 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when dataBits is not 7 or 8', async () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0', binding: SerialPortMock.binding });
    await expect(port.open({ baudRate: 9600, dataBits: 7.5 })).rejects.toThrow(TypeError);
    await expect(port.open({ baudRate: 9600, dataBits: 9 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when stopBits is not 1 or 2', async () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0', binding: SerialPortMock.binding });
    await expect(port.open({ baudRate: 9600, stopBits: 0 })).rejects.toThrow(TypeError);
    await expect(port.open({ baudRate: 9600, stopBits: 3 })).rejects.toThrow(TypeError);
  });

  it('rejects open() with a TypeError when bufferSize is 0', async () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/ttyUSB0', binding: SerialPortMock.binding });
    await expect(port.open({ baudRate: 9600, bufferSize: 0 })).rejects.toThrow(TypeError);
  });

  it('rejects a second open() with an InvalidStateError DOMException', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: SerialPortMock.binding });
    await port.open({ baudRate: 9600 });
    const rejection: Promise<void> = port.open({ baudRate: 9600 });
    await expect(rejection).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'InvalidStateError',
    );
  });

  it('rejects open() with an InvalidStateError while opening is in flight', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: SerialPortMock.binding });
    const pending: Promise<void> = port.open({ baudRate: 9600 });
    await expect(port.open({ baudRate: 9600 })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'InvalidStateError',
    );
    await pending;
  });

  it('opens the port through the binding and reports connected', async () => {
    SerialPortMock.binding.createPort('/dev/tty.mock');
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding: SerialPortMock.binding });
    await port.open({ baudRate: 9600 });
    expect(port.connected).toBe(true);
  });

  it('leaves the port closed and disconnected when the binding fails to open', async () => {
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.missing', binding: SerialPortMock.binding });
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

/** Captures the mock port opened through `serialport`'s mock binding so tests can feed it data. */
class GMockPortCapture implements BindingInterface {
  #opened: { emitData(data: Buffer | string): void } | undefined;

  createPort(path: string): void {
    SerialPortMock.binding.createPort(path);
  }

  reset(): void {
    SerialPortMock.binding.reset();
  }

  list(): Promise<PortInfo[]> {
    return SerialPortMock.binding.list();
  }

  async open(options: OpenOptions): Promise<BindingPortInterface> {
    const opened = await SerialPortMock.binding.open(options);
    this.#opened = opened as { emitData(data: Buffer | string): void };
    return opened;
  }

  emitData(data: Buffer | string): void {
    this.#opened?.emitData(data);
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

  it('performs no OS read until a consumer pulls', async () => {
    const binding: GRecordingReadBinding = new GRecordingReadBinding({ data: Buffer.from('abc') });
    const port: NodeSerialPort = new NodeSerialPort({ path: '/dev/tty.mock', binding });
    await port.open({ baudRate: 9600 });
    await new Promise<void>((resolve: () => void) => { setImmediate(resolve); });
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
    const binding: GRecordingReadBinding = new GRecordingReadBinding({ data: Buffer.from('ok'), failing: true });
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
    binding.setFailing(false);
    const recovered: ReadableStreamDefaultReader<Uint8Array> = second!.getReader();
    const result: ReadableStreamReadResult<Uint8Array> = await recovered.read();
    expect(Array.from(result.value ?? [])).toEqual([111, 107]);
  });
});
