const {
  ReadWriteChannel,
  ReadChannel,
  WriteChannel,
} = require("worker-channel");

test("should read and write to Channel", async () => {
  const channel = new MessageChannel();
  const wChannel = new WriteChannel({
    writeTo: channel.port1,
  });
  const rChannel = new ReadChannel({
    readFrom: channel.port2,
  });
  const item = "foo";

  wChannel.write.string("foo");
  wChannel.close.writer.string();

  const foo = await rChannel.read.string();

  expect(foo).toBe(item);
  rChannel.cancel.reader.string();
});

test("should write and readAll from Channel", async () => {
  const channel = new MessageChannel();
  const wChannel = new WriteChannel({
    writeTo: channel.port1,
  });
  const rChannel = new ReadChannel({
    readFrom: channel.port2,
  });
  const item = "foo";
  const result = [item, item];

  wChannel.write.string(item);
  wChannel.write.string(item);
  wChannel.close.writer.string();

  const actual = [];
  for await (const item of rChannel.readAll.string()) {
    actual.push(item);
  }

  expect(actual).toStrictEqual(result);
});

test("should write and readAll from Channel with intermediate channel", async () => {
  const channel1 = new MessageChannel();
  const channel2 = new MessageChannel();
  const wChannel = new WriteChannel({
    writeTo: channel1.port1,
  });
  const rwChannel = new ReadWriteChannel({
    readFrom: channel1.port2,
    writeTo: channel2.port1,
  });

  const rChannel = new ReadChannel({
    readFrom: channel2.port2,
  });
  const item = "foo";
  const result = [item, item];

  wChannel.write.string(item);
  wChannel.write.string(item);
  wChannel.close.writer.string();

  (async () => {
    for await (const item of rwChannel.readAll.string()) {
      rwChannel.write.string(item);
    }
  })();

  const actual = [];
  for await (const item of rChannel.readAll.string()) {
    actual.push(item);
  }

  expect(actual).toStrictEqual(result);
});
