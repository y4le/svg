# Fable collaboration record — 2026-08-04

## Purpose

The foundational research and planning were developed in parallel with Fable
through Parley, as requested. This note preserves the collaboration outcome so
a future session does not depend on chat history or raw agent transcripts.

Parley session: `ses_e3771af5d314d4f0`

Turns:

1. `svg-foundation-fable-research-20260804` — independent competitive,
   technical, architecture, and documentation-policy research.
2. `svg-godsvg-northstar-fable-20260804` — skeptical planning pass after
   GodSVG was named as the visual capability benchmark.
3. `svg-docs-final-fable-review-20260804` — final contradiction and fresh-start
   audit after the owner separated the visual extension from the core.

The raw event trail remains in `.parley/events.jsonl`. This document is the
durable synthesis, not a verbatim transcript.

## Where the parallel work agreed

Both the primary research and Fable independently converged on:

- the source text buffer as the sole save/export authority;
- CodeMirror 6 and Lezer XML ranges for code ownership and navigation;
- native `DOMParser` plus a last-known-good preview during invalid edits;
- CSS animation and SVG animation elements as the safe first animation
  families, with arbitrary JavaScript excluded;
- one playback surface implemented through CSS/Web Animations and SVG document
  clock adapters;
- CSS custom properties as the first variable substrate;
- exact, versioned source edits with one undo group per scrub gesture;
- a static local-first TypeScript/Vite application, initially without a UI
  framework or backend;
- selection and animation provenance as the common spine of the interface;
- GodSVG as the closest structured-editing reference and Figma Motion as a
  reason to take motion/developer handoff expectations seriously;
- a lean documentation set rather than issue/ADR/review ceremony before the
  project has concurrent workstreams.

## Material contributions retained

### Animation provenance

Playback alone is not enough. For the selected element, the workbench should
answer “what is animating this, from where, and at what value now?” Supported
CSS declarations/keyframes and SMIL elements retain source ranges and navigation.

### Shared inspection time

A truthful scrubber is feasible by setting the SVG document clock and the
`currentTime` of CSS/Web Animation objects. The limitation is duration/horizon
inference for indefinite, event-driven, delayed, and mixed documents. The UI
must state that limit rather than invent a clean timeline.

### One edit-intent path

The variable feature should not own private writeback code. A shared
version-checked `EditIntent` compiler receives the semantic target and value,
emits minimal CodeMirror changes, applies numeric-format policy, returns the
selection, and coalesces undo. Supported animation fields use the same path.

### Exact subranges and extensible selection

The XML index records every authored element plus exact attribute name/value
ranges. Value micro-parsers are added only when a core feature needs them. A
selection may optionally carry a typed inner address so variable or animation
values can participate without replacing the element-level identity.

### Geometry-readable isolation

The selection overlay already needs live rendered geometry. Phase 0 therefore
tests `getBBox()`, `getScreenCTM()`, and coordinate conversion through the same
sandbox that blocks scripts/network/navigation. If an opaque origin is needed,
the spike must prove a narrow measurement bridge rather than defer the boundary.

### Mechanical source trust

No-edit open/inspect/play/seek/export is byte-identical. Golden fixtures cover
BOM/EOL policy, odd numeric forms, whitespace, quote styles, entities, CDATA,
comments, and inline CSS. Numeric edits prevent floating-point noise and change
only asserted spans. Trust is enforced by tests rather than intention.

## Disagreements and how they resolved

### Core versus visual-first roadmap

The owner's final direction governs: the product core stays code-forward. A
GodSVG-class visual-first surface is documented separately as a possible
extension. Fable's second memo usefully argued that such an extension should
reuse exact ranges, edit intents, selection, and geometry access, but it does
not justify building a path parser, tree, handles, or timeline in the core.

### GodSVG parity

GodSVG's interaction surface is the benchmark, not its implementation or
persistence model. Its repository uses typed element/attribute structures and
formatter-driven serialization. This project retains free text and minimal
edits, making equivalent visual writeback harder and occasionally requiring an
honest refusal or explicit normalizing conversion.

### UI framework

The initial primary draft considered React. Fable recommended vanilla
TypeScript because CodeMirror, the preview iframe, and animation clocks are
already imperative owners. The proposal now starts without a UI framework and
adds one only after measured state/component pressure.

### Control metadata

Fable initially preferred a namespaced root schema; the initial proposal
preferred readable comments. The implementation architecture gate resolved the
choice in favor of one root-child comment schema because independent readable
directives fit the hand-authoring workflow and optimizer loss degrades only the
slider bounds. CSS custom properties remain the only value authority.

### Click-to-source novelty

An early Fable claim understated existing support. EditSVGCode currently ships
and open-sources click-to-source. The final positioning therefore does not
claim novelty for selection alone; it claims a coherent source/selection/
animation/variables loop.

### Presentation-attribute variables

Fable was cautious about CSS custom properties in presentation attributes. A
local browser probe rendered `r="var(--r)"` in the current Chromium, Firefox,
and WebKit versions. That result supports a checked-in compatibility fixture,
not a timeless blanket claim.

## Owner clarifications captured

1. Animation is a foundational requirement, not a later embellishment.
2. GodSVG is substantially ahead and is the quality/capability reference for a
   possible visual-first endpoint.
3. The visual-first editing roadmap must remain a separate optional extension
   on top of the code-forward display.
4. The deliverable for this session is a durable collaborative research,
   proposal, informational, and handoff document set—not product code.

## Final review outcome

Fable's final reviewer gave the documentation set a **ship** verdict and found
the core/extension boundary consistent. Four actionable findings were folded
in before handoff:

- D001 and D011 were changed from proposed to accepted because they quote
  explicit owner direction;
- the handoff now starts implementation by initializing Git, since the current
  directory has no repository history yet;
- Inspect and Interact preview modes now separate source-selection clicks from
  CSS/SMIL pointer-triggered animation;
- CSS↔SMIL conversion is explicitly outside the core and, if ever built, lives
  as a previewed V6 extension command.

## Implementation architecture gate

Before scaffold work, Fable ran a further high-risk gate over the source index,
edit-intent history, sandbox, mixed animation clocks, provenance, directives,
and browser fixture matrix. The retained corrections were:

- file transport explicitly preserves unedited bytes and uniform EOL/BOM while
  visibly normalizing mixed EOL after an edit;
- preview SVG is imported from the validated XML DOM into a trusted static
  sandbox shell, never reparsed through HTML `srcdoc`/`innerHTML`;
- the source/preview map uses verified preorder ordinals plus parent-owned weak
  maps, with no observable preview attributes;
- `Document.getAnimations()` drives whole-preview CSS/WAAPI enumeration and
  entering Interact mode resumes CSS/SMIL clocks;
- missing SVG namespace is a dedicated diagnostic rather than a blank preview;
- root-child `@control` comments are the only bounded-control metadata form;
- the `EditIntent` compiler owns stale-version refusal, minimal spans, numeric
  formatting, and a deterministic one-undo gesture protocol.

These are captured as D013–D016 and in the updated design/plan. The gate kept
path parsers, visual handles, tree editing, and a writable timeline outside the
core.

## Resulting document changes

- `docs/research/2026-08-04-foundational.md` holds shared external/local
  research and effort findings.
- `docs/design.md` specifies the code-forward core and its small extension seam.
- `docs/plan.md` sequences the core MVP and later code-forward animation depth.
- `docs/visual-editing-extension.md` isolates GodSVG-class visual editing.
- `docs/decisions.md` distinguishes proposed recommendations from the two
  boundaries explicitly accepted by the owner.
- `docs/handoff.md` is the entry point for the next implementation session.
