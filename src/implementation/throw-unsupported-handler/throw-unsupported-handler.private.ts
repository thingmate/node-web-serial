/**
 * Fails a touch of an unsupported `on*` event-handler property: the events a
 * browser delivers through these attributes are not available in Node, so both
 * reading and assigning the property throw a `TypeError` instead of storing a
 * handler that would silently never run.
 *
 * `reason` distinguishes the two situations a caller can be in: `never-fires`
 * for events Node cannot detect at all (no hotplug detection), and
 * `listen-instead` for an event that does fire and is delivered to
 * `addEventListener` listeners only.
 */
export function throwUnsupportedHandler(
  property: 'onconnect' | 'ondisconnect',
  reason: 'never-fires' | 'listen-instead',
): never {
  const event: string = property.slice(2);
  const message: string =
    reason === 'listen-instead'
      ? `"${property}" is not supported in Node: listen with addEventListener("${event}", …) instead.`
      : `"${property}" is not supported in Node: the "${event}" event never fires without hotplug detection.`;
  throw new TypeError(message);
}
