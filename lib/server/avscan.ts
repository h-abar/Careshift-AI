import net from "node:net";

export interface AvResult {
  clean: boolean;
  /** Virus/signature name when clean === false. */
  signature?: string;
  /** Engine that produced the verdict. */
  engine: string;
}

/** Pluggable antivirus scan hook — runs before an upload is available. */
export interface AvScanner {
  name: string;
  scan(buf: Buffer, fileName: string): Promise<AvResult>;
}

/** Default: no engine configured — files pass straight through. */
export class NoopScanner implements AvScanner {
  name = "noop";
  async scan(): Promise<AvResult> {
    return { clean: true, engine: this.name };
  }
}

/**
 * ClamAV adapter — talks the INSTREAM protocol to clamd over TCP
 * (CLAMAV_HOST/CLAMAV_PORT, default 3310). Fails CLOSED: if the daemon is
 * unreachable the file is treated as not-scannable and rejected.
 */
export class ClamAvScanner implements AvScanner {
  name = "clamav";
  constructor(
    private host = process.env.CLAMAV_HOST || "127.0.0.1",
    private port = Number(process.env.CLAMAV_PORT || 3310),
    private timeoutMs = 15_000,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scan(buf: Buffer, _fileName: string): Promise<AvResult> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port });
      let out = "";
      const fail = (e: Error) => {
        sock.destroy();
        reject(e);
      };
      sock.setTimeout(this.timeoutMs, () => fail(new Error("clamd timeout")));
      sock.on("error", fail);
      sock.on("connect", () => {
        sock.write("zINSTREAM\0");
        // INSTREAM: 4-byte big-endian length + chunk, terminated by len 0.
        const CHUNK = 64 * 1024;
        for (let off = 0; off < buf.length; off += CHUNK) {
          const part = buf.subarray(off, off + CHUNK);
          const head = Buffer.alloc(4);
          head.writeUInt32BE(part.length);
          sock.write(Buffer.concat([head, part]));
        }
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0);
        sock.write(end);
      });
      sock.on("data", (d) => {
        out += d.toString("utf8");
        if (out.includes("\n") || out.includes("FOUND") || out.endsWith("OK")) {
          sock.destroy();
          if (/\bOK\s*$/.test(out)) {
            resolve({ clean: true, engine: this.name });
          } else {
            const m = out.match(/stream:\s*(.+?)\s*FOUND/i);
            resolve({
              clean: false,
              signature: m?.[1] ?? out.trim(),
              engine: this.name,
            });
          }
        }
      });
      sock.on("close", () => {
        if (!/\bOK\s*$/.test(out) && !/FOUND/.test(out)) {
          reject(new Error(`unexpected clamd reply: ${out.trim()}`));
        }
      });
    });
  }
}

export function avScanner(): AvScanner {
  if (process.env.CLAMAV_HOST) return new ClamAvScanner();
  return new NoopScanner();
}

// Test seam — unit tests can substitute a failing scanner.
let override: AvScanner | null = null;
export function __setAvScannerForTests(s: AvScanner | null) {
  override = s;
}
export function activeScanner(): AvScanner {
  return override ?? avScanner();
}
