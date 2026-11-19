/**
 * Builds the spec-typed errors of the Web Serial API. Dictionary validation
 * failures use the native `TypeError`; every other rejection is a
 * `DOMException` carrying the spec's error name.
 */
export function specError(
  name: 'InvalidStateError' | 'NotFoundError' | 'NetworkError' | 'UnknownError',
  message: string,
): DOMException {
  return new DOMException(message, name);
}
