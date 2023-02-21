#  worker-com

A Worker Communication library

# What

A zero-dependency cross-worker communication library. It works with any kind of W3 based WebWorker.
It also allows setting up and orchestrating the communication between any amount of workers
the orchestration is generally handled by the UI thread but any worker can orchestrate.
You decide what communication takes place between your seperate workers using typescript types.

# Why

This library provides an easy to use, modern, and type-safe way of cross-worker communication. 

# How

The major primitives are a read, write, and read/write channel.

## Getting Started

First install the package.

```bash
npm i worker-com
```

### An Example

First we start with a type file this will be used from both the worker and the client:


**message-types.ts**

```ts
export type MessageType = {
  // This will determine the name of our channel.
  type: "string",
  // This will determine its data.
  data: string
}
```

<table>
<thead><tr><th><strong>main.ts</strong></th><th><strong>worker.ts</strong></th></tr></thead>
<tbody><tr><td>

```ts
import { 
  WriteChannel 
} from "worker-com";
import { 
  MessageType 
} from "./message-types";

// Setup our webworker.
// Depending on your environment 
// this could look a little different
const worker = new Worker(
  new URL(
    "./worker.ts", 
    import.meta.url
  ), {
  type: "module",
});

// Create a write channel to the worker.
const wChannel = new WriteChannel<
  MessageType
>({
  writeTo: worker,
});

// Write to the worker.
(async () => {
  const { write, close } = wChannel;
  for await (const item of [
    "foo", "bar", "baz", "qux"
    ]) {
    // Writing to the "string" channel
    // The .string channel/property 
    // is from our MessageType's type.
    write.string(item);
  }
  // Always good practice to close
  // the writer.
  // In node this is especially 
  // important because it can
  // hang the process without it.
  close.writer.string();
})();
```

</td><td>

```ts
import { 
  ReadChannel 
} from "worker-com";
import { 
  MessageType 
} from "./message-types";

const rwChannel = new ReadChannel<
  MessageType,
  MessageType
>();

(async () => {
  // Recieve on the "string" channel.
  for await (const item of rwChannel.readAll.string()) {
    // Write back to the "string" channel in uppercase.
    console.log(item.toUpperCase());
  }
})();

```

</td></tr></tbody>
</tbody>
</table>



### Reading and Writing from the same worker.

A slightly more involved example is just reading to and writing from a worker over a channel.
On the UI side of the application this involves setting up a webworker on the client and setting up our channel as readable and writable.

Lets use the same types as last time:

**message-types.ts**

```ts
export type MessageType = {
  // This will determine the name of our channel.
  type: "string",
  // This will determine its data.
  data: string
}
```

<table>
<thead><tr><th><strong>main.ts</strong></th><th><strong>worker.ts</strong></th></tr></thead>
<tbody><tr><td>

```ts
import { 
  ReadWriteChannel 
} from "worker-com";
import { 
  MessageType 
} from "./message-types";

const worker = new Worker(
  new URL(
    "./worker.ts",
    import.meta.url
  ), {
  type: "module",
});

// Create a read and write channel 
// to and from the worker.
const rwChannel = new ReadWriteChannel<
  MessageType, 
  MessageType
>({
  writeTo: worker,
  // NEW: Notice we want to read as well this time.
  readFrom: worker,
});

// Write to the worker like last time.
(async () => {
  const { write, close } = rwChannel;
  for await (const item of [
    "foo", "bar", "baz", "qux"
  ]) {
    write.string(item);
  }
  close.writer.string();
})();
// NEW: Listen back from the worker.
(async () => {
  const { readAll } = rwChannel;
  // Reads everything from the "string" channel.
  for await (const item of readAll.string()) {
    console.log(item); // logs: "FOO", "BAR", "BAZ", then "QUX"
  }
  worker.terminate();
})();
```

</td><td>

```ts
import { 
  ReadWriteChannel 
} from "worker-com";
import { 
  MessageType 
} from "./message-types";

const rwChannel = new ReadWriteChannel<
  MessageType, 
  MessageType
>();

(async () => {
  // Recieve on the "string" channel.
  for await (const item of rwChannel.readAll.string()) {
    // Notice no log this time instead we 
    // write back to the "string" channel with
    // the item in uppercase.
    rwChannel.write.string(item.toUpperCase());
  }
})();

```

</td></tr></tbody>
</tbody>