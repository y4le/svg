# Current plan

## Goal

Deliver a small public-quality browser prototype that proves the code-forward
product's distinctive loop: source and rendered SVG share selection; CSS and SVG
animation run safely and can be paused/restarted/scrubbed; authored CSS
variables can be tuned through exact source-preserving controls.

The active plan ends with the code-forward workbench. GodSVG-class visual-first
editing is a separate possible extension in `docs/visual-editing-extension.md`.

## Non-goals

- A general vector drawing program; that possibility has a separate extension
  roadmap and does not expand this plan.
- A visual animation timeline; robust code-forward animation support remains
  in scope.
- Script execution, external libraries, or cloud collaboration.
- AI editing, format conversion, optimization, or automatic formatting.
- A plugin system, monorepo, backend, or design system package.

## Effort assessment

For one experienced front-end engineer, budget roughly one focused week for
the founding spikes and another four to six for the scoped public-quality MVP:
about five to seven weeks total. The largest uncertainty is not the split view;
it is the interaction among robust source mapping, preview isolation, mixed
animation clocks, and source-preserving variable edits.

| Capability                                                 | Expected effort | Why                                                                                                                                |
| ---------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App shell, CodeMirror, last-valid preview, zoom/pan, files | 4–7 days        | Established components and platform APIs; quality still needs state/recovery work                                                  |
| Bidirectional source/render selection                      | 5–10 days       | Basic mapping is easy; honest behavior for transforms, instances, malformed edits, and scale needs fixtures and fallbacks          |
| Secure CSS + SVG animation preview and controls            | 4–7 days        | Rendering is native; isolation, duration limits, provenance, and coherent seek across two clock families need browser verification |
| CSS custom-property control rail                           | 4–7 days        | Discovery is small; exact versioned source edits, units, continuous undo, and directives create the real work                      |
| Accessibility, security, performance, browser hardening    | 5–10 days       | This is core product trust, not a final cosmetic pass                                                                              |

A full timeline editor with geometry handles, keyframe manipulation,
morph/path support, and multi-format export is a separate multi-quarter
extension direction, not an MVP increment. It is not required for the core to
claim robust animation support: the core can render, control, inspect, explain,
navigate, and directly edit supported native animation source.

## Phase 0 — retire founding risks

Timebox: roughly one focused week. Build disposable or minimal integrated
spikes; keep only code that meets the intended contracts.

### 0A. Source/DOM mapping spike

- Mount CodeMirror 6 with XML/Lezer support.
- From one valid source version, collect exact element, opening-tag, attribute
  name, and attribute value ranges and align elements to a DOMParser tree.
- Diagnose a root outside `http://www.w3.org/2000/svg` explicitly; do not
  silently render namespace-less pasted XML as a blank preview or auto-fix it.
- Demonstrate code → moving preview element and preview click → opening tag.
- Exercise nested groups, same-tag siblings, namespaces, transforms, `use`,
  comments containing tag-like text, CDATA/style text, and invalid intermediate
  XML.
- Write down honest fallbacks for non-unique rendered instances.
- Define selection as an element plus an optional typed inner address, even
  though the spike only exercises element and animation/control-value targets.

Gate: no regular-expression source scanning in the mapping core; fixtures show
that structural edits either remap correctly or fail visibly.

### 0B. Secure animation spike

- Render a parsed SVG into the proposed sandbox/CSP frame.
- Run CSS animation and `animate`, `animateTransform`, and `animateMotion`.
- Implement pause/play/restart adapters for CSS/Web Animations and the SVG
  document clock.
- Seek both families to the same inspection time; exercise delays, repeats,
  fill modes, indefinite durations, and event-based starts.
- Prove explicit Inspect and Interact pointer modes: selection clicks must not
  accidentally trigger authored animation, while Interact mode must deliver
  CSS hover/click and supported SMIL event begins without weakening sandboxing.
- Verify scripts, inline handlers, links, popups, downloads, `foreignObject`
  escape attempts, and remote image/style/font loads cannot act.
- Verify the parent can query live `getBBox()`/`getScreenCTM()` geometry for a
  transformed moving selection. If opaque origin is required, prove a narrow
  measurement bridge in the spike.
- Test current Chrome, Firefox, and Safari.
- Populate the trusted sandbox shell only by `importNode()` from the validated
  XML DOM. User SVG never passes through `srcdoc` or `innerHTML` parsing.

Gate: declarative animation works; hostile fixtures produce zero execution,
network, navigation, or parent mutation. If same-origin readable sandboxing is
inconsistent, redesign around opaque origin before product work.

### 0C. Variable edit spike

- Discover literal root custom properties and exact value ranges.
- Implement one shared `EditIntent` compiler with source-version checks,
  minimal span replacement, numeric-format policy, selection result, and undo
  grouping; do not put writeback plumbing inside the variable UI.
- Render label, value, and unit; add one explicit bounded slider directive.
- Parse one canonical root-child comment form and attempt to falsify it against
  exact source ranges, malformed directives, and a default SVGO pass:
  `<!-- @control radius min=8 max=80 step=1 -->` (the bare name refers to
  `--radius`; XML comments cannot contain `--`).
- Scrub a value while source and preview update.
- Produce one undo step for a complete gesture and abort safely after a
  conflicting source edit.
- Run golden fixtures containing single quotes, multiline values, unusual
  numeric lexemes, entities, CDATA, comments, and inline CSS.

Gate: saved source changes only the chosen literal; undo restores the exact
original text; all no-edit paths preserve original bytes, including BOM and
mixed EOLs, while an edited mixed-EOL document names its normalization.

### Phase 0 decision review

At the gate, accept or revise the proposed stack and contracts in
`docs/decisions.md`. Do not continue by burying a failed security or mapping
assumption under UI work.

## Phase 1 — first complete loop

- Create the Vite/TypeScript scaffold and exact validation commands; add no UI
  framework unless the Phase 0 slice demonstrates a concrete need.
- Build the warm dark split workbench, resizable divider, top status/playback
  rail with Inspect/Interact state, and collapsible bottom rail.
- Implement open, paste/new, download, dirty state, and local crash recovery.
- Integrate versioned parsing, last-known-good preview, diagnostics, and atomic
  preview replacement.
- Preserve playback time and running/paused state across ordinary source
  updates; reserve time zero for explicit Restart.
- Land bidirectional selection, breadcrumb navigation, `use` follow/back, and
  a non-invasive moving selection overlay.
- Keep screen/user-space and CTM math in a tested geometry module rather than
  scattering it through overlay rendering.
- Land CSS + SVG animation detection, run/pause/restart, shared inspection-time
  scrubbing, and basic “what animates this selection?” source navigation.
- Include static, CSS, SMIL, mixed, and hostile examples.

Exit: a user can complete the understand/edit/animate/download loop with no
variable controls, and the source is byte-for-byte preserved outside explicit
edits.

## Phase 2 — variable instrument

- Discover supported root custom properties and classify number, length,
  angle, time, percentage, and color literals.
- Add exact typographic inputs, keyboard increments, and drag-to-scrub through
  the shared `EditIntent` compiler.
- Parse optional bounded `@control` directives and add hairline sliders.
- Coalesce gestures into one undo operation and retain source selection.
- Make `Escape`/`pointercancel` restore the original literal with no history
  entry; verify redo returns a committed final value.
- Show declaration location, usage count when cheaply knowable, and clear
  diagnostics for unsupported values/directives.
- Add parametric geometry, color, and animation-duration examples.

Exit: a user can expose three variables in ordinary SVG, tune them fluidly,
undo each gesture once, and download readable valid SVG.

## Phase 3 — authoring quality

- Add SVG element/attribute completion and concise hover reference from one
  checked-in typed schema registry whose records include value type, units,
  applicable elements, and animation status.
- Add keyboard command discovery and focus movement between source, preview,
  breadcrumb, playback, and controls.
- Add inspect-mode affordances for overlapping elements and parent climbing.
- Add parser, capability, stale-preview, and disabled-script diagnostics.
- Complete reduced-motion, focus, contrast, screen-reader, and touch-target
  checks.
- Add optional direct filesystem save where supported without weakening the
  download path.

Exit: the workbench feels like a coherent instrument rather than a proof.

## Phase 4 — hardening and validation

- Measure the 100 KB/1,000-element and 500 KB/5,000-element fixtures and move
  parse/mapping work off the main thread only if measurement justifies it.
- Run cross-browser animation, selection, file, persistence, security, and
  accessibility suites.
- Conduct five to eight observed target-user tasks; record failure points and
  whether the lead audience is authors, debuggers, or learners.
- Tighten onboarding/examples and public positioning from evidence.
- Produce a static deploy and verify offline/local behavior.

Exit: security and source fidelity have automated evidence, core tasks work in
the supported browsers, and at least five target users can complete the main
loop.

## MVP acceptance checklist

- [ ] Source, not preview DOM, is the only saved/exported authority.
- [ ] Opening, inspecting, playing, seeking, and exporting without a source
      edit is byte-identical on hostile-format fixtures, including BOM/CRLF.
- [ ] Edits preserve uniform original EOL/BOM policy; mixed EOL normalization
      is visible before the first edit and deterministic afterward.
- [ ] Invalid XML retains a labeled last-valid preview and useful diagnostic.
- [ ] Empty, cold-invalid, warm-stale, and valid-but-blank states are distinct
      and teach the user what happened.
- [ ] Source → preview and preview → source work for the supported fixture
      matrix, with documented instance fallbacks.
- [ ] CSS and SVG animation run, pause, and restart.
- [ ] Ordinary edits preserve playback time/state; only Restart returns to zero.
- [ ] Supported CSS and SVG animation seek to a shared inspection time; timing
      cases outside the contract are identified rather than misrepresented.
- [ ] Reduced-motion preference begins preview motion paused.
- [ ] Scripts, handlers, navigation, and remote loads are blocked and reported.
- [ ] Root custom properties edit exact literals; bounded directives create
      sliders; a gesture is one undo step.
- [ ] Version-stale edit intents refuse to write, and numeric scrubbing does
      not accumulate floating-point noise.
- [ ] Open/paste/download/recovery work without an account or server.
- [ ] Recovery is offered with timestamp/discard and never silently applied.
- [ ] Keyboard and visible-focus paths cover the primary loop.
- [ ] Chrome, Firefox, and Safari pass the core browser contract.
- [ ] Performance fixtures meet measured budgets or display a documented size
      limit instead of degrading silently.

## Core follow-on — animation depth

This remains code-forward and begins only after the MVP is validated. It does
not add a canvas tool palette or visual timeline.

- Expand the animation index from direct cases to selector/cascade-aware CSS
  provenance and SMIL target/reference chains.
- Add a navigable animation outline organized by target, property, and source
  family; selecting a record reveals both target and declaration.
- Add exact source-backed controls for supported durations, delays, repeats,
  fill modes, easing/key splines, and literal keyframe values.
- Add commands that insert common CSS or SMIL animation skeletons at an
  explicit source location, then leave the user in code.
- Explain current, underlying, and composed values at the inspection time when
  browser APIs and source analysis can support the distinction honestly.
- Diagnose indefinite/event-driven timelines, incompatible path-morph values,
  unsupported selectors, and script-driven motion instead of flattening them.
- Add timing, cascade, restart, and seek fixtures until CSS/SMIL behavior is
  trustworthy across supported browsers.

Exit: an author can find every supported animation affecting a selection,
inspect it at a chosen time, change its common timing/value fields without
losing source context, and understand why unsupported motion is read-only.

If observed work demands spatial handles or a track timeline after this, start
the separate visual editing extension rather than folding those systems into
the core workbench.

## Practices to add only when earned

- Move `docs/plan.md` into `docs/plans/` when a second active substantial plan
  exists.
- Split `docs/decisions.md` into ADR files when the log is no longer quickly
  scannable or individual decisions need independent supersession.
- Add checked-in issues when more than a small handful of active work items or
  parallel owners make the plan ambiguous.
- Add review snapshots when a review has durable findings that cannot be
  represented by a design update, decision, test, or commit body.
- Add a dedicated code-standards doc only when real repeated mistakes outgrow
  the invariants in `AGENTS.md`.
