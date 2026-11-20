/**
 * Listener of the `connect` and `disconnect` events of a serial object,
 * mirroring the `EventHandler` callback backing the Web Serial API
 * `onconnect` and `ondisconnect` attributes and the typed `connect` and
 * `disconnect` `addEventListener` overloads.
 *
 * The `this` of the handler is the object the listener subscribes to: the
 * `Serial` hub, or the `SerialPort` the event fired on.
 *
 * @see https://serial.spec.whatwg.org/#dom-serial-onconnect
 */
export type SerialEventHandler<GTarget> = (this: GTarget, event: Event) => any;
