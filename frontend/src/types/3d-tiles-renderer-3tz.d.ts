/**
 * MICRO-3TZ-DAL-PACCHETTO (7 Nov 2026) · the declarations of
 * `3d-tiles-renderer-3tz` (E.D.'s package, MIT, plain JS: it ships none),
 * for what EMStudio uses of it — at the commit pinned in `package.json`
 * (dafe5a3). `tiles3tz.ts` is the only module that imports it.
 */
declare module "3d-tiles-renderer-3tz" {
  /** where the bytes of an archive come from (`src/sources.js`) */
  export interface ByteSource {
    /** the last `length` bytes, and the size of the file */
    tail(length: number): Promise<{ bytes: Uint8Array; size: number }>;
    read(offset: number, length: number): Promise<Uint8Array>;
    stats(): { kind: "blob" | "http"; ranges: boolean | null; requests: number; bytes: number };
  }

  export function blobSource(blob: Blob): ByteSource;
  export function httpSource(url: string, options?: {
    fetch?: typeof fetch;
    fetchOptions?: RequestInit;
    /** a server that ignores `Range`: the most it may send (default 1 GiB) */
    maxDownloadBytes?: number;
  }): ByteSource;

  export interface ArchiveOptions {
    tailBytes?: number;
    /** over this the central directory is not read, the index is (16 MB) */
    maxDirectoryBytes?: number;
    guessBytes?: number;
    /** the most an entry may take, compressed or inflated (256 MB) */
    maxEntryBytes?: number;
  }

  /** an entry's place, as the package's `parseDirectory` writes it */
  export interface EntryLocation { offset: number; compressedSize: number; nameLength: number; method: number }

  export class Archive3tz {
    static open(source: ByteSource, options?: ArchiveOptions): Promise<Archive3tz>;
    /** Not documented as API: the constructor `open` calls. EMStudio builds a
     *  plain zip's archive with it (`tiles3tz.ts ZipArchive`), the entries
     *  from its own directory — proposal in the report: `Archive3tz.fromEntries`. */
    constructor(source: ByteSource, init: {
      entries: Map<string, EntryLocation> | null; index: Uint8Array | null;
      guessBytes?: number; maxEntryBytes?: number; openRequests: number; zip64: boolean;
    });
    readonly source: ByteSource;
    readonly info: { files: number; lookup: "central-directory" | "index"; openRequests: number; zip64: boolean };
    /** Not documented as API: the directory, when the archive was opened by
     *  it (null through the index). `names()` reads it — proposal in the report. */
    readonly _entries: Map<string, EntryLocation> | null;
    has(path: string): boolean;
    read(path: string): Promise<Uint8Array | null>;
  }

  export class Tiles3tzPlugin {
    constructor(options?: { fetch?: typeof fetch; archiveOptions?: ArchiveOptions; maxDownloadBytes?: number; archiveOnly?: boolean });
    addFile(blob: Blob): string;
    addURL(url: string): string;
  }
}
