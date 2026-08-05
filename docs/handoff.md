# Fresh-session handoff

## State at handoff

The foundational research and proposal are complete. The repository contains
documentation and Parley collaboration history only; no application scaffold
or product code has been created, and this directory is not yet a Git
repository. D001 and D011 record accepted owner direction; all other decisions
remain `proposed` until the owner accepts them or implementation deliberately
locks them in.

Final owner direction:

- keep the product code-forward: SVG source on one side, rendered behavior on
  the other;
- animation is foundational and must grow beyond playback into strong
  inspection, provenance, and source-backed authoring;
- use GodSVG as the capability/quality benchmark for a possible visual-first
  editor;
- keep that visual-first work as a separate optional extension on top of the
  core, not in the active roadmap;
- preserve ordinary SVG source and local-first trust.

## Cold start

Read in this order:

1. `AGENTS.md` — invariants, boundaries, and working policy.
2. `docs/design.md` — authoritative code-forward product/system design.
3. `docs/plan.md` — active Phase 0–4 delivery plan and core animation follow-on.
4. `docs/decisions.md` — accepted owner boundaries and proposed choices to
   accept or revise.
5. `docs/research/2026-08-04-foundational.md` — evidence and competition.
6. `docs/research/2026-08-04-fable-collaboration.md` — what the parallel Fable
   work changed and where judgment differed.
7. `docs/visual-editing-extension.md` only if explicitly evaluating the
   separate GodSVG-class extension.

`docs/README.md` defines document authority. Do not treat the research archive
or `.parley/events.jsonl` as current policy when design/plan already synthesize
it.

## Proposal in one page

The opening product is not distinguished by split preview alone. It combines:

- one canonical source buffer and byte-faithful export;
- parser-backed source ↔ rendered-element navigation;
- secure browser-native CSS and SVG animation playback;
- a shared inspection time with honest limits for indefinite/event timing;
- selected-element animation provenance and source jumping;
- exact CSS custom-property controls, with sliders only for authored bounds;
- local files/recovery, no account/backend, and untrusted preview isolation;
- the quiet Yale visual system: warm black/ink, hairline rules, Geist/Mono,
  restrained red linkage, visible evidence, and no card/pill ornament.

The recommended stack is Vite + TypeScript, CodeMirror 6/Lezer XML, native
`DOMParser`, an iframe/CSP preview, IndexedDB recovery, Vitest, and Playwright,
initially without a UI framework.

## Risk and effort summary

- Split layout and preview are ordinary engineering.
- Useful bidirectional element/source navigation is medium difficulty: a basic
  path is a few days; hardened behavior is roughly one to two engineer-weeks.
- Secure mixed CSS/SMIL playback is feasible; duration inference, provenance,
  cross-browser isolation, and clock coherence are the real work.
- Variable sliders are easy visually and subtle textually: exact ranges,
  version conflicts, units, float formatting, and gesture undo matter most.
- Budget roughly one focused week for founding spikes and another four to six
  for the public-quality core MVP: about five to seven weeks total for one
  experienced front-end engineer.
- A GodSVG-class visual extension is a separate multi-quarter undertaking,
  especially for paths, transforms, structural edits, cascade provenance, and
  visual animation authoring.

These are planning estimates, not commitments. Re-estimate from Phase 0 data.

## First implementation session

Do not start with chrome. First initialize Git and commit this documentation
baseline so the stated history/decision policy is real. Then execute Phase 0 as
three vertical risk spikes:

1. Source/DOM mapping: CodeMirror/Lezer ranges, DOMParser alignment, moving
   selection, invalid-source retention, `use`, namespaces, and exact attribute
   name/value ranges.
2. Secure animation: readable geometry plus blocked script/network/navigation,
   CSS and SMIL clocks, restart, and shared seeking in Chromium/Firefox/WebKit.
3. Variable edit: root CSS custom property, exact `EditIntent`, precision
   policy, one undo gesture, stale-version refusal, and control-metadata
   comparison.

Before advancing, make no-edit open/inspect/play/seek/export byte-identical on
hostile-format fixtures. Then accept or revise the relevant decisions rather
than burying a failed assumption under shell work.

## Decision status and owner confirmation

Already accepted from explicit owner direction:

- D001: code-forward core; visual-first editor is separate.
- D011: GodSVG benchmarks that optional extension, not the implementation/core.

The highest-leverage proposed decisions still needing confirmation are:

- D002: source text is the only save/export authority.
- D003: CSS + SVG animation and shared inspection time; no arbitrary JS.
- D004/D005: CodeMirror/Lezer + DOMParser and structural per-version mapping.
- D006/D007: CSS custom properties; exact controls before bounded sliders.
- D008: local static TypeScript/Vite, no framework/backend initially.
- D009: the lean documentation/policy set.
- D010/D012: versioned source-command boundary and one exact `EditIntent`
  writeback path.

The control metadata form remains intentionally unresolved between readable
comments and one namespaced/data root schema. Phase 0 supplies the decision
evidence.

## Evidence already gathered

- Official/current competitor and platform links are inline in the foundational
  research.
- EditSVGCode source was inspected; its current click/source mapping demonstrates
  tractability but motivates a parser-backed mapping rather than regex/tag
  occurrence matching.
- GodSVG source was inspected; its typed elements/attributes, SVG/path parsers,
  transform models, and broad selection logic show why visual parity is not a
  short increment.
- Local current-browser probes rendered CSS variables in SVG geometry and
  sought CSS + SMIL to one shared second in Chromium, Firefox, and WebKit.
  Recreate these as checked-in regression tests; the ad hoc probes are not a
  deliverable.
- `~/dev/txttop` was absent. The matching `~/dev/txtop` project was surveyed,
  along with `~/dev/metrainome` and `~/dev/countrain`.
- The visual direction was distilled from
  `~/dev/ref/references/design/yale.md` into `docs/design.md`.

## Documentation and policy recommendation

Keep exactly the current lightweight authority shape for now:

- one short `AGENTS.md` for cold start/invariants;
- one living design;
- one current plan;
- one compact decision log;
- dated research/collaboration notes;
- this handoff while the project crosses sessions.

Do not add mandatory issue files, per-change briefs, one-file-per-ADR, review
receipts, duplicated agent policies, or a code-standards document until real
parallel work makes the current set ambiguous. Preserve metrainome's emphasis
on cold-start authority, durable outcomes, and browser/security behavior;
txtop's concise constraints and task-oriented index; and countrain's strong
living design plus compact chronological decisions.

## Known open questions

- Which initial audience leads examples and onboarding: animation authors,
  exported-SVG debuggers, or learners?
- What is the product name?
- Comment versus namespaced/data control metadata?
- CSS versus SMIL prevalence in real target files?
- Whether direct filesystem save belongs in the first public surface?
- After core validation, whether there is enough demand to start the optional
  visual-first extension at all?

None blocks Phase 0. Record evidence and decide at the named gates.

## Completion definition for the next session

The next session should not claim Phase 0 complete until the exact validation
commands and fixture results are checked in, the security boundary is proven in
the supported browsers, and any changed recommendation is reflected in design,
plan, and the decision log. Keep the chat summary secondary to these files.
