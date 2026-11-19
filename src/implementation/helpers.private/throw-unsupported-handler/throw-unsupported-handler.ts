/**
 * Fails a touch of an unsupported `on*` event-handler property: the events a
 * browser delivers through these attributes are delivered to `addEventListener`
 * listeners in Node, so both reading and assigning the property throw a
 * `TypeError` instead of storing a handler that would silently never run.
 */
export function throwUnsupportedHandler(property: 'onconnect' | 'ondisconnect'): never {
  const event: string = property.slice(2);
  throw new TypeError(
    `"${property}" is not supported in Node: listen with addEventListener("${event}", …) instead.`,
  );
}
