import { describe, expect, it } from "vitest";
import type { DemoEntry } from "./manifest";
import {
  findDemo,
  githubBlobUrl,
  githubRawUrl,
  validateDemoManifest,
} from "./registry";
import { DEMOS } from "./roster";

const card = DEMOS[0]!;

describe("demo registry", () => {
  it("indexes a stable validated card entry", () => {
    expect(findDemo(DEMOS, "card")).toBe(card);
    expect(findDemo(DEMOS, "Card")).toBeUndefined();
    expect(githubRawUrl(card)).toBe(
      "https://raw.githubusercontent.com/y4le/svg/main/.yalethomas/card.svg",
    );
    expect(githubBlobUrl(card)).toBe(
      "https://github.com/y4le/svg/blob/main/.yalethomas/card.svg",
    );
  });

  it("rejects duplicate or unsafe manifest coordinates", () => {
    expect(() => validateDemoManifest([card, card])).toThrow("Duplicate");
    for (const entry of [
      { ...card, shortname: "Card" },
      { ...card, owner: "evil.example/x" },
      { ...card, owner: ".." },
      { ...card, repository: "." },
      { ...card, reference: { kind: "branch", branch: "feature/x" } },
      { ...card, reference: { kind: "branch", branch: ".." } },
      { ...card, path: "../../etc/passwd" },
      { ...card, path: "/absolute.svg" },
      { ...card, path: "a\\b.svg" },
    ] as DemoEntry[]) {
      expect(() => validateDemoManifest([entry])).toThrow();
    }
  });

  it("requires valid immutable pins and third-party attribution", () => {
    const thirdParty = {
      ...card,
      party: "third-party",
      reference: {
        kind: "commit",
        commit: "a".repeat(40),
        sha256: "b".repeat(64),
      },
      license: "MIT",
      attribution: "Example author",
    } as const;
    expect(validateDemoManifest([thirdParty])).toEqual([thirdParty]);
    expect(() =>
      validateDemoManifest([
        { ...thirdParty, reference: { ...thirdParty.reference, sha256: "no" } },
      ]),
    ).toThrow("SHA-256");
  });
});
