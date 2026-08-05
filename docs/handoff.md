# Fresh-session handoff

## State at handoff

The usable session MVP is complete. It has CodeMirror editing, last-known-good
SVG rendering in a script-disabled sandbox, source ↔ rendered-element
selection, coherent CSS/SMIL play/pause/restart/seek, exact source-backed root
variables with authored sliders, local byte-aware open/download, and opt-in
crash recovery. Hostile-input, animation-clock, selection, gesture, file, and
recovery contracts run in Chromium, Firefox, and WebKit.

The next work is public-quality depth rather than a missing basic loop:
animation provenance and source jumps, Inspect/Interact switching, pan/zoom,
deeper `use`/instance fallbacks, performance fixtures, and observed-user
validation. Keep the GodSVG-class visual editor in the separate extension
roadmap.

The usable MVP lands through `89bac50` on `main`; this handoff may be followed
by a documentation-only commit. Earlier milestones are `c068bb2` for the
documentation baseline and `86ebd67` for the static scaffold. The worktree was
clean at handoff. D001 and D011 record accepted owner direction; later accepted
entries record architecture gates deliberately locked during implementation.

Final verification at `89bac50`:

- `npm run validate` passes formatting, lint, TypeScript, 25 unit tests, and the
  production build;
- `npm run test:browser` passes 57/57 contracts across Chromium, Firefox, and
  WebKit;
- the two Firefox mixed/CSS clock-continuity cases pass 20/20 under
  `--repeat-each 10` stress;
- desktop and narrow-screen visual checks were completed;
- Opus completed two general reviews, and Fable's final focused staged-diff
  review returned `looks-good` after independently reproducing the gates.

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
3. `docs/plan.md` — completed usable checkpoint, remaining public-quality
   phases, and the core animation follow-on.
4. `docs/decisions.md` — accepted owner, architecture, and implementation
   choices.
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
- selected-element animation provenance and source jumping as the next core
  increment;
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

These are planning estimates, not commitments. Re-estimate remaining
public-quality work from the checked-in MVP and its browser evidence.

## Next implementation session

Start from the working product, not from the original Phase 0 instructions:

1. Run `npm install`, `npm run validate`, and `npm run test:browser`; then use
   `npm run dev` for the local workbench.
2. Take the next code-forward animation slice: index direct CSS keyframe/SMIL
   targets for the current selection, show an animation outline, and jump to
   exact source ranges. Keep unsupported cascade/reference cases visibly
   read-only.
3. Add the missing Inspect/Interact boundary before enabling authored pointer
   events, then add pan/zoom without moving selection geometry into the SVG.
4. Expand fixtures for `use` instances, duplicate custom-property
   declarations, `var(--name, fallback)` usage, event-driven SMIL, and large
   documents. Measure before adding workers or a framework.
5. Run observed author/debugger/learner tasks before deciding the lead examples
   or starting the separate visual-first extension.

The current trust boundary is intentional: opening a new file or restoring a
draft asks before replacing dirty work; untouched downloads retain exact input
bytes; edited uniform EOL/BOM policy is preserved; edited mixed EOL becomes LF
with a visible notice.

Current limits are equally intentional: the inspection scrubber exposes a
0–10 second horizon rather than pretending to infer every indefinite or
event-driven duration; controls discover direct-root custom-property literals
and direct-root `@control` comments; animation provenance, Inspect/Interact,
pan/zoom, richer `use` instances, and direct filesystem save are not yet
implemented. Do not present the separate visual-editing extension as current
core capability.

## Decision status and owner confirmation

Already accepted from explicit owner direction:

- D001: code-forward core; visual-first editor is separate.
- D011: GodSVG benchmarks that optional extension, not the implementation/core.

Accepted by the pre-scaffold Fable architecture gate:

- D012: one exact, versioned `EditIntent` writeback path.
- D013: truthful original-byte and edited EOL/BOM policy.
- D014: validated XML DOM import into a trusted sandbox shell.
- D015: root-child comment directives for bounded controls.
- D016: document animation enumeration and Interact-implies-running clocks.

Accepted after the implementation evidence matched the proposed contracts:

- D002: source text is the only save/export authority.
- D003: CSS + SVG animation and shared inspection time; no arbitrary JS.
- D004/D005: CodeMirror/Lezer + DOMParser and structural per-version mapping.
- D006/D007: CSS custom properties; exact controls before bounded sliders.
- D008: local static TypeScript/Vite, no framework/backend initially.
- D009: the lean documentation/policy set.
- D010: versioned source-command boundary.

Root-child `@control` comments are the selected MVP metadata form. CSS custom
properties remain the only value authority; lost/invalid comments degrade to
exact inputs rather than losing document behavior.

## Evidence already gathered

- Official/current competitor and platform links are inline in the foundational
  research.
- EditSVGCode source was inspected; its current click/source mapping demonstrates
  tractability but motivates a parser-backed mapping rather than regex/tag
  occurrence matching.
- GodSVG source was inspected; its typed elements/attributes, SVG/path parsers,
  transform models, and broad selection logic show why visual parity is not a
  short increment.
- Checked-in browser contracts render CSS variables in SVG geometry and seek
  CSS + SMIL to one shared second in Chromium, Firefox, and WebKit. Clock
  continuity is also stress-checked in Firefox after Fable exposed an
  initialization race.
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
- Whether real optimizer-heavy workflows eventually justify superseding comment
  control directives with a sidecar or namespaced/data representation?
- CSS versus SMIL prevalence in real target files?
- Whether direct filesystem save belongs in the first public surface?
- After core validation, whether there is enough demand to start the optional
  visual-first extension at all?

None blocks the next code-forward slice. Record audience and workflow evidence
before changing product positioning or starting the optional extension.

## Completion definition for the next session

Land one independently useful animation-inspection increment with exact source
navigation, explicit unsupported states, fixtures in all three browser engines,
and updated decisions/handoff where the evidence changes a contract. Keep the
chat summary secondary to these files.
