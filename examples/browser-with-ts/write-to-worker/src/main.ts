import { ReadWriteChannel } from "worker-com";
import { MessageType } from "./message-types";

// Setup our webworker.
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

// Create a read and write channel to and from the worker.
const rwChannel = new ReadWriteChannel<MessageType, MessageType>({
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
  // Always good practice to close the writer.
  // In node this is especially important because it can hang the process without it.
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
  worker.terminate();
})();
