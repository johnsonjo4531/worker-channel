import { ReadWriteChannel } from "worker-com";
import { MyMessage } from "./message-types";

const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();

(async () => {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // read from the 'uint8' channel.
  for await (const item of rwChannel.readAll.uint8()) {
    const decoded = decoder.decode(item);
    rwChannel.write.uint8(encoder.encode(`${decoded.toUpperCase()}!!!`), [
      item.buffer,
    ]);
  }
})();
