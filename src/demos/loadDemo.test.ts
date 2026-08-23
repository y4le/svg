import { describe, expect, it, vi } from "vitest";
import type { DemoEntry } from "./manifest";
import { loadDemo, sha256Hex } from "./loadDemo";
import type { DemoLoadError } from "./loadDemo";
import { DEMOS } from "./roster";

const card = DEMOS[0]!;
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg">\r\n</svg>\r\n',
);

function response(bytes = SVG, status = 200): Response {
  return new Response(bytes, { status });
}

async function expectCode(
  promise: Promise<unknown>,
  code: DemoLoadError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("GitHub demo loading", () => {
  it("uses a constrained credential-free request and preserves exact bytes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      expect(url).toBe(
        "https://raw.githubusercontent.com/y4le/svg/main/.yalethomas/card.svg",
      );
      expect(init).toMatchObject({
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      return Promise.resolve(response());
    });
    const loaded = await loadDemo(card, { fetch });
    expect(loaded.envelope.source).toContain("\n");
    expect(loaded.envelope.source).not.toContain("\r");
    expect([...loaded.envelope.export(loaded.envelope.source)]).toEqual([
      ...SVG,
    ]);
  });

  it("maps GitHub and size failures without producing an envelope", async () => {
    for (const [status, code] of [
      [404, "not-found"],
      [403, "rate-limited"],
      [429, "rate-limited"],
      [500, "server"],
      [418, "http"],
    ] as const) {
      await expectCode(
        loadDemo(card, {
          fetch: () => Promise.resolve(response(undefined, status)),
        }),
        code,
      );
    }
    await expectCode(
      loadDemo(card, {
        fetch: () => Promise.resolve(response()),
        maxBytes: SVG.length - 1,
      }),
      "too-large",
    );
    await expectCode(
      loadDemo(card, {
        fetch: () =>
          Promise.resolve(
            new Response(SVG, {
              headers: { "content-length": String(SVG.length + 1) },
            }),
          ),
        maxBytes: SVG.length,
      }),
      "too-large",
    );
  });

  it("rejects malformed UTF-8 and a mismatched immutable digest", async () => {
    await expectCode(
      loadDemo(card, {
        fetch: () => Promise.resolve(response(new Uint8Array([0xc3, 0x28]))),
      }),
      "invalid-utf8",
    );
    const pinned: DemoEntry = {
      ...card,
      reference: {
        kind: "commit",
        commit: "a".repeat(40),
        sha256: "0".repeat(64),
      },
    };
    await expectCode(
      loadDemo(pinned, { fetch: () => Promise.resolve(response()) }),
      "integrity",
    );
    const verified: DemoEntry = {
      ...card,
      reference: {
        kind: "commit",
        commit: "a".repeat(40),
        sha256: await sha256Hex(SVG),
      },
    };
    await expect(
      loadDemo(verified, { fetch: () => Promise.resolve(response()) }),
    ).resolves.toBeDefined();
  });

  it("distinguishes caller cancellation, timeout, and network failure", async () => {
    const pendingFetch = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const controller = new AbortController();
    const cancelled = loadDemo(card, {
      fetch: pendingFetch,
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    controller.abort();
    await expectCode(cancelled, "cancelled");
    await expectCode(
      loadDemo(card, { fetch: pendingFetch, timeoutMs: 1 }),
      "timeout",
    );
    await expectCode(
      loadDemo(card, {
        fetch: () => Promise.reject(new TypeError("offline")),
      }),
      "network",
    );
  });
});
