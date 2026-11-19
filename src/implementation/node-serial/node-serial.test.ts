import { SerialPortMock } from 'serialport';
import { beforeEach, describe, expect, it } from 'vitest';
import { NodeSerial } from './node-serial.ts';

describe('NodeSerial', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('lists every port with parsed USB identifiers', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4', productId: 'ea60' });
    SerialPortMock.binding.createPort('/dev/b');
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const ports = await serial.getPorts();
    expect(ports.length).toBe(2);
    expect(ports[0]!.getInfo()).toEqual({ usbVendorId: 4292, usbProductId: 60000 });
    expect(ports[1]!.getInfo()).toEqual({});
  });

  it('returns the same instance for the same path across calls', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b');
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listed = await serial.getPorts();
    const relisted = await serial.getPorts();
    expect(relisted[0]).toBe(listed[0]);
    expect(relisted[1]).toBe(listed[1]);
    const requested = await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    expect(requested).toBe(listed[0]);
  });

  it('rejects a filter without usbVendorId with a TypeError', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    await expect(serial.requestPort({ filters: [{}] })).rejects.toThrow(TypeError);
    await expect(serial.requestPort({ filters: [{ usbProductId: 60000 }] })).rejects.toThrow(
      TypeError,
    );
  });

  it('does not match a port whose usbProductId differs from the filter', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4', productId: 'ea60' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    await expect(
      serial.requestPort({ filters: [{ usbVendorId: 0x10c4, usbProductId: 0x0001 }] }),
    ).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError',
    );
  });

  it('rejects a bluetoothServiceClassId-only filter with a TypeError, like the spec', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    await expect(
      serial.requestPort({
        filters: [{ bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' }],
      }),
    ).rejects.toThrow(TypeError);
  });

  it('rejects a filter mixing bluetoothServiceClassId with USB fields with a TypeError', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
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
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    await expect(serial.requestPort({ filters: [{ usbVendorId: 0xffff }] })).rejects.toSatisfy(
      (error: unknown): boolean => error instanceof DOMException && error.name === 'NotFoundError',
    );
  });

  it('resolves requestPort with the single matching port', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b', { vendorId: '03eb' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const port = await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    expect(port.path).toBe('/dev/a');
  });

  it('rejects requestPort when several ports match', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    await expect(serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] })).rejects.toThrow(
      /narrow/i,
    );
  });
});
