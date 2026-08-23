import { FileEnvelope } from "../files/FileEnvelope";
import type { DemoEntry } from "./manifest";
import { githubRawUrl } from "./registry";

export const MAX_DEMO_BYTES = 512 * 1024;
export const DEMO_TIMEOUT_MS = 8_000;

export type DemoLoadErrorCode =
  | "cancelled"
  | "timeout"
  | "not-found"
  | "rate-limited"
  | "server"
  | "http"
  | "network"
  | "too-large"
  | "invalid-utf8"
  | "integrity";

export class DemoLoadError extends Error {
  readonly code: DemoLoadErrorCode;

  constructor(
    code: DemoLoadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DemoLoadError";
    this.code = code;
  }
}

export interface LoadedDemo {
  readonly envelope: FileEnvelope;
  readonly sourceUrl: string;
}

interface LoadDemoOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

function statusError(status: number): DemoLoadError {
  if (status === 404)
    return new DemoLoadError(
      "not-found",
      "GitHub could not find that SVG. It may have moved or become private.",
    );
  if (status === 403 || status === 429)
    return new DemoLoadError(
      "rate-limited",
      "GitHub declined the request, possibly because of a rate limit.",
    );
  if (status >= 500)
    return new DemoLoadError(
      "server",
      "GitHub returned an error while loading the SVG.",
    );
  return new DemoLoadError(
    "http",
    `GitHub returned HTTP ${status} while loading the SVG.`,
  );
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes)
    throw new DemoLoadError(
      "too-large",
      `The SVG is larger than the ${maxBytes / 1024} KiB demo limit.`,
    );
  if (!response.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new DemoLoadError(
          "too-large",
          `The SVG is larger than the ${maxBytes / 1024} KiB demo limit.`,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadDemo(
  entry: DemoEntry,
  options: LoadDemoOptions = {},
): Promise<LoadedDemo> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEMO_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const sourceUrl = githubRawUrl(entry);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(sourceUrl, {
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "default",
      headers: {
        Accept: "image/svg+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted)
      throw new DemoLoadError("cancelled", "Demo loading was cancelled.", {
        cause: error,
      });
    if (timeout.aborted)
      throw new DemoLoadError(
        "timeout",
        `GitHub did not respond within ${(options.timeoutMs ?? DEMO_TIMEOUT_MS) / 1000} seconds.`,
        { cause: error },
      );
    throw new DemoLoadError(
      "network",
      "The SVG could not be loaded from GitHub. Check the network connection.",
      { cause: error },
    );
  }
  if (!response.ok) throw statusError(response.status);

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBytes(
      response,
      options.maxBytes ?? MAX_DEMO_BYTES,
    );
  } catch (error) {
    if (error instanceof DemoLoadError) throw error;
    if (options.signal?.aborted)
      throw new DemoLoadError("cancelled", "Demo loading was cancelled.", {
        cause: error,
      });
    if (timeout.aborted)
      throw new DemoLoadError(
        "timeout",
        `GitHub did not respond within ${(options.timeoutMs ?? DEMO_TIMEOUT_MS) / 1000} seconds.`,
        { cause: error },
      );
    throw new DemoLoadError(
      "network",
      "The SVG response ended before it could be read.",
      { cause: error },
    );
  }

  if (
    entry.reference.kind === "commit" &&
    (await sha256Hex(bytes)) !== entry.reference.sha256
  ) {
    throw new DemoLoadError(
      "integrity",
      "The SVG did not match its recorded checksum and was not loaded.",
    );
  }

  try {
    return {
      envelope: FileEnvelope.fromBytes(entry.filename, bytes),
      sourceUrl,
    };
  } catch (error) {
    throw new DemoLoadError(
      "invalid-utf8",
      "The SVG is not valid UTF-8 text.",
      { cause: error },
    );
  }
}
