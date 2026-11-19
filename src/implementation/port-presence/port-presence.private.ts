import type { NodeSerialPort } from '../node-serial-port/node-serial-port.ts';

/**
 * Package-internal channel through which the hub delivers presence updates to
 * the port objects it created. A WeakMap keeps this off the public surface —
 * no method or property marks the port — and each entry vanishes with its
 * port. Only `NodeSerial`, which owns the watcher, reads it.
 */
export const presenceChannels = new WeakMap<NodeSerialPort, (present: boolean) => void>();
