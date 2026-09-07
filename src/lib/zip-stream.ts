// A streaming, store-only ZIP writer.
//
// Why hand-rolled rather than a dependency: the container this runs in is
// small, and the archives it builds are 86–225 MB of AVIF. Every off-the-
// shelf option either buffers the archive (fine for the deterministic
// press-kit builder in scripts/build-press-kit-zip.mjs, fatal here) or
// pulls in a deflate implementation we'd immediately disable. AVIF is
// already compressed; deflating it burns CPU to make the file marginally
// bigger. Store method it is, which means the "compressor" is a memcpy and
// the whole writer is header bookkeeping.
//
// Two structural choices worth stating:
//
//   - **Data descriptors** (general-purpose bit 3). A local file header
//     normally carries CRC and size *before* the data, which you can only
//     know by reading the file first — i.e. by buffering it. Bit 3 defers
//     all three fields to a descriptor written *after* the entry, so each
//     file can be piped straight from its origin response to the client.
//     This is the mechanism that keeps peak memory at one chunk.
//
//   - **No Zip64.** Plain ZIP addresses 4 GiB of offsets and 65,535
//     entries. Callers stay far inside both (see ZIP_MAX_ENTRIES and
//     ZIP_VARIANT_WIDTH in collections.ts), and `zipStream` throws rather
//     than silently emitting a corrupt archive if an offset ever wraps.

/** Beyond this, offsets no longer fit the 32-bit fields and the archive
 *  would need Zip64. Callers size their sets to stay well below it. */
const ZIP32_MAX_OFFSET = 0xffffffff;

const LOCAL_HEADER_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const STORE_METHOD = 0;
const VERSION_NEEDED = 20;
/** Unix (3) << 8 | ZIP spec 3.0 — makes the external attrs below mean
 *  what we want on extraction. */
const VERSION_MADE_BY = 0x031e;
/** Bit 3 (data descriptor follows) + bit 11 (filename is UTF-8). */
const FLAGS = 0x0008 | 0x0800;
/** `-rw-r--r--` in the high 16 bits, where Unix extractors look. */
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0;

// Timestamps are zeroed rather than set to "now", so two requests for the
// same set produce byte-identical archives. That's what makes the ETag in
// the collection route meaningful.
const ZERO_DOS_TIME = 0;
const ZERO_DOS_DATE = 0;

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

/** Running CRC-32 (IEEE), fed one chunk at a time so entries never need
 *  to be held whole. Seed and finalise both use the standard 0xFFFFFFFF
 *  inversion. */
export class Crc32 {
  private state = 0xffffffff;

  update(chunk: Uint8Array): void {
    let c = this.state;
    for (let i = 0; i < chunk.length; i++) {
      c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
    }
    this.state = c;
  }

  get value(): number {
    return (this.state ^ 0xffffffff) >>> 0;
  }
}

/** One file to place in the archive. `body` is opened lazily, at the
 *  moment the writer reaches this entry, so a 475-entry archive doesn't
 *  open 475 connections up front. */
export type ZipEntry = {
  /** Path inside the archive. Forward slashes, no leading slash. */
  name: string;
  /** Resolves to the bytes of this entry. Rejecting aborts the stream. */
  open: () => Promise<AsyncIterable<Uint8Array>>;
};

class ByteWriter {
  private parts: Uint8Array[] = [];

  u16(v: number): this {
    this.parts.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
    return this;
  }

  u32(v: number): this {
    const n = v >>> 0;
    this.parts.push(
      new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]),
    );
    return this;
  }

  bytes(v: Uint8Array): this {
    this.parts.push(v);
    return this;
  }

  done(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
};

function localHeader(name: Uint8Array): Uint8Array {
  return (
    new ByteWriter()
      .u32(LOCAL_HEADER_SIG)
      .u16(VERSION_NEEDED)
      .u16(FLAGS)
      .u16(STORE_METHOD)
      .u16(ZERO_DOS_TIME)
      .u16(ZERO_DOS_DATE)
      // CRC and both sizes are unknown until the body has streamed past;
      // bit 3 in FLAGS is the promise that they arrive in the descriptor.
      .u32(0)
      .u32(0)
      .u32(0)
      .u16(name.length)
      .u16(0)
      .bytes(name)
      .done()
  );
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  return new ByteWriter().u32(DATA_DESCRIPTOR_SIG).u32(crc).u32(size).u32(size).done();
}

function centralHeader(rec: CentralRecord): Uint8Array {
  return new ByteWriter()
    .u32(CENTRAL_HEADER_SIG)
    .u16(VERSION_MADE_BY)
    .u16(VERSION_NEEDED)
    .u16(FLAGS)
    .u16(STORE_METHOD)
    .u16(ZERO_DOS_TIME)
    .u16(ZERO_DOS_DATE)
    .u32(rec.crc)
    .u32(rec.size)
    .u32(rec.size)
    .u16(rec.name.length)
    .u16(0)
    .u16(0)
    .u16(0)
    .u16(0)
    .u32(EXTERNAL_ATTRS)
    .u32(rec.offset)
    .bytes(rec.name)
    .done();
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  return new ByteWriter()
    .u32(EOCD_SIG)
    .u16(0)
    .u16(0)
    .u16(count)
    .u16(count)
    .u32(size)
    .u32(offset)
    .u16(0)
    .done();
}

/**
 * Emit a ZIP archive as a sequence of chunks.
 *
 * Entries are opened one at a time and their bodies forwarded straight
 * through, so peak memory is a single chunk plus the central directory
 * (~60 bytes per entry) rather than the archive. Consumers get
 * backpressure for free by pulling from the returned iterator.
 */
export async function* zipStream(entries: Iterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const central: CentralRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const header = localHeader(name);
    const entryOffset = offset;

    yield header;
    offset += header.length;

    const crc = new Crc32();
    let size = 0;

    for await (const chunk of await entry.open()) {
      crc.update(chunk);
      size += chunk.length;
      offset += chunk.length;
      yield chunk;
    }

    const descriptor = dataDescriptor(crc.value, size);
    yield descriptor;
    offset += descriptor.length;

    // Checked per entry rather than once at the end: past 4 GiB the next
    // entry's recorded offset is already wrong, and a truncated archive
    // that reports success is the worst outcome available.
    if (offset > ZIP32_MAX_OFFSET) {
      throw new Error(
        `ZIP exceeded the 4 GiB limit of a non-Zip64 archive at entry "${entry.name}".`,
      );
    }

    central.push({ name, crc: crc.value, size, offset: entryOffset });
  }

  const directoryOffset = offset;
  let directorySize = 0;
  for (const rec of central) {
    const header = centralHeader(rec);
    directorySize += header.length;
    yield header;
  }

  yield endOfCentralDirectory(central.length, directorySize, directoryOffset);
}

/** Adapt `zipStream` to a web ReadableStream for a Response body. Pull-
 *  based, so a client that stops reading stops us fetching from origin. */
export function zipReadableStream(entries: Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = zipStream(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}
