import type { NodeSerialPort } from '../../node-serial-port/node-serial-port.ts';

/**
 * Package-internal channels between the hub and the port objects it created.
 * WeakMaps keep both off the public surface — no method or property marks the
 * port — and each entry vanishes with its port. Only `NodeSerial` and
 * `NodeSerialPort` use them.
 */

/** Hub → port: delivers presence updates to the port object it created. */
export const presenceChannels = new WeakMap<NodeSerialPort, (present: boolean) => void>();

/**
 * Port → hub: the port asks the hub to keep watching while it is open, and
 * releases the ask when a full `close()` completes.
 */
export const watchRequests = new WeakMap<NodeSerialPort, (needs: boolean) => void>();
