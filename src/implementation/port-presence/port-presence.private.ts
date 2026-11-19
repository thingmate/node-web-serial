/**
 * Package-internal channel through which the hub delivers presence updates to
 * the port objects it created: a symbol keeps this off the public surface,
 * and only `NodeSerial`, which owns the watcher, can call it.
 */
export const notifyPresence: unique symbol = Symbol('node-web-serial.notifyPresence');
