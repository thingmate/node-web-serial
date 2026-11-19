import type { BindingInterface, BindingPortInterface, PortInfo } from '@serialport/bindings-cpp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotplugWatcher } from './hotplug-watcher.ts';

/**
 * Binding double answering `list()` from a queued snapshot, throwing, or
 * hanging until the test releases it. Once the queue drains it repeats its
 * last queued snapshot, the way a stable system keeps reporting the same
 * ports on every scan.
 */
class GListBinding implements BindingInterface {
  listCalls = 0;
  #queued: Array<PortInfo[] | Error> = [];
  #repeated: PortInfo[] = [];
  hangList = false;
  readonly #hanging: Array<{ resolve: (infos: PortInfo[]) => void }> = [];

  queue(answer: PortInfo[] | Error): void {
    this.#queued.push(answer);
    if (!(answer instanceof Error)) {
      this.#repeated = answer;
    }
  }

  release(infos: PortInfo[]): void {
    this.#hanging.shift()?.resolve(infos);
  }

  async list(): Promise<PortInfo[]> {
    this.listCalls += 1;
    const answer: PortInfo[] | Error | undefined = this.#queued.shift();
    if (answer instanceof Error) {
      throw answer;
    }
    if (this.hangList) {
      return new Promise((resolve) => {
        this.#hanging.push({ resolve });
      });
    }
    return answer ?? this.#repeated;
  }

  open(): Promise<BindingPortInterface> {
    return Promise.reject(new Error('not used by the watcher'));
  }
}

/** Builds a fully shaped `PortInfo` with only the identity fields set. */
function portInfo(path: string, vendorId?: string): PortInfo {
  return {
    path,
    manufacturer: undefined,
    serialNumber: undefined,
    pnpId: undefined,
    locationId: undefined,
    productId: undefined,
    vendorId,
  };
}

describe('HotplugWatcher', () => {
  let added: PortInfo[];
  let removed: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    added = [];
    removed = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats the first snapshot as a silent baseline', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([portInfo('/dev/a')]);
    new HotplugWatcher({
      binding,
      interval: 500,
      onAdded: (info: PortInfo): void => {
        added.push(info);
      },
      onRemoved: (path: string): void => {
        removed.push(path);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('reports added and removed paths against the previous snapshot', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([portInfo('/dev/a')]);
    new HotplugWatcher({
      binding,
      interval: 500,
      onAdded: (info: PortInfo): void => {
        added.push(info);
      },
      onRemoved: (path: string): void => {
        removed.push(path);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    binding.queue([portInfo('/dev/a'), portInfo('/dev/b', '10c4')]);
    await vi.advanceTimersByTimeAsync(500);
    expect(added.map((info: PortInfo): string => info.path)).toEqual(['/dev/b']);
    expect(added[0]!.vendorId).toBe('10c4');
    binding.queue([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(removed).toEqual(['/dev/a', '/dev/b']);
  });

  it('skips a tick while the previous list is still in flight', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([]);
    new HotplugWatcher({
      binding,
      interval: 500,
      onAdded: (info: PortInfo): void => {
        added.push(info);
      },
      onRemoved: (path: string): void => {
        removed.push(path);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    binding.hangList = true;
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    binding.hangList = false;
    binding.release([portInfo('/dev/b')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(added.map((info: PortInfo): string => info.path)).toEqual(['/dev/b']);
    binding.queue([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(removed).toEqual(['/dev/b']);
    // baseline + the one hung tick + the resumed one — the two skipped ticks never called list().
    expect(binding.listCalls).toBe(3);
  });

  it('keeps polling when list() rejects', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([portInfo('/dev/a')]);
    new HotplugWatcher({
      binding,
      interval: 500,
      onAdded: (info: PortInfo): void => {
        added.push(info);
      },
      onRemoved: (path: string): void => {
        removed.push(path);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    binding.queue(new Error('driver list failure'));
    await vi.advanceTimersByTimeAsync(500);
    binding.queue([portInfo('/dev/b')]);
    await vi.advanceTimersByTimeAsync(500);
    expect(added.map((info: PortInfo): string => info.path)).toEqual(['/dev/b']);
  });
});

describe('HotplugWatcher.stop', () => {
  let added: PortInfo[];
  let removed: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    added = [];
    removed = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function startWatcher(binding: GListBinding): HotplugWatcher {
    return new HotplugWatcher({
      binding,
      interval: 500,
      onAdded: (info: PortInfo): void => {
        added.push(info);
      },
      onRemoved: (path: string): void => {
        removed.push(path);
      },
    });
  }

  it('stops polling after stop()', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([portInfo('/dev/a')]);
    const watcher: HotplugWatcher = startWatcher(binding);
    await vi.advanceTimersByTimeAsync(0);
    watcher.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(binding.listCalls).toBe(1);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('discards an in-flight list when stopped', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([]);
    const watcher: HotplugWatcher = startWatcher(binding);
    await vi.advanceTimersByTimeAsync(0);
    binding.hangList = true;
    await vi.advanceTimersByTimeAsync(500);
    watcher.stop();
    binding.release([portInfo('/dev/b')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
    expect(binding.listCalls).toBe(2);
  });

  it('stop() is idempotent', async () => {
    const binding: GListBinding = new GListBinding();
    binding.queue([portInfo('/dev/a')]);
    const watcher: HotplugWatcher = startWatcher(binding);
    await vi.advanceTimersByTimeAsync(0);
    watcher.stop();
    watcher.stop();
    binding.queue([portInfo('/dev/a'), portInfo('/dev/b')]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(binding.listCalls).toBe(1);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });
});
