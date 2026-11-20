import type { NodeSerialPort } from '../../node-serial-port/node-serial-port.ts';

/**
 * Package-internal channels between the hub and the port objects it created.
 * WeakMaps keep both off the public surface — no method or property marks the
 * port — and each entry vanishes with its port. Only `NodeSerial` and
 * `NodeSerialPort` use them.
 */

/**
 * Hub → port: receives the presence of the port object the hub created,
 * `true` when present and `false` when gone.
 */
export type PortPresenceListener = (present: boolean) => void;

/**
 * Port → hub: receives the port's watching need, `true` while it is open and
 * `false` when a full `close()` completes.
 */
export type PortWatchRequestListener = (needs: boolean) => void;

/** Delivers presence updates to the port object it created. */
export const presenceChannels = new WeakMap<NodeSerialPort, PortPresenceListener>();

/** Carries the port's watching requests to the hub. */
export const watchRequests = new WeakMap<NodeSerialPort, PortWatchRequestListener>();
