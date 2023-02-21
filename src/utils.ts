export async function* consumeStream<T>(
  readable: ReadableStream<T>
): AsyncGenerator<Awaited<T>> {
  const reader = readable.getReader();
  yield* consumeReader(reader);
}
export async function* consumeReader<T>(
  reader: ReadableStreamDefaultReader<T>
): AsyncGenerator<Awaited<T>> {
  let done, value;
  do {
    ({ done, value } = await reader.read());
    if (!done) yield value as T;
  } while (!done);
}

export class SleepAbortError extends Error {
  constructor(message = "Sleep Aborted.") {
    super(message);
  }
}

export const sleep = (ms: number, controller?: AbortController) =>
  new Promise((res, rej) => {
    const id = setTimeout(res, ms);
    controller?.signal.addEventListener("abort", () => {
      clearTimeout(id);
      rej(new SleepAbortError());
    }),
      {
        once: true,
      };
  });

export const Deferred = <Resolve, Reject>() => {
  let resolve!: (value: Resolve | PromiseLike<Resolve>) => void;
  let reject!: (reason?: Reject) => void;
  const promise = new Promise<Resolve>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { resolve, reject, promise };
};

export function isDefined<T>(x: T): x is NonNullable<T> {
  return Boolean(x);
}

export function writerIsClosed(writer: WritableStreamDefaultWriter) {
  return Promise.race([
    sleep(0).then(() => false),
    writer.closed.then(() => true),
  ]);
}
