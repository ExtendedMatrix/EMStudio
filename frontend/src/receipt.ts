/**
 * CATENA · the RECEIPT of a stamped file on the shelf.
 *
 * The receipt is dtcstamp's `receipt(stamp)` — `{id, checksum, stamp, parents,
 * title?, description?}` — stored AS IT CAME on the entry's data under
 * `stamp_receipt` (s3Dgraphy `shelf.STAMP_RECEIPT_KEY`), never rebuilt here:
 * there is one form of it. It is a COPY: the truth stays the `.stamp.json`
 * beside the file. When the sidecar and the bytes are reachable the receipt is
 * compared with them, and a file that changed under its receipt is said so.
 */
import type { ShelfEntry } from "./shelf";
import type { StampReceipt } from "./stamp-compose";

export const RECEIPT_KEY = "stamp_receipt";

export function receiptOf(e: ShelfEntry | undefined): StampReceipt | null {
  const r = e?.extra?.[RECEIPT_KEY];
  return r && typeof r === "object" && typeof (r as StampReceipt).id === "string" ? (r as StampReceipt) : null;
}

/** What `addToShelf` is given for one stamped file. */
export function receiptShelfInput(path: string, receipt: StampReceipt): {
  locator: string; name: string; checksum?: string; extra: Record<string, unknown>;
} {
  const base = path.split("/").pop() || path;
  return {
    locator: path,
    name: receipt.title || base,
    ...(receipt.checksum ? { checksum: receipt.checksum } : {}),
    extra: { [RECEIPT_KEY]: receipt },
  };
}

/** The receipts an emission produced (one per written stamp), for the shelf. */
export function receiptsOfEmission(stamps: Array<{ path: string; receipt?: StampReceipt | null }>):
  Array<ReturnType<typeof receiptShelfInput>> {
  return stamps.filter((s) => s.path && s.receipt).map((s) => receiptShelfInput(s.path, s.receipt!));
}

export type ReceiptCheck =
  | "ok"               // the sidecar and the bytes say what the receipt says
  | "file-changed"     // the bytes' digest is not the receipt's: the file changed
  | "sidecar-differs"  // the sidecar names other bytes (or another id) than the receipt
  | "unreachable";     // nothing to compare with here (no bridge, no file)

/**
 * Compare a receipt with what is reachable: the sidecar's `self` and the bytes'
 * current digest (either may be missing). The sidecar is the truth: when it
 * disagrees with the receipt the receipt is the stale one.
 */
export function checkReceipt(
  receipt: StampReceipt,
  sidecar: { self?: { resource_id?: string; digest?: string } } | null | undefined,
  fileDigest: string | null | undefined,
): ReceiptCheck {
  if (!sidecar && !fileDigest) return "unreachable";
  if (fileDigest && receipt.checksum && fileDigest !== receipt.checksum) return "file-changed";
  const self = sidecar?.self;
  if (self && ((self.resource_id && self.resource_id !== receipt.id)
      || (self.digest && receipt.checksum && self.digest !== receipt.checksum))) return "sidecar-differs";
  return "ok";
}
