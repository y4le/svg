# AGENTS.md

## Intent

Build a quiet, exact browser instrument for authoring, understanding, and
tuning SVG source. Code/preview navigation, animation inspection, and
source-backed controls are the core. GodSVG-class visual-first editing is a
possible extension on top, not the organizing product surface. The code is the
project format, not an export detail.

## Cold start

Read, in order:

1. [docs/README.md](docs/README.md)
2. [docs/handoff.md](docs/handoff.md) for current state and pickup
3. [docs/design.md](docs/design.md)
4. [docs/plan.md](docs/plan.md)
5. [docs/decisions.md](docs/decisions.md) when a choice is in dispute

Read `docs/visual-editing-extension.md` only when work explicitly concerns the
optional visual editing track.

The design doc is authoritative for product and architecture. The plan is
authoritative for current scope. Research is evidence, not policy.

## Invariants

- The user's source string is canonical. Never round-trip the whole document
  through a DOM serializer or silently format, optimize, reorder, or normalize
  it. (Unless specifically asked)
- Preview input is untrusted. Scripts, inline event handlers, navigation, and
  network access stay disabled by default. Declarative CSS and SVG animation
  must still work.
- Any edit triggered outside the code pane changes the smallest known source
  range through the editor's transaction and undo system. A typed document or
  animation projection may be derived, but it is version-bound and never a
  second save authority.
- Source/render linking is structural and explicit. When a rendered instance
  has no unique authored source element, select the nearest honest source
  owner and explain the fallback.
- Animation always has a visible pause mechanism and respects reduced-motion
  preferences in the workbench chrome.
- Work locally by default. Accounts, cloud storage, telemetry, AI, and
  collaboration are not assumed product requirements.
- Accessibility and browser behavior are architecture concerns, not polish.

## Boundaries

- Keep parsing, source ranges, control discovery, and selection mapping in a
  framework-independent TypeScript core.
- Model core variable/animation controls as source commands with preconditions
  and exact affected ranges. Any optional visual extension must use the same
  boundary. Preserve unknown elements, attributes, comments, and formatting
  outside those ranges.
- Keep CodeMirror integration, iframe lifecycle, and DOM rendering at the
  edges.
- Prefer platform SVG, CSS, and Web APIs over an animation runtime.
- Add a dependency only when it owns a real capability better than a small,
  testable local module. Record consequential dependency choices in
  `docs/decisions.md`.

## Workflow

- Before a substantial change, put its goal, non-goals, acceptance checks, and
  affected boundaries in `docs/plan.md` or a linked focused plan.
- Run the smallest tests that could plausibly fail, then the project format,
  typecheck, lint, unit, and browser checks relevant to the change. Record the
  exact commands here once the scaffold establishes them.
- Update the design when behavior or architecture changes. Add a decision-log
  entry only when alternatives and rationale will matter later.
- Use a collaborator for high-risk architecture, security, parser, or release
  work. Do not require consultation or a review artifact for every trivial
  change.
- Keep commits coherent; do not mix drive-by cleanup with the requested work.
  In commit messages explain what changed and why.

## Keep the process proportional

This repository deliberately starts with one design, one current plan, one
decision log, and dated research. Add per-issue files, ADR folders, review
archives, or multiple plan indexes only when concurrent work makes the simpler
structure ambiguous.
