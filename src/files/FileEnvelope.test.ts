import { describe, expect, it } from "vitest";
import { FileEnvelope } from "./FileEnvelope";

describe("FileEnvelope", () => {
  it("returns the exact original bytes when source is untouched", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("<svg>\r\n</svg>\r\n"),
    ]);
    const envelope = FileEnvelope.fromBytes("exact.svg", bytes);
    expect(envelope.source).toBe("<svg>\n</svg>\n");
    expect(envelope.hasBom).toBe(true);
    expect([...envelope.export(envelope.source)]).toEqual([...bytes]);
  });

  it("preserves a uniform line ending and BOM after edits", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("<svg>\r\n</svg>"),
    ]);
    const envelope = FileEnvelope.fromBytes("edited.svg", bytes);
    const exported = envelope.export("<svg>\n  <g/>\n</svg>");
    expect([...exported.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(exported.slice(3))).toBe(
      "<svg>\r\n  <g/>\r\n</svg>",
    );
  });

  it("normalizes mixed endings to LF only after an edit", () => {
    const original = new TextEncoder().encode("<svg>\r\n<g/>\n</svg>");
    const envelope = FileEnvelope.fromBytes("mixed.svg", original);
    expect(envelope.mixedLineEndings).toBe(true);
    expect([...envelope.export(envelope.source)]).toEqual([...original]);
    expect(
      new TextDecoder().decode(envelope.export(`${envelope.source}\n`)),
    ).toBe("<svg>\n<g/>\n</svg>\n");
  });
});
