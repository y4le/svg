# Optional visual editing extension

## Status and boundary

This is a possible extension on top of the code-forward workbench, not the
current product plan. GodSVG is the capability benchmark. Starting this track
requires explicit owner direction after the core loop has user evidence.

The extension consumes four core contracts: immutable source versions, exact
semantic ranges, shared selection identity, and version-checked CodeMirror
transactions. It owns its visual-first UI and deeper typed projections. Source
remains the only save/export authority.

## Why it is separate

A GodSVG-class editor is a multi-quarter product surface, not a small follow-up
to split preview. Element schemas, coordinate spaces, transforms, paint servers,
path grammar, multi-selection, snapping, and source-preserving structural edits
each create independent systems. Combining them with the core roadmap would
delay the differentiated animation/source instrument and make its interface
less quiet.

The extension should be independently enabled and removable. The core must
remain excellent without an element tree, handles, tool palette, or timeline.

GodSVG's implementation is instructive but its persistence tradeoff is not the
one chosen here: the inspected repository parses into a typed element/attribute
tree and serializes through its formatter. This extension instead preserves a
free text buffer and compiles every visual operation into verified minimal text
edits. Matching GodSVG's interaction class under that constraint is harder than
matching its visible controls.

Rough order of magnitude: a useful inspector/scalar-editing slice is measured
in weeks after a mature core; credible geometry and path editing plus hardening
is measured in months; GodSVG-class breadth with visual animation is a
multi-quarter program. Every rung therefore has its own evidence gate.

## Capability ladder

### V0 — extension contract spike

- Prove one scalar attribute edit, one element insertion/reorder, and one SMIL
  timing edit through versioned source commands.
- Reparse after every command; preserve unknown syntax and surrounding bytes.
- Decide how the extension reports edits that require normalization.
- Verify the core selection's optional inner address can target an attribute
  token without changing the selection protocol.

Exit: the extension can be removed without changing core behavior or storage.

### V1 — read-only inspector

- List authored attributes from the shared schema with raw fallback.
- Reveal the exact name/value source range from every row.
- Show authored, computed, and animated values distinctly where knowable.
- Navigate winning CSS declarations/custom properties instead of pretending an
  inline attribute owns the style.

Exit: attribute-level source provenance survives real files before any broad
visual writeback is offered.

### V2 — scalar writeback

- Exact inputs and scrubbing for common number, color, enum, and transform
  values through the core `EditIntent` compiler.
- Edit the authored winning declaration; navigate shared CSS or variables rather
  than silently forking an inline style.
- Mark normalizing or ambiguous edits read-only.

Exit: every supported scalar operation changes only asserted spans and shares
typing/gesture undo.

### V3 — direct geometry

- Move, resize, rotate, pivot, and transform handles.
- Shape-specific handles for rect, circle, ellipse, line, polygon, and
  polyline.
- Snapping, coordinate-space evidence, and authored-versus-computed values.
- Minimal, reviewable source patches for every operation.
- Never introduce a transform the author did not choose merely to make a drag
  succeed; offer an explicit conversion when the authored representation cannot
  express the gesture.

### V4 — path and paint systems

- Path-command and subpath selection.
- Node/control-point editing, command insertion/conversion, close/reverse, and
  shape-to-path conversion.
- Gradient handles and reference-aware `defs` navigation.
- Explicit preserve-or-normalize policy for transforms and relative commands.

This is expected to be the longest and riskiest rung. Relative commands,
shorthand control reflection, arcs, implicit repetition, and closed-subpath
semantics each constrain which gestures can be lossless.

### V5 — structural document editing

- Element tree with add, delete, duplicate, reorder, group, and ungroup.
- Local indentation/quote/self-closing inference for new markup only.
- Multi-selection semantics shared by tree, code, and viewport.
- Fill, stroke, gradients, transforms, IDs, and reference-aware `defs`
  operations.

### V6 — visual animation authoring

- Target/property/track index spanning CSS keyframes and SVG animation
  elements.
- Timeline selection synchronized with source, tree, and viewport.
- Add/move/delete keyframes, timing, repeats, fill, delays, and easing through
  family-specific source adapters.
- Live handles at the inspection time and motion-path editing.
- Later path-morph compatibility diagnostics, states/triggers, and previewable
  conversion tools.

Sequence within the rung: edit existing SMIL fields through V2 machinery;
capture the current inspection value into explicit source; add a read-only
timeline projection; make timeline gestures writable only after those paths
show demand. CSS keyframe writeback waits for a lossless CSS syntax layer.

The timeline is never the save format. It is a partial projection of CSS/SMIL
source and becomes read-only where a safe edit cannot be expressed.

## Extension architecture

Add only when this track starts:

- a version-bound typed `DocumentProjection` for elements, attributes,
  references, geometry, paths, paint, and animation tracks;
- structural source commands that move exact slices and synthesize only new
  markup;
- family-specific geometry/path/animation adapters;
- an independent visual workspace mode that imports core selection and emits
  core transactions.

Never patch the projection in place after an edit; rederive it from the new
source version. Separate lossless commands from normalizing commands. Tests
cover emitted source, rendering, selection restoration, and one-step undo as a
single contract.

## Deceptively hard areas

- `use`, markers, masks, clips, patterns, filters, and paint-server ownership;
- nested transforms and choosing between editing geometry versus transforms;
- path shorthand, relative commands, arcs, subpaths, and topology-preserving
  morphs;
- preserving comments/formatting through insert, move, group, and ungroup;
- multi-selection across coordinate spaces;
- CSS cascade/selector provenance and writable animation tracks;
- editing a base geometry/style value while animation visibly overrides it;
- snapping that remains predictable under zoom, transforms, and animation.

## Explicitly not implied

This extension does not authorize freehand illustration breadth, arbitrary
JavaScript animation, cloud collaboration, proprietary scene state, or format
conversion. Those require independent evidence and decisions.
