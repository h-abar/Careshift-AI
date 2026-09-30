/** Magic-byte signatures for the allowed upload types (lib/denial.ts). */
export const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
};

/** Detect the real type from leading bytes; null when unknown. */
export function sniffMime(buf: Buffer): string | null {
  for (const [mime, sigs] of Object.entries(MAGIC_BYTES)) {
    if (
      sigs.some((sig) => sig.every((b, i) => buf.length > i && buf[i] === b))
    ) {
      return mime;
    }
  }
  return null;
}

/**
 * Buffer a multipart File with a hard cap — reads the stream and aborts the
 * moment `max` is exceeded instead of trusting the declared file.size.
 */
export async function readFileWithCap(
  file: File,
  max: number,
): Promise<{ buf: Buffer } | { tooLarge: true }> {
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { buf: Buffer.concat(chunks) };
}
