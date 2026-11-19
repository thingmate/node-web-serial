import { beforeEach, describe, expect, it } from 'vitest';
import { SerialPortMock } from 'serialport';
import { NodeSerialPort } from './node-serial-port.ts';

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

