import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SerialPortMock } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotplugWatcher } from '../helpers.private/hotplug-watcher/hotplug-watcher.ts';
import type { NodeSerialPort } from '../node-serial-port/node-serial-port.ts';
import { NodeSerial } from './node-serial.ts';

describe('NodeSerial', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
  });

  it('throws when the on* handler surfaces are touched', () => {
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
    });
    expect(() => serial.onconnect).toThrow(TypeError);
    expect(() => serial.onconnect).toThrow(/addEventListener\("connect", …\) instead/);
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
    });
    const port = await serial.requestPort({ filters: [{ usbVendorId: 0x10c4 }] });
    expect(port.path).toBe('/dev/a');
  });

  it('rejects requestPort when several ports match', async () => {
    SerialPortMock.binding.createPort('/dev/a', { vendorId: '10c4' });
    SerialPortMock.binding.createPort('/dev/b', { vendorId: '10c4' });
    const serial: NodeSerial = new NodeSerial({
      binding: SerialPortMock.binding,
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

  it('does not poll when HotplugWatcher.interval is 0', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    const defaultInterval: number = HotplugWatcher.interval;
    try {
      HotplugWatcher.interval = 0;
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
      expect(listSpy).not.toHaveBeenCalled();
    } finally {
      HotplugWatcher.interval = defaultInterval;
    }
  });

  it('reads the interval at each watching start', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    const defaultInterval: number = HotplugWatcher.interval;
    const listener = (): void => {};
    try {
      HotplugWatcher.interval = 0;
      serial.addEventListener('connect', listener);
      await vi.advanceTimersByTimeAsync(1000);
      expect(listSpy).not.toHaveBeenCalled();
      // The next watching start picks up the fresh value: a need recompute
      // (here, re-subscribing) is what creates the watcher.
      HotplugWatcher.interval = 500;
      serial.addEventListener('connect', listener);
      await vi.advanceTimersByTimeAsync(0);
      expect(listSpy.mock.calls.length).toBeGreaterThan(0);
    } finally {
      HotplugWatcher.interval = defaultInterval;
    }
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
    });
    // A closed port's port-level listener does not start the hub watching
    // (documented deviation) — the hub-level subscription does.
    serial.addEventListener('connect', (): void => {});
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
    });
    await vi.advanceTimersByTimeAsync(0);
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    await port.open({ baudRate: 9600 });
    await port.close();
    expect(port.connected).toBe(true);
  });
});

describe('NodeSerial.process', () => {
  it('never keeps the process alive while watching by default', () => {
    // A ref'd interval would keep the child process running past its work and
    // force the test's timeout kill: the watcher timer must be unref()d. The
    // timer only exists under need, so the probe subscribes first.
    const entry: string = pathToFileURL('src/implementation/node-serial/node-serial.ts').href;
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import('${entry}').then(({ NodeSerial }) => { const serial = new NodeSerial(); serial.addEventListener('connect', () => {}); });`,
      ],
      { timeout: 5000, cwd: process.cwd() },
    );
  });
});

describe('NodeSerial.lazyWatching', () => {
  beforeEach(() => {
    SerialPortMock.binding.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not poll until something needs watching', async () => {
    new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    await vi.advanceTimersByTimeAsync(2000);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('starts polling on the first hub-level listener', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    await vi.advanceTimersByTimeAsync(2000);
    expect(listSpy).not.toHaveBeenCalled();
    serial.addEventListener('connect', (): void => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(listSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('stops polling once the last hub-level listener is removed', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    const listener = (): void => {};
    // Added twice, removed once: EventTarget dedups, so the real count is 0.
    serial.addEventListener('connect', listener);
    serial.addEventListener('connect', listener);
    await vi.advanceTimersByTimeAsync(0);
    const duringCalls: number = listSpy.mock.calls.length;
    expect(duringCalls).toBeGreaterThan(0);
    serial.removeEventListener('connect', listener);
    await vi.advanceTimersByTimeAsync(2000);
    expect(listSpy.mock.calls.length).toBe(duringCalls);
  });

  it('stops polling when a signal aborts', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    const controller: AbortController = new AbortController();
    serial.addEventListener('connect', (): void => {}, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    const duringCalls: number = listSpy.mock.calls.length;
    expect(duringCalls).toBeGreaterThan(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2000);
    expect(listSpy.mock.calls.length).toBe(duringCalls);
  });

  it('an open port keeps watching without hub listeners; close releases it', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const listSpy = vi.spyOn(SerialPortMock.binding, 'list');
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    await port.open({ baudRate: 9600 });
    await vi.advanceTimersByTimeAsync(500);
    const duringCalls: number = listSpy.mock.calls.length;
    expect(duringCalls).toBeGreaterThan(0);
    await port.close();
    await vi.advanceTimersByTimeAsync(2000);
    expect(listSpy.mock.calls.length).toBe(duringCalls);
  });

  it('renews an open port on reappearance with zero hub listeners', async () => {
    SerialPortMock.binding.createPort('/dev/a');
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const port: NodeSerialPort = (await serial.getPorts())[0]!;
    await port.open({ baudRate: 9600 });
    let portConnects: number = 0;
    let portDisconnects: number = 0;
    port.addEventListener('connect', (): void => {
      portConnects += 1;
    });
    port.addEventListener('disconnect', (): void => {
      portDisconnects += 1;
    });
    SerialPortMock.binding.reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(portDisconnects).toBe(1);
    SerialPortMock.binding.createPort('/dev/a');
    await vi.advanceTimersByTimeAsync(500);
    expect(portConnects).toBe(1);
    expect(port.connected).toBe(true);
  });

  it('re-subscribing restarts watching with a fresh silent baseline', async () => {
    const serial: NodeSerial = new NodeSerial({ binding: SerialPortMock.binding });
    const hubEvents: string[] = [];
    const listener = (): void => {
      hubEvents.push('connect');
    };
    serial.addEventListener('connect', listener);
    await vi.advanceTimersByTimeAsync(0);
    serial.removeEventListener('connect', listener);
    SerialPortMock.binding.createPort('/dev/x');
    serial.addEventListener('connect', listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(hubEvents).toEqual([]);
    SerialPortMock.binding.createPort('/dev/y');
    await vi.advanceTimersByTimeAsync(500);
    expect(hubEvents).toEqual(['connect']);
  });
});
