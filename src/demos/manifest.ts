export interface BranchReference {
  readonly kind: "branch";
  readonly branch: string;
}

export interface CommitReference {
  readonly kind: "commit";
  readonly commit: string;
  readonly sha256: string;
}

interface DemoBase {
  readonly shortname: string;
  readonly title: string;
  readonly summary: string;
  readonly filename: string;
  readonly owner: string;
  readonly repository: string;
  readonly path: string;
}

export interface FirstPartyDemo extends DemoBase {
  readonly party: "first-party";
  readonly reference: BranchReference | CommitReference;
}

export interface ThirdPartyDemo extends DemoBase {
  readonly party: "third-party";
  readonly reference: CommitReference;
  readonly license: string;
  readonly attribution: string;
}

export type DemoEntry = FirstPartyDemo | ThirdPartyDemo;
