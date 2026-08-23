import { normalizeSvgFilename } from "../files/filename";
import type { DemoEntry } from "./manifest";

const SHORTNAME = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const GITHUB_SEGMENT = /^[A-Za-z0-9._-]+$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function assertGithubSegment(value: string, label: string): void {
  if (!GITHUB_SEGMENT.test(value) || value === "." || value === "..")
    throw new Error(`Unsupported GitHub ${label}: ${value}`);
}

function assertRepositoryPath(path: string): void {
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        [...segment].some((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code < 32 || code === 127;
        }),
    )
  ) {
    throw new Error(`Unsupported GitHub path: ${path}`);
  }
}

function referenceValue(entry: DemoEntry): string {
  return entry.reference.kind === "branch"
    ? entry.reference.branch
    : entry.reference.commit;
}

export function validateDemoManifest(
  entries: readonly DemoEntry[],
): readonly DemoEntry[] {
  const shortnames = new Set<string>();
  for (const entry of entries) {
    if (!SHORTNAME.test(entry.shortname))
      throw new Error(`Unsupported demo shortname: ${entry.shortname}`);
    if (shortnames.has(entry.shortname))
      throw new Error(`Duplicate demo shortname: ${entry.shortname}`);
    shortnames.add(entry.shortname);
    if (!entry.title.trim() || !entry.summary.trim())
      throw new Error(`Demo copy is required: ${entry.shortname}`);
    if (normalizeSvgFilename(entry.filename) !== entry.filename)
      throw new Error(`Unsupported demo filename: ${entry.filename}`);
    assertGithubSegment(entry.owner, "owner");
    assertGithubSegment(entry.repository, "repository");
    assertGithubSegment(referenceValue(entry), "reference");
    assertRepositoryPath(entry.path);
    if (entry.reference.kind === "commit") {
      if (!COMMIT.test(entry.reference.commit))
        throw new Error(`Unsupported commit pin: ${entry.reference.commit}`);
      if (!SHA256.test(entry.reference.sha256))
        throw new Error(`Unsupported SHA-256: ${entry.reference.sha256}`);
    }
    if (
      entry.party === "third-party" &&
      (!entry.license.trim() || !entry.attribution.trim())
    ) {
      throw new Error(
        `Third-party attribution is required: ${entry.shortname}`,
      );
    }
  }
  return entries;
}

export function findDemo(
  entries: readonly DemoEntry[],
  shortname: string,
): DemoEntry | undefined {
  return entries.find((entry) => entry.shortname === shortname);
}

function encodedPath(path: string): string {
  assertRepositoryPath(path);
  return path.split("/").map(encodeURIComponent).join("/");
}

export function githubRawUrl(entry: DemoEntry): string {
  assertGithubSegment(entry.owner, "owner");
  assertGithubSegment(entry.repository, "repository");
  const reference = referenceValue(entry);
  assertGithubSegment(reference, "reference");
  return `https://raw.githubusercontent.com/${entry.owner}/${entry.repository}/${reference}/${encodedPath(entry.path)}`;
}

export function githubBlobUrl(entry: DemoEntry): string {
  assertGithubSegment(entry.owner, "owner");
  assertGithubSegment(entry.repository, "repository");
  const reference = referenceValue(entry);
  assertGithubSegment(reference, "reference");
  return `https://github.com/${entry.owner}/${entry.repository}/blob/${reference}/${encodedPath(entry.path)}`;
}
