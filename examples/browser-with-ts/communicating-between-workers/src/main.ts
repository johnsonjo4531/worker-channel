import { ReadChannel, WriteChannel } from "worker-channel";
import { MyMessage } from "./message-types.js";

/// Setup the workers we want to communicate with

// Once everything is setup then this first worker will uppercase whatever string we send in.
const worker1 = new Worker(new URL("./worker1.ts", import.meta.url), {
  type: "module",
});

// Once everything is setup then this second worker
// will add three exclamation points to whatever string we send in.
const worker2 = new Worker(new URL("./worker2.ts", import.meta.url), {
  type: "module",
});

/// Create a message channel to send so the workers can talk to each other.
/// we'll connect worker1's output to worker2's input.
const channel = new MessageChannel();

// Create a writable channel to worker 1
const wChannel = new WriteChannel<MyMessage>({
  writeTo: worker1,
});
// Connect worker1 (our writeTo) to write to port1.
// The "change-writer" sets our worker1's internal writeTo option.
wChannel.connect("writeTo", "change-writer", channel.port1);

// Create a readable channel from worker2.
const rChannel = new ReadChannel<MyMessage>({
  readFrom: worker2,
});

// Connect worker2 to read from port2
// The "change-reader" sets our worker2's internal readFrom option.
rChannel.connect("readFrom", "change-reader", channel.port2);

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
    console.log(item);
  }
  worker1.terminate();
  worker2.terminate();
})();
