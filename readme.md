A modern zero-dependency Worker communication and orchestration library

- [What](#what)
- [Why](#why)
- [How](#how)
  - [Getting Started](#getting-started)
    - [An Example](#an-example)
    - [Reading and Writing from the same worker.](#reading-and-writing-from-the-same-worker)
    - [Using MessageChannels to orchestrate on the main thread.](#using-messagechannels-to-orchestrate-on-the-main-thread)


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
npm i worker-channel
```

### An Example

> Want more examples with runnable code see [the examples directory](https://github.com/johnsonjo4531/worker-channel/tree/main/examples).

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
} from "worker-channel";
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
} from "worker-channel";
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

A slightly more involved example is to read to and write from a worker over a channel.
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
} from "worker-channel";
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
} from "worker-channel";
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
</table>

### Using MessageChannels to orchestrate on the main thread.

An even more sophisticated example is reading to and writing from a worker using the web's built in MessageChannel.
On the UI side of the application this involves using MessageChannels to orchestrate.
How your workers can talk to one another.

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
<thead><tr>
<th><strong>main.ts</strong></th>
<th><strong>worker1.ts</strong></th>
<th><strong>worker2.ts</strong></th>
</tr></thead>
<tbody><tr><td>

```ts
import { 
  ReadChannel,
  WriteChannel
} from "worker-channel";
import { MyMessage } from "./message-types.js";

/// Setup the workers we want to communicate with

// Once everything is setup then
// this first worker will uppercase
// whatever string we send in.
const worker1 = new Worker(
  new URL(
    "./worker1.ts",
    import.meta.url
  ), {
  type: "module",
});

// Once everything is setup then 
// this second worker will add 
// three exclamation points to 
// whatever string we send in.
const worker2 = new Worker(
  new URL(
    "./worker2.ts",
    import.meta.url
  ), {
  type: "module",
});

/// Create a message channel to send 
// so the workers can talk to each other.
/// We'll connect worker1's output to
// worker2's input.
const channel = new MessageChannel();

// Create a writable channel to worker 1
const wChannel = new WriteChannel<MyMessage>({
  writeTo: worker1,
});
// Connect worker1 (our wChannel's writeTo)
// to write to port1.
// The "change-writer" sets our worker1's internal writeTo option.
wChannel.connect(
  "writeTo",
  "change-writer",
  channel.port1
);

// Create a readable channel from worker2.
const rChannel = new ReadChannel<MyMessage>({
  readFrom: worker2,
});

// Connect worker2 to read from port2
// The "change-reader" sets our worker2's internal readFrom option.
rChannel.connect(
  "readFrom",
  "change-reader",
  channel.port2
);

// Now we use our wChannel to write strings to worker1.

(async () => {
  const { write, close } = wChannel;
  for await (const item of ["foo", "bar", "baz", "qux"]) {
    write.string(item);
  }
  // always good practice to tell it you're done.
  // If you're in node this is especially important, so you don't possibly hang the process.
  close.writer.string();
})();

// Finally we read from worker2.
(async () => {
  const { readAll } = rChannel;

  for await (const item of readAll.string()) {
    // LOGS: "FOO!!!", "BAR!!!", "BAZ!!!", "QUX!!!"
    console.log(item);
  }
  // It's good to close the worker when you know you're done.
  worker1.terminate();
  worker2.terminate();
})();
```

</td><td>

```ts
import { 
  ReadWriteChannel 
} from "worker-channel";
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

</td><td>

```ts
import { 
  ReadWriteChannel 
} from "worker-channel";
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
    // the item with three exclamation points.
    rwChannel.write.string(`${item}!!!`);
  }
})();
```



</td></tr></tbody>
</tbody>
</table>