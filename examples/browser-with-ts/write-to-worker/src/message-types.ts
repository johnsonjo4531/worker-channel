// This is in it's own file so we can share it between the worker and the main thread.
export type MessageType = {
  type: "string";
  data: string;
};
