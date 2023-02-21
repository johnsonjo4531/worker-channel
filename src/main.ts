/** @public @module main*/
import { consumeReader, writerIsClosed } from "./utils";

type ChannelWrite<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: (
    data: (DataMessages & { type: P })["data"],
    transfer?: Transferable[]
  ) => void;
};

type ChannelRelease<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: () => void;
};

type ChannelRead<DataMessages extends DataMessage> = {
  [P in DataMessages["type"]]: () => Promise<
    (DataMessages & { type: P })["data"]
  >;
};

type ChannelReadAll<DataMessages extends DataMessage> = {
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

type ChannelConnection = MessagePort | Worker | typeof globalThis;

/** Channel options */
export interface IChannelOptions {
  /** Controls aborting the Channel. Basically the same as calling end. */
  controller?: AbortController;
  /** Where to write the messages to.
   * Defaults to the UI/main thread.
   * @default WorkerGlobalScope
   */
  writeTo?: ChannelConnection;
  /** Where to read the messages from.
   * Defaults to the UI/main thread.
   * @default WorkerGlobalScope
   */
  readFrom?: ChannelConnection;
}

/** A message type should usually be denoted by a union from the consumer of this library. */
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
type InternalReadQueue<Read extends DataMessage> = Record<
  Read["type"],
  ReadableStreamDefaultReader<Read["data"]>
>;
type InternalWriteQueue<Write extends DataMessage> = Record<
  Write["type"],
  WritableStreamDefaultWriter<Write["data"]>
>;
type InternalReadWriteQueue<
  Read extends DataMessage,
  Write extends DataMessage
> = Record<
  Read["type"] | Write["type"],
  TransformStream<Read["data"], Write["data"]>
>;
export abstract class Channel<
  Read extends DataMessage,
  Write extends DataMessage
> {
  protected internalQueues!: {
    read?: InternalReadQueue<Read>;
    write?: InternalWriteQueue<Write>;
    transform?: InternalReadWriteQueue<Read, Write>;
  };

  /** Connect the readFrom or writeTo worker/port's to either recieve from or send to to a different message port.
   * @param target The worker/port to send the `connection` change to.
   * @param action Whether you want to change the "writable" end or the "readable" end of the `target`
   * @param connection The connection that should now be written to or read from.
   */
  connect(
    target: "readFrom" | "writeTo",
    action: "change-reader" | "change-writer",
    connection: MessagePort
  ) {
    this._sendInternal(target, `worker-channel:${action}`, connection, [
      connection,
    ]);
  }

  _sendInternal<T extends NecessaryMessages<Read, Write>["type"]>(
    target: "readFrom" | "writeTo",
    type: T,
    data: (NecessaryMessages<Read, Write> & { type: T })["data"],
    transfers?: Transferable[]
  ) {
    this[target]?.postMessage?.(
      {
        type,
        data,
      } as NecessaryMessages<Read, Write>,
      transfers ?? []
    );
  }

  constructor({
    controller = new AbortController(),
    writeTo = globalThis,
    readFrom = globalThis,
  }: IChannelOptions = {}) {
    this.controller = controller;
    // this.writeCommands = writeCommands;
    // this.readCommands = readCommands;
    this.writeTo = writeTo;
    this.readFrom = readFrom;
    this.listener = this.listener.bind(this);
    this.internalQueues = {};
    this.start();
  }
  protected readonly controller?: IChannelOptions["controller"];
  protected writeTo: IChannelOptions["writeTo"];
  protected readFrom: IChannelOptions["readFrom"];
  private transforms?: Map<
    keyof InternalReadWriteQueue<Read, Write>,
    InternalReadWriteQueue<Read, Write>[keyof InternalReadWriteQueue<
      Read,
      Write
    >]
  >;
  private readables?: Map<
    keyof InternalReadQueue<Read>,
    InternalReadQueue<Read>[keyof InternalReadQueue<Read>]
  >;
  private writables?: Map<
    keyof InternalWriteQueue<Write>,
    InternalWriteQueue<Write>[keyof InternalWriteQueue<Write>]
  >;

  protected readWriteSetup() {
    this.transforms = new Map();
    this.internalQueues.transform = new Proxy(
      {} as InternalReadWriteQueue<Read, Write>,
      {
        get: (_obj, command) => {
          if (this.transforms?.has(command) ?? false) {
            const stream = this.transforms?.get(command);
            if (stream) return stream;
          }
          const transformStream = new TransformStream();
          this.transforms?.set(command, transformStream);
          return transformStream;
        },
      }
    );
    this.readSetup();
    this.writeSetup();
  }

  protected readSetup() {
    this.readables = new Map();
    this.internalQueues.read = new Proxy({} as InternalReadQueue<Read>, {
      get: (_obj, command) => {
        if (this.readables?.has(command) ?? false) {
          const stream = this.readables?.get(command);
          if (stream) return stream;
        }
        const readableStream = (
          this.internalQueues?.transform?.[
            command as keyof InternalReadWriteQueue<Read, Write>
          ]?.readable ?? new ReadableStream()
        ).getReader();
        this.readables?.set(command, readableStream);
        return readableStream;
      },
    });
  }

  protected writeSetup() {
    this.writables = new Map();
    this.internalQueues.write = new Proxy({} as InternalWriteQueue<Write>, {
      get: (_obj, command) => {
        if (this.writables?.has(command) ?? false) {
          const stream = this.writables?.get(command);
          if (stream) return stream;
        }
        const stream = (
          this.internalQueues?.transform?.[
            command as keyof InternalReadWriteQueue<Read, Write>
          ]?.writable ?? new WritableStream()
        ).getWriter();
        this.writables?.set(command, stream);
        return stream;
      },
    });
  }

  /** Propagate close on all writers */
  close = {
    writer: new Proxy({} as ChannelRelease<Write>, {
      get: (_target, command) => {
        return () => {
          (async () => {
            const writer = this.writables?.get(command);
            this._sendInternal(
              "writeTo",
              "worker-channel:close-writer",
              command
            );
            if (this.writeTo instanceof MessagePort) this.writeTo.close();
            if (writer && (await writerIsClosed(writer))) return;
            this.writables?.get(command)?.close();
          })();
        };
      },
    }),
  };

  /** Propagate cancel on all readers */
  cancel = {
    reader: new Proxy({} as ChannelRelease<Read>, {
      get: (_target, command) => {
        return () => {
          this.readables?.get(command)?.releaseLock();
          this._sendInternal(
            "readFrom",
            "worker-channel:close-reader",
            command
          );
          if (this.readFrom instanceof MessagePort) this.readFrom.close();
        };
      },
    }),
  };

  protected _send<T extends Write["type"]>(
    type: T,
    data: (Write & { type: T })["data"],
    transfer?: Transferable[]
  ) {
    return this.writeTo?.postMessage({ type, data }, transfer ?? []);
  }

  protected async _read<T extends Read["type"]>(
    type: T
  ): Promise<Read["data"] | undefined> {
    return (await this.internalQueues.read?.[type]?.read())?.value;
  }

  protected async *_readAll<T extends Read["type"]>(
    type: T
  ): AsyncGenerator<(Read & { type: T })["data"]> {
    const result = this.internalQueues.read?.[type];
    if (!result) return;
    yield* consumeReader(result);
  }

  protected async listen() {
    this.readFrom?.addEventListener?.(
      "message",
      this.listener as unknown as EventListener
    );
  }

  protected async unlisten() {
    this.readFrom?.removeEventListener?.(
      "message",
      this.listener as unknown as EventListener
    );
  }

  protected async listener(ev: MessageEvent<NecessaryMessages<Read, Write>>) {
    if (ev.data.type === "worker-channel:change-reader") {
      // sending inner listening channel
      this.unlisten();
      this.readFrom = ev.data.data;
      ev.data.data.start();
      this.listen();
      return;
    } else if (ev.data.type === "worker-channel:change-writer") {
      // Sending inner posting channel.
      // this._send("acknowledge", true);
      this.writeTo = ev.data.data;
      return;
    } else if (ev.data.type === "worker-channel:close-writer") {
      this.close.writer[ev.data.data]();
    } else if (ev.data.type === "worker-channel:close-reader") {
      this.cancel.reader[ev.data.data]();
    } else {
      // send data accordingi to type.
      this.internalQueues.write?.[
        (ev.data as Write).type as Write["type"]
      ]?.write((ev.data as Write).data);
    }
  }

  /** Starts the channel. Called automatically from the constructor,
   * but if you ever `.end()` the channel this will start it again.
   */
  start() {
    this.controller?.signal.addEventListener(
      "abort",
      () => {
        return this.end();
      },
      {
        once: true,
      }
    );
  }

  /** Ends the communication of the channel.
   * You can always restart the channel with `.start()`.
   */
  end() {
    this.readFrom?.removeEventListener(
      "message",
      this.listener as unknown as EventListener
    );
    this.readables?.clear();
    this.writables?.clear();
    this.transforms?.clear();
  }
}

/** Allows writing to a worker.
 *
 *
 * @example
 * An example worker script:
 *
 * ```ts
 * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
 * type MyMessage = {type: "string", data: string};
 * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
 *
 * // writes to the string channel:
 * rwChannel.write.string("foo");
 * ```
 */
export class WriteChannel<Write extends DataMessage> extends Channel<
  DataMessage<void>,
  Write
> {
  start(): void {
    super.start();
    this.writeSetup();
  }
  /** Write to the channel.
   *
   * @example
   * An example worker script:
   * ```ts
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MyMessage = {type: "string", data: string};
   * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
   *
   * // writes to the string channel:
   * rwChannel.write.string("foo");
   * ```
   */
  readonly write: ChannelWrite<Write> = new Proxy({} as ChannelWrite<Write>, {
    get: (_target, command): ChannelWrite<Write>[keyof ChannelWrite<Write>] => {
      return (data, transfer) => this._send(command, data, transfer);
    },
  });
}

/** Creates a readable channel.
 *
 * @example
 * An example worker script:
 *
 * ```ts
 * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
 * type MessageType = {type: "string", data: string};
 * const rChannel = new ReadChannel<MessageType>();
 *
 * // Read a single item from "string" channel.
 * console.log(await rChannel.read.string());
 * // Read everything from the "string" channel.
 * for await (const item of rChannel.readAll.string()) {
 *   console.log(item);
 * }
 * ```
 * @public
 */
export class ReadChannel<Read extends DataMessage> extends Channel<
  Read,
  DataMessage<void>
> {
  start(): void {
    super.start();
    this.listen();
    this.readWriteSetup();
  }
  /** Read from a channel.
   *
   * @example
   * An example worker script:
   *
   * ```ts
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MessageType = {type: "string", data: string};
   * const rChannel = new ReadChannel<MessageType>();
   *
   * console.log(await rChannel.read.string())
   * ```
   */
  readonly read: ChannelRead<Read> = new Proxy({} as ChannelRead<Read>, {
    get: (_target, command) => {
      return () => this._read(command);
    },
  });

  /** Read everything from a channel.
   *
   * @example
   * An example worker script:
   *
   * ```ts
   *
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MessageType = {type: "string", data: string};
   * const rChannel = new ReadChannel<MessageType>();
   *
   * // Read everything from the "string" channel.
   * for await (const item of rChannel.readAll.string()) {
   *   console.log(item);
   * }
   * ```
   */
  readonly readAll: ChannelReadAll<Read> = new Proxy(
    {} as ChannelReadAll<Read>,
    {
      get: (_target, command: Read["type"]) => {
        return () => this._readAll(command);
      },
    }
  );
}

/** ReadWriteChannel is a readable and writable Channel.
 * @example
 *
 * An example worker script:
 *
 * ```ts
 * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
 * type MyMessage = {type: "string", data: string};
 * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
 *
 *  (async () => {
 *   // read each string from the 'string' channel (as declared by MyMessage).
 *   for await (const item of rwChannel.readAll.string()) {
 *     // write to the 'string' channel.
 *     rwChannel.write.string(worker);
 *   }
 * })();
 * ```
 */
export class ReadWriteChannel<
  Read extends DataMessage,
  Write extends DataMessage
> extends Channel<Read, Write> {
  start(): void {
    super.start();
    this.listen();
    this.readWriteSetup();
  }
  /** Write to the channel.
   *
   * @example
   * ```ts
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MyMessage = {type: "string", data: string};
   * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
   *
   * // writes to the string channel:
   * rwChannel.write.string("foo");
   * ```
   */
  readonly write: ChannelWrite<Write> = new Proxy({} as ChannelWrite<Write>, {
    get: (_target, command): ChannelWrite<Write>[keyof ChannelWrite<Write>] => {
      return (data, transfer) => this._send(command, data, transfer);
    },
  });

  /** Read from the channel
   *
   * @example
   * ```ts
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MyMessage = {type: "string", data: string};
   * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
   *
   * // Read data of type string from the "string" channel.
   * const str = await rwChannel.read.string();
   * ```
   */
  readonly read: ChannelRead<Read> = new Proxy({} as ChannelRead<Read>, {
    get: (_target, command) => {
      return () => this._read(command);
    },
  });

  /** Read from the channel
   *
   * @example
   * ```ts
   * // Setup the channel to be "string" (denoted by the type) with data of type string (denoted by data).
   * type MyMessage = {type: "string", data: string};
   * const rwChannel = new ReadWriteChannel<MyMessage, MyMessage>();
   *
   * for await (const item of rwChannel.readAll.string()) {
   *  console.log(item);
   * }
   * ```
   */
  readonly readAll: ChannelReadAll<Read> = new Proxy(
    {} as ChannelReadAll<Read>,
    {
      get: (_target, command) => {
        return () => this._readAll(command);
      },
    }
  );
}

export * from "./utils";
