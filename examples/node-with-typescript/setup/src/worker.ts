import { ReadWriteChannel } from "worker-com";
import { MessageType } from "./message-types.js";

const rwChannel = new ReadWriteChannel<MessageType, MessageType>();

(async () => {
  // Recieve on the "string" channel.
  for await (const item of rwChannel.readAll.string()) {
    // Write back to the "string" channel in uppercase.
    rwChannel.write.string(item.toUpperCase());
  }
})();
// console.log("FOO");
