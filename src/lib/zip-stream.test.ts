import { describe, expect, it } from "vitest";
import { Crc32, type ZipEntry, zipStream } from "./zip-stream";

const enc = new TextEncoder();

async function collect(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of zipStream(entries)) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function entry(name: string, body: string, chunkSize = body.length): ZipEntry {
  return {
    name,
    open: async () => {
      const bytes = enc.encode(body);
      return (async function* () {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          yield bytes.slice(i, i + chunkSize);
        }
      })();
    },
  };
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/**
 * Minimal reader that walks the archive the way a real extractor does:
 * find the end-of-central-directory, seek to the central directory it
 * points at, and read each record. If offsets or sizes are wrong this
 * throws or returns garbage — which is the whole point of testing here
 * rather than asserting on byte offsets we ourselves wrote.
 */
function readCentralDirectory(zip: Uint8Array) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("no end-of-central-directory record");

  const count = u16(zip, eocd + 10);
  const size = u32(zip, eocd + 12);
  const offset = u32(zip, eocd + 16);

  const records: { name: string; crc: number; size: number; offset: number }[] = [];
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (u32(zip, at) !== 0x02014b50) throw new Error(`bad central header at entry ${i}`);
    const nameLen = u16(zip, at + 28);
    const extraLen = u16(zip, at + 30);
    const commentLen = u16(zip, at + 32);
    records.push({
      name: new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLen)),
      crc: u32(zip, at + 16),
      size: u32(zip, at + 24),
      offset: u32(zip, at + 42),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  if (at - offset !== size) throw new Error("central directory size does not match its records");
  return { records, count, directoryOffset: offset };
}

/** Read one entry's bytes by following its central-directory offset into
 *  the local header, exactly as an extractor would. */
function readEntryBody(zip: Uint8Array, rec: { offset: number; size: number }) {
  if (u32(zip, rec.offset) !== 0x04034b50) throw new Error("bad local header signature");
  const nameLen = u16(zip, rec.offset + 26);
  const extraLen = u16(zip, rec.offset + 28);
  const start = rec.offset + 30 + nameLen + extraLen;
  return new TextDecoder().decode(zip.slice(start, start + rec.size));
}

describe("Crc32", () => {
  it("matches the standard check vector", () => {
    const crc = new Crc32();
    crc.update(enc.encode("123456789"));
    expect(crc.value).toBe(0xcbf43926);
  });

  it("is chunk-boundary independent", () => {
    // The reason the class exists: entry bodies arrive as arbitrary
    // network chunks, so a CRC that depended on framing would produce
    // archives that fail verification at random.
    const whole = new Crc32();
    whole.update(enc.encode("the quick brown fox"));

    const split = new Crc32();
    split.update(enc.encode("the quick "));
    split.update(enc.encode("brown fox"));

    expect(split.value).toBe(whole.value);
  });

  it("returns the empty-input CRC before any update", () => {
    expect(new Crc32().value).toBe(0);
  });
});

describe("zipStream", () => {
  it("produces an archive whose central directory parses", async () => {
    const zip = await collect([entry("a.txt", "alpha"), entry("dir/b.txt", "bravo")]);
    const { records, count } = readCentralDirectory(zip);
    expect(count).toBe(2);
    expect(records.map((r) => r.name)).toEqual(["a.txt", "dir/b.txt"]);
  });

  it("records offsets that lead back to the right bytes", async () => {
    // Catches the classic streaming-ZIP bug: an offset that forgets to
    // count the data descriptor, so entry N+1 extracts as garbage.
    const zip = await collect([
      entry("first.txt", "one"),
      entry("second.txt", "a much longer second entry"),
      entry("third.txt", "three"),
    ]);
    const { records } = readCentralDirectory(zip);
    expect(readEntryBody(zip, records[0])).toBe("one");
    expect(readEntryBody(zip, records[1])).toBe("a much longer second entry");
    expect(readEntryBody(zip, records[2])).toBe("three");
  });

  it("records sizes and CRCs that match the streamed bodies", async () => {
    const body = "content that arrives in pieces";
    const zip = await collect([entry("chunked.txt", body, 4)]);
    const { records } = readCentralDirectory(zip);

    const expected = new Crc32();
    expected.update(enc.encode(body));

    expect(records[0].size).toBe(body.length);
    expect(records[0].crc).toBe(expected.value);
    expect(readEntryBody(zip, records[0])).toBe(body);
  });

  it("writes a data descriptor and leaves the local header fields zeroed", async () => {
    // Bit 3 of the general-purpose flag is the contract that lets us
    // stream: it moves CRC/sizes after the body. If the flag were unset,
    // extractors would trust the zeroes in the local header.
    const zip = await collect([entry("x.txt", "payload")]);
    expect(u16(zip, 6) & 0x0008).toBe(0x0008);
    expect(u32(zip, 14)).toBe(0);
    expect(u32(zip, 18)).toBe(0);
    expect(u32(zip, 22)).toBe(0);

    const { records } = readCentralDirectory(zip);
    expect(records[0].size).toBe("payload".length);
  });

  it("flags filenames as UTF-8", async () => {
    const zip = await collect([entry("café.txt", "x")]);
    expect(u16(zip, 6) & 0x0800).toBe(0x0800);
    expect(readCentralDirectory(zip).records[0].name).toBe("café.txt");
  });

  it("stores rather than deflates", async () => {
    // AVIF is already compressed; deflating it costs CPU and grows the
    // file. Method 0 is also what makes the writer a memcpy.
    const zip = await collect([entry("a.txt", "alpha")]);
    expect(u16(zip, 8)).toBe(0);
    expect(readEntryBody(zip, readCentralDirectory(zip).records[0])).toBe("alpha");
  });

  it("emits a valid empty archive", async () => {
    const zip = await collect([]);
    const { count, records } = readCentralDirectory(zip);
    expect(count).toBe(0);
    expect(records).toEqual([]);
    expect(zip.length).toBe(22);
  });

  it("handles a zero-byte entry", async () => {
    const zip = await collect([entry("empty.txt", ""), entry("after.txt", "still here")]);
    const { records } = readCentralDirectory(zip);
    expect(records[0].size).toBe(0);
    expect(readEntryBody(zip, records[1])).toBe("still here");
  });

  it("is byte-deterministic across runs", async () => {
    // Timestamps are zeroed on purpose; the collection route's ETag is
    // only meaningful because the same input yields the same archive.
    const build = () => collect([entry("a.txt", "alpha"), entry("b.txt", "bravo")]);
    expect(Array.from(await build())).toEqual(Array.from(await build()));
  });

  it("opens entries lazily and in order", async () => {
    // A 475-entry archive must not open 475 connections up front.
    const opened: string[] = [];
    const lazy = (name: string): ZipEntry => ({
      name,
      open: async () => {
        opened.push(name);
        return (async function* () {
          yield enc.encode(name);
        })();
      },
    });

    const iterator = zipStream([lazy("one"), lazy("two"), lazy("three")]);
    // First pull is the local header, which precedes open(); the second
    // pull is the body, which is what forces it. Either way, entries two
    // and three must still be untouched.
    await iterator.next();
    await iterator.next();
    expect(opened).toEqual(["one"]);
    for await (const _ of iterator) {
      // drain
    }
    expect(opened).toEqual(["one", "two", "three"]);
  });

  it("propagates an entry that fails to open", async () => {
    // A short archive that reports success is worse than a failed
    // transfer, so the stream aborts rather than skipping the plate.
    const failing: ZipEntry = {
      name: "gone.avif",
      open: async () => {
        throw new Error("Upstream 404");
      },
    };
    await expect(collect([entry("ok.txt", "fine"), failing])).rejects.toThrow("Upstream 404");
  });
});
