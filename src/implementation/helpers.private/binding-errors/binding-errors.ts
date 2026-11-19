/**
 * Error shapes the `serialport` bindings annotate failures with. A device
 * disconnect is flagged with `disconnect` — the property the bindings set on
 * `EBADF`/`ENXIO` failures — or the doubled `disconnected` shape; a canceled
 * operation, such as closing a port with reads still in flight, is flagged
 * with `canceled`. The flags stay writable so test doubles can build errors
 * carrying them.
 */
export interface DisconnectFlaggedError {
  disconnect?: boolean;
  disconnected?: boolean;
}

/** Error shape the bindings use to flag a canceled (non-disconnecting) operation. */
export interface CanceledFlaggedError {
  canceled?: boolean;
}
