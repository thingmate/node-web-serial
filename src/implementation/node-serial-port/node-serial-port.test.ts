import { describe, expect, it } from 'vitest';
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
