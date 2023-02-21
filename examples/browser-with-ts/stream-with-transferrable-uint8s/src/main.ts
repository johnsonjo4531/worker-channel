import { ReadWriteChannel, consumeStream, sleep } from "worker-com";
import { MyMessage } from "./message-types";

const worker1 = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

const channel = new MessageChannel();

const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>({
  // readFrom: channel.port2,
  writeTo: worker1,
  readFrom: worker1,
});

// Kick of first communication
const rstream = new ReadableStream<Uint8Array>({
  async start(controller) {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode("foo"));
    controller.enqueue(encoder.encode("bar"));
    controller.enqueue(encoder.encode("baz"));
    controller.enqueue(encoder.encode("qux"));
    await sleep(100);
    controller.enqueue(encoder.encode("blarg"));
    controller.enqueue(encoder.encode("beeep"));
    controller.enqueue(encoder.encode("bop"));
    controller.enqueue(encoder.encode("to the don't stop"));
  },
});

(async () => {
  const { write, close } = rwChannel;
  for await (const item of consumeStream(rstream)) {
    // We can transfer items to the uint8 array channel through the use of the second parameter.
    write.uint8(item, [item.buffer]);
  }
  // Propagates a close on the string channel.
  // Without this the worker would stay stuck reading forever.
  close.writer.uint8();
})();

(async () => {
  const { readAll } = rwChannel;

  const decoder = new TextDecoder();
  // read on the uint8 array channel.
  for await (const item of readAll.uint8()) {
    console.log(decoder.decode(item), item);
  }
})();
