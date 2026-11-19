[![npm (scoped)](https://img.shields.io/npm/v/@thingmate/node-web-serial.svg)](https://www.npmjs.com/package/@thingmate/node-web-serial)
![npm](https://img.shields.io/npm/dm/@thingmate/node-web-serial.svg)
![NPM](https://img.shields.io/npm/l/@thingmate/node-web-serial.svg)
![npm type definitions](https://img.shields.io/npm/types/@thingmate/node-web-serial.svg)
![AI generation](https://img.shields.io/badge/AI_generation-high-yellow)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/thingmate/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/thingmate/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/thingmate/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

## @thingmate/node-web-serial

[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) for Node.js — a spec-faithful `Serial` and `SerialPort` speaking to real hardware through the [`serialport`](https://serialport.io/) bindings.

Browser code written against the Web Serial API runs against this package unchanged: same classes, same options, same errors (`DOMException` with the specification's names), same stream-based `readable`/`writable`.

## 📦 Installation

```shell
yarn add @thingmate/node-web-serial
# or
npm install @thingmate/node-web-serial --save
```

## 🚀 Usage

```typescript
import { NodeSerial } from '@thingmate/node-web-serial';

const serial: NodeSerial = new NodeSerial();

// Spec entry points: list every port, or select one by filters.
const ports = await serial.getPorts();
const port = await serial.requestPort({
  filters: [{ usbVendorId: 0x10c4 }],
});

await port.open({ baudRate: 9600 });

const reader = port.readable!.getReader();
const { value } = await reader.read();

const writer = port.writable!.getWriter();
await writer.write(new Uint8Array([1, 2, 3]));
writer.releaseLock();

await port.close();
```

## 🔌 Hotplug events

`connect` and `disconnect` fire at both levels the specification describes — on the hub and on each `SerialPort`:

```typescript
serial.addEventListener('connect', (event) => {
  console.log('a port appeared');
});
port.addEventListener('disconnect', () => {
  console.log('the port went away');
});
```

Node has no operating-system device watching, so the events are emulated by polling the port list. The specifics:

- **Watching is on demand.** Polling starts with the first hub-level `connect`/`disconnect` listener — or the first opened port — and stops as soon as the last need goes away. The underlying timer is `unref()`d and never keeps the process alive.
- **Events are not retroactive.** While nobody watches, nothing is observed; a port that appears and disappears in between produces no event.
- **Hub-level events target the hub.** Node's `EventTarget` has no parent chain, so the specification's `event.target` = port only holds at the port level; identify what changed at hub level with `getPorts()`.
- **`onconnect`/`ondisconnect` throw.** Reading or assigning either handler property throws a `TypeError`: listen with `addEventListener` instead.
- **Replug recovery.** A port that was open when it disappeared re-opens automatically on reappearance — the driver handle is renewed with the connection options it was opened with.

## 📜 Documentation

The public API is documented in TypeScript — `NodeSerial` mirrors the specification's `Serial` interface and `NodeSerialPort` its `SerialPort`, both fully JSDoc'd. Node extensions (`NodeSerialPort` is constructible with an operating-system path such as `/dev/ttyUSB0` or `COM3`) are called out in the docs where they deviate.
