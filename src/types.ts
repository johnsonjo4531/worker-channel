export type ChannelWrite<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: (
    data: (DataMessages & { type: P })["data"],
    transfer?: Transferable[]
  ) => void;
};

export type ChannelRelease<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: () => void;
};

export type ChannelRead<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: () => Promise<
    (DataMessages & { type: P })["data"]
  >;
};

export type ChannelReadAll<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: () => AsyncGenerator<
    (DataMessages & { type: P })["data"]
  >;
};

export type NecessaryMessages<
  Write extends DataMessage,
  Read extends DataMessage
> =
  | { type: "worker-channel:change-reader"; data: MessagePort }
  | { type: "worker-channel:change-writer"; data: MessagePort }
  | { type: "worker-channel:close-writer"; data: Write["type"] }
  | { type: "worker-channel:close-reader"; data: Read["type"] }
  | { type: "worker-channel:acknowledge"; data: boolean };

/** @public */
export type ChannelConnection = MessagePort | Worker | typeof globalThis;

/** Channel options */
export interface IChannelOptions {
  /** Controls aborting the Channel. Basically the same as calling end. */
  controller?: AbortController;
  /** Where to write the messages to.
   * Defaults to the UI/main thread.
   * @default globalThis
   */
  writeTo?: ChannelConnection;
  /** Where to read the messages from.
   * Defaults to the UI/main thread.
   * @default globalThis
   */
  readFrom?: ChannelConnection;
}

/** A message type should usually be denoted by a union from the consumer of this library.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataMessage<Data = any> =
  | {
      /** The channel to create, write and read from. */
      type: string | number | symbol;
      /** The data the channel writes or reads */
      data: Data;
    }
  | {
      /** The channel to create, write and read from. */
      type: string | number | symbol;
      /** The data the channel writes or reads */
      data?: Data;
    };
export type InternalReadQueue<Read extends DataMessage> = Record<
  Read["type"],
  ReadableStreamDefaultReader<Read["data"]>
>;
export type InternalWriteQueue<Write extends DataMessage> = Record<
  Write["type"],
  WritableStreamDefaultWriter<Write["data"]>
>;
export type InternalReadWriteQueue<
  Read extends DataMessage,
  Write extends DataMessage
> = Record<
  Read["type"] | Write["type"],
  TransformStream<Read["data"], Write["data"]>
>;
