import type { BindingInterface, PortInfo } from '@serialport/bindings-cpp';

/** Options for constructing a {@linkcode HotplugWatcher}. */
export interface HotplugWatcherOptions {
  /** The binding polled for the list of present ports. */
  readonly binding: BindingInterface;
  /** Milliseconds between two polls. */
  readonly interval: number;
  /** Called for each port present in a snapshot but absent from the previous one. */
  readonly onAdded: (info: PortInfo) => void;
  /** Called for each port path absent from a snapshot but present in the previous one. */
  readonly onRemoved: (path: string) => void;
}

/**
 * Watches a serial binding for ports appearing and disappearing by polling
 * `list()` on an interval — the Node stand-in for the operating system's
 * device watching behind the specification's `connect` and `disconnect`
 * events. The first snapshot is a silent baseline; every later snapshot is
 * diffed against the previous one. A `list()` that is still in flight skips
 * its ticks, and one that fails is retried on the next tick against the
 * previous snapshot. The underlying timer is `unref()`d: watching never
 * keeps the process alive. `stop()` ends the watching: the timer is cleared
 * and a snapshot still in flight is discarded. A new watching period is a
 * new instance, which re-baselines silently.
 */
export class HotplugWatcher {
  readonly #binding: BindingInterface;
  readonly #onAdded: (info: PortInfo) => void;
  readonly #onRemoved: (path: string) => void;
  readonly #timer: NodeJS.Timeout;
  #known = new Set<string>();
  #baseline = false;
  #inFlight = false;
  #stopped = false;

  constructor({ binding, interval, onAdded, onRemoved }: HotplugWatcherOptions) {
    this.#binding = binding;
    this.#onAdded = onAdded;
    this.#onRemoved = onRemoved;
    void this.#tick();
    this.#timer = setInterval((): void => {
      void this.#tick();
    }, interval).unref();
  }

  /** Ends the watching: clears the timer and discards the snapshot in flight, if any. */
  stop(): void {
    clearInterval(this.#timer);
    this.#stopped = true;
  }

  async #tick(): Promise<void> {
    if (this.#stopped || this.#inFlight) {
      return;
    }
    this.#inFlight = true;
    try {
      const infos: PortInfo[] = await this.#binding.list();
      if (this.#stopped) {
        return;
      }
      const seen: Set<string> = new Set(infos.map((info: PortInfo): string => info.path));
      if (this.#baseline) {
        for (const info of infos) {
          if (!this.#known.has(info.path)) {
            this.#onAdded(info);
          }
        }
        for (const path of this.#known) {
          if (!seen.has(path)) {
            this.#onRemoved(path);
          }
        }
      }
      this.#known = seen;
      this.#baseline = true;
    } catch {
      // Keep the previous snapshot; the next tick retries.
    } finally {
      this.#inFlight = false;
    }
  }
}
