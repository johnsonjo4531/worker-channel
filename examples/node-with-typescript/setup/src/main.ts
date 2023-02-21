import Worker from "web-worker";
import { ReadWriteChannel } from "worker-com";
import { MessageType } from "./message-types.js";

/** @ts-ignore-next-line */
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
} as any);

const rwChannel = new ReadWriteChannel<MessageType, MessageType>({
  // readFrom: channel.port2,
  writeTo: worker,
  readFrom: worker,
});

// Write to the worker.
(async () => {
  const { write, close } = rwChannel;
  for await (const item of ["foo", "bar", "baz", "qux"]) {
    // Writing to the "string" channel
    // The .string channel/property is from our MessageType's type.
    write.string(item);
  }
  // Propagates a close on the string channel.
  // Without this the worker would stay stuck reading forever.
  close.writer.string();
})();
// Listen back from the worker
(async () => {
  const { readAll } = rwChannel;
  // Reads everything from the "string" channel.
  for await (const item of readAll.string()) {
    // Should log the strings uppercased!
    console.log(item);
  }
  // terminate the worker
  worker.terminate();
})();
