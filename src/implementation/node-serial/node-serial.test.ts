import { SerialPortMock } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeSerialPort } from '../node-serial-port/node-serial-port.ts';
import { NodeSerial } from './node-serial.ts';

describe('NodeSerial', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('throws when the on* handler surfaces are touched', () => {
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    expect(() => serial.onconnect).toThrow(TypeError);
    expect(() => {
      serial.onconnect = null;
    }).toThrow(TypeError);
    expect(() => serial.ondisconnect).toThrow(TypeError);
    expect(() => {
      serial.ondisconnect = null;
    }).toThrow(TypeError);
  });

  it('lists every port with parsed USB identifiers', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4', productId: 'ea60' });
    SerialPortMock.binding.createPort('/dev/b');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    const ports = await serial.getPorts();
    expect(ports.length).toBe(2);
    expect(ports[0]!.getInfo()).toEqual({ usbVendorId: 4292, usbProductId: 60000 });
    expect(ports[1]!.getInfo()).toEqual({});
  });

  it('returns the same instance for the same path across calls', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    const listed = await serial.getPorts();
    const relisted = await serial.getPorts();
    expect(relisted[0]).toBe(listed[0]);
    expect(relisted[1]).toBe(listed[1]);
    const requested = await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    expect(requested).toBe(listed[0]);
  });

  it('rejects a filter without usbVendorId with a TypeError', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(serial.requestPort({ filters: [{}] })).rejects.toThrow(TypeError);
    await expect(serial.requestPort({ filters: [{ usbProductId: 60000 }] })).rejects.toThrow(
      TypeError,
    );
  });

  it('does not match a port whose usbProductId differs from the filter', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4', productId: 'ea60' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(
      serial.requestPort({ filters: [{ usbVendorId: 0x10c4, usbProductId: 0x0001 }] }),
    ).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError',
    );
  });

  it('rejects a bluetoothServiceClassId-only filter with a TypeError, like the spec', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(
      serial.requestPort({
        filters: [{ bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' }],
      }),
    ).rejects.toThrow(TypeError);
  });

  it('rejects a filter mixing bluetoothServiceClassId with USB fields with a TypeError', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(
      serial.requestPort({
        filters: [
          { usbVendorId: 0x10c4, bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' },
        ],
      }),
    ).rejects.toThrow(TypeError);
  });

  it('rejects requestPort with a NotFoundError DOMException when nothing matches', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(serial.requestPort({ filters: [{ usbVendorId: 0xffff }] })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError',
    );
  });

  it('resolves requestPort with the single matching port', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b', { vendorId: '03eb' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    const port = await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    expect(port.path).toBe('/dev/a');
  });

  it('rejects requestPort when several ports match', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    await expect(serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] })).rejects.toThrow(
      /narrow/i,
    );
  });
});

describe('NodeSerial.hotplug', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not poll when pollingInterval is 0', async () => {
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 0,
    });
    const hubEvents: string[] = [];
    serial.addEventListener('connect', (): void => {
      hubEvents.push('connect');
    });
    serial.addEventListener('disconnect', (): void => {
      hubEvents.push('disconnect');
    });
    SerialPortMock.binding.createPort('/dev/a');
    await vi.advanceTimersByTimeAsync(2000);
    expect(hubEvents).toEqual([]);
  });

  it('enables polling by default', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const hubEvents: string[] = [];
    serial.addEventListener('connect', (): void => {
      hubEvents.push('connect');
    });
    await vi.advanceTimersByTimeAsync(0);
    SerialPortMock.binding.createPort('/dev/a');
    await vi.advanceTimersByTimeAsync(500);
    expect(hubEvents).toEqual(['connect']);
  });

  it('fires hub connect when a port appears and creates its port object', async () => {
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 500,
    });
    let hubConnects: number = 0;
    let eventBubbles: boolean | undefined;
    serial.addEventListener('connect', (event: Event): void => {
      hubConnects += 1;
      eventBubbles = event.bubbles;
    });
    await vi.advanceTimersByTimeAsync(0);
    SerialPortMock.binding.createPort('/dev/new', { vendorId: '10c4' });
    await vi.advanceTimersByTimeAsync(500);
    expect(hubConnects).toBe(1);
    expect(eventBubbles).toBe(true);
    const ports: NodeSerialPort[] = await serial.getPorts();
    expect(ports.length).toBe(1);
    expect(ports[0]!.path).toBe('/dev/new');
    expect(ports[0]!.getInfo().usbVendorId).toBe(4292);
    expect(ports[0]!.connected).toBe(true);
  });

  it('fires hub disconnect when a port disappears and marks the port absent', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    let hubDisconnects: number = 0;
    let portDisconnects: number = 0;
    serial.addEventListener('disconnect', (): void => {
      hubDisconnects += 1;
    });
    port.addEventListener('disconnect', (): void => {
      portDisconnects += 1;
    });
    SerialPortMock.binding.reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(hubDisconnects).toBe(1);
    expect(portDisconnects).toBe(1);
    expect(port.connected).toBe(false);
  });

  it('runs the disconnect algorithm on an open port reported absent by the hub', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    await port.open({ baudRate: 9600 });
    port.readable!.getReader();
    let portDisconnects: number = 0;
    port.addEventListener('disconnect', (): void => {
      portDisconnects += 1;
    });
    SerialPortMock.binding.reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(portDisconnects).toBe(1);
    expect(port.readable).toBeNull();
    expect(port.connected).toBe(false);
  });

  it('reappearance reuses the cached port and reconnects it', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    let portConnects: number = 0;
    port.addEventListener('connect', (): void => {
      portConnects += 1;
    });
    SerialPortMock.binding.reset();
    await vi.advanceTimersByTimeAsync(500);
    SerialPortMock.binding.createPort('/dev/a');
    await vi.advanceTimersByTimeAsync(500);
    const relisted: NodeSerialPort[] = await serial.getPorts();
    expect(relisted[0]).toBe(port);
    expect(portConnects).toBe(1);
    expect(port.connected).toBe(true);
  });

  it('keeps connected true after close while the device stays present', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
      pollingInterval: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    await port.open({ baudRate: 9600 });
    await port.close();
    expect(port.connected).toBe(true);
  });
});
