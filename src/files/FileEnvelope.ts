export type LineEnding = "\n" | "\r\n" | "\r";

function detectLineEndings(text: string): {
  lineEnding: LineEnding;
  mixed: boolean;
} {
  const endings = text.match(/\r\n|\r|\n/g) ?? [];
  const kinds = new Set(endings);
  return {
    lineEnding: (endings[0] as LineEnding | undefined) ?? "\n",
    mixed: kinds.size > 1,
  };
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n|\r/g, "\n");
}

function withLineEnding(source: string, lineEnding: LineEnding): string {
  return lineEnding === "\n" ? source : source.replace(/\n/g, lineEnding);
}

export class FileEnvelope {
  readonly filename: string;
  readonly source: string;
  readonly hasBom: boolean;
  readonly lineEnding: LineEnding;
  readonly mixedLineEndings: boolean;
  readonly #originalBytes: Uint8Array;

  private constructor(
    filename: string,
    source: string,
    originalBytes: Uint8Array,
    hasBom: boolean,
    lineEnding: LineEnding,
    mixedLineEndings: boolean,
  ) {
    this.filename = filename;
    this.source = source;
    this.#originalBytes = originalBytes;
    this.hasBom = hasBom;
    this.lineEnding = lineEnding;
    this.mixedLineEndings = mixedLineEndings;
  }

  static fromBytes(
    filename: string,
    input: ArrayBuffer | Uint8Array,
  ): FileEnvelope {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const content = hasBom ? bytes.slice(3) : bytes;
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
    const { lineEnding, mixed } = detectLineEndings(decoded);
    return new FileEnvelope(
      filename || "untitled.svg",
      normalizeLineEndings(decoded),
      bytes.slice(),
      hasBom,
      lineEnding,
      mixed,
    );
  }

  static new(filename: string, source: string): FileEnvelope {
    const bytes = new TextEncoder().encode(source);
    return new FileEnvelope(filename, source, bytes, false, "\n", false);
  }

  export(source: string): Uint8Array {
    if (source === this.source) return this.#originalBytes.slice();
    const lineEnding = this.mixedLineEndings ? "\n" : this.lineEnding;
    const content = new TextEncoder().encode(
      withLineEnding(source, lineEnding),
    );
    if (!this.hasBom) return content;
    const bytes = new Uint8Array(content.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(content, 3);
    return bytes;
  }
}
