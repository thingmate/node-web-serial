import type { BindingInterface, PortInfo } from '@serialport/bindings-cpp';
import { SerialPort as SerialPortDriver } from 'serialport';
import type { SerialPortFilter } from '../../types/serial-port-filter/serial-port-filter.ts';
import type { SerialPortRequestOptions } from '../../types/serial-port-request-options/serial-port-request-options.ts';
import type { Serial } from '../../types/serial/serial.ts';
import { HotplugWatcher } from '../hotplug-watcher/hotplug-watcher.ts';
import { NodeSerialPort } from '../node-serial-port/node-serial-port.ts';
import { presenceChannels } from '../port-presence/port-presence.private.ts';
import { specError } from '../spec-errors/spec-errors.private.ts';
import { throwUnsupportedHandler } from '../throw-unsupported-handler/throw-unsupported-handler.private.ts';

/**
 * The Web Serial API entry point for Node.js, mirroring the `Serial` interface
 * browsers expose as `navigator.serial`. Without a user permission prompt to
 * drive, {@linkcode NodeSerial.getPorts} lists every port the system exposes
 * and {@linkcode NodeSerial.requestPort} selects among them by filters.
 *
 * Ports are persistent: the same physical path always yields the same
 * `NodeSerialPort` instance, the way the specification's port set behaves.
 *
 * Because Node has no operating system device watching, the hub emulates the
 * specification's `connect` and `disconnect` events by polling `list()` on an
 * interval — `pollingInterval` milliseconds by default (`500`); a value of
 * `0` or less disables the polling. The timer is `unref()`d, so it never
 * keeps the process alive. Events are delivered to `addEventListener`
 * listeners; the `on*` handler properties are not supported.
 *
 * Node extension: the hub-level events target the hub itself (Node's
 * `EventTarget` has no parent chain to bubble through), so a listener
 * identifies what changed with {@linkcode NodeSerial.getPorts} — the
 * specification's own example reads `e.target` as the port, which the
 * port-level events on {@linkcode NodeSerialPort} deliver.
 */
export class NodeSerial extends EventTarget implements Serial {
  readonly #binding: BindingInterface;
  readonly #ports = new Map<string, NodeSerialPort>();

  /**
   * Not usable as a property: the events are delivered to `addEventListener`
   * listeners only. Reading or assigning throws a `TypeError`.
   */
  get onconnect(): ((this: Serial, event: Event) => any) | null {
    return throwUnsupportedHandler('onconnect');
  }

  set onconnect(_handler: ((this: Serial, event: Event) => any) | null) {
    throwUnsupportedHandler('onconnect');
  }

  /**
   * Not usable as a property: the events are delivered to `addEventListener`
   * listeners only. Reading or assigning throws a `TypeError`.
   */
  get ondisconnect(): ((this: Serial, event: Event) => any) | null {
    return throwUnsupportedHandler('ondisconnect');
  }

  set ondisconnect(_handler: ((this: Serial, event: Event) => any) | null) {
    throwUnsupportedHandler('ondisconnect');
  }

  constructor({
    binding,
    pollingInterval,
  }: { binding?: BindingInterface; pollingInterval?: number } = {}) {
    super();
    this.#binding = binding ?? SerialPortDriver.binding;
    const interval: number = pollingInterval ?? 500;
    if (interval > 0) {
      // The watcher holds itself alive through its unref()d timer; there is no
      // stop API — a hub watches for its whole lifetime (design ruling).
      new HotplugWatcher({
        binding: this.#binding,
        interval,
        onAdded: (info: PortInfo): void => {
          this.#portAppeared(info);
        },
        onRemoved: (path: string): void => {
          this.#portDisappeared(path);
        },
      });
    }
  }

  /**
   * Lists every serial port the system exposes, unfiltered — filtering is the
   * job of {@linkcode NodeSerial.requestPort}, as in the specification.
   */
  async getPorts(): Promise<NodeSerialPort[]> {
    const infos: PortInfo[] = await this.#binding.list();
    return infos.map((info: PortInfo): NodeSerialPort => this.#portFor(info));
  }

  /**
   * Selects a serial port, mirroring the `Serial.requestPort` steps without
   * the chooser: filters are validated (`TypeError` on a filter without
   * `usbVendorId` or mixing `bluetoothServiceClassId` with USB fields — the
   * specification leaves no room for a Bluetooth-only filter), a port matches
   * when every present filter member equals its identity, no match rejects
   * with a `NotFoundError` DOMException, and several matches reject with an
   * error asking to narrow the filters since Node has no chooser.
   *
   * `allowedBluetoothServiceClassIds` is accepted but inert: Node exposes no
   * Bluetooth serial services.
   */
  async requestPort(options?: SerialPortRequestOptions): Promise<NodeSerialPort> {
    const filters: SerialPortFilter[] = options?.filters ?? [];
    for (const filter of filters) {
      if (filter.bluetoothServiceClassId !== undefined) {
        throw new TypeError(
          'A filter cannot specify "bluetoothServiceClassId": Node exposes no Bluetooth serial services.',
        );
      }
      if (filter.usbVendorId === undefined) {
        throw new TypeError('Each filter must specify "usbVendorId".');
      }
    }
    const ports: NodeSerialPort[] = await this.getPorts();
    const matching: NodeSerialPort[] =
      filters.length === 0
        ? ports
        : ports.filter((port: NodeSerialPort): boolean =>
            filters.some((filter: SerialPortFilter): boolean => NodeSerial.#matches(port, filter)),
          );
    if (matching.length === 0) {
      throw specError('NotFoundError', 'No serial port matches the requested filters.');
    }
    if (matching.length > 1) {
      throw new Error(
        `${matching.length} serial ports match the requested filters: narrow the filters to select one.`,
      );
    }
    return matching[0]!;
  }

  /** Returns the persistent instance for the port identity, creating it on first sight. */
  #portFor(info: PortInfo): NodeSerialPort {
    const cached: NodeSerialPort | undefined = this.#ports.get(info.path);
    if (cached !== undefined) {
      return cached;
    }
    const port: NodeSerialPort = new NodeSerialPort({
      path: info.path,
      info: {
        usbVendorId: parseHex(info.vendorId),
        usbProductId: parseHex(info.productId),
      },
      binding: this.#binding,
    });
    this.#ports.set(info.path, port);
    // A port the hub can see is a connected port. The connect dispatch here
    // provably has no listeners: the object has not been returned to anyone.
    presenceChannels.get(port)?.(true);
    return port;
  }

  /** Hub-side appearance: connect the port, then fire the hub event. */
  #portAppeared(info: PortInfo): void {
    presenceChannels.get(this.#portFor(info))?.(true);
    this.dispatchEvent(new Event('connect', { bubbles: true }));
  }

  /** Hub-side disappearance: disconnect the port, then fire the hub event. */
  #portDisappeared(path: string): void {
    const port: NodeSerialPort | undefined = this.#ports.get(path);
    if (port !== undefined) {
      presenceChannels.get(port)?.(false);
    }
    this.dispatchEvent(new Event('disconnect', { bubbles: true }));
  }

  /** Filter matching per the specification: every present member must equal the port identity. */
  static #matches(port: NodeSerialPort, filter: SerialPortFilter): boolean {
    const info = port.getInfo();
    if (filter.usbVendorId !== undefined && info.usbVendorId !== filter.usbVendorId) {
      return false;
    }
    if (filter.usbProductId !== undefined && info.usbProductId !== filter.usbProductId) {
      return false;
    }
    return true;
  }
}

function parseHex(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed: number = Number.parseInt(value, 16);
  return Number.isNaN(parsed) ? undefined : parsed;
}
