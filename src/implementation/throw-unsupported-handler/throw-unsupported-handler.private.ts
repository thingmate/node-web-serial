/**
 * Fails a touch of an unsupported `on*` event-handler property: the events a
 * browser delivers through these attributes are not available in Node, so both
 * reading and assigning the property throw a `TypeError` instead of storing a
 * handler that would silently never run.
 */
export function throwUnsupportedHandler(property: string, reason: string): never {
  throw new TypeError(`"${property}" is not supported in Node: ${reason}`);
}
