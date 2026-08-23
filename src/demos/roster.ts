import type { DemoEntry } from "./manifest";
import { validateDemoManifest } from "./registry";

export const DEMOS: readonly DemoEntry[] = validateDemoManifest([
  {
    party: "first-party",
    shortname: "card",
    title: "Project card",
    summary: "Source and rendered mark share a four-second CSS rotation.",
    filename: "yalethomas-card.svg",
    owner: "y4le",
    repository: "svg",
    reference: { kind: "branch", branch: "main" },
    path: ".yalethomas/card.svg",
  },
]);
