# Foundational research — 2026-08-04

## Question

Is there a useful opening for a side-by-side SVG source editor, and what is the
smallest credible architecture for animation, source/render navigation, and
variable controls?

The user named `~/dev/txttop`; that directory does not exist. `~/dev/txtop`
is the matching local project and is the repository surveyed here.

This is decision-oriented product research, not an exhaustive market census.
Competitor capabilities come primarily from current product pages and project
repositories and should be verified hands-on before a public positioning
claim.

## Executive finding

The bare concept is not differentiated. Live split preview is common, and
click-to-source already ships in at least one direct web competitor and a VS
Code extension. Visual animation timelines and parametric slider systems are
also established in adjacent products.

The owner subsequently named GodSVG as the desired endpoint for a possible
visual-first extension, then clarified that this extension must remain
separate and sit on top of the code-forward display. The defensible core thesis
is therefore:

> A local, code-forward SVG workbench that makes native animation,
> rendered-element inspection, and tunable variables unusually legible and
> reversible in ordinary SVG source.

That aims at developers, design engineers, icon/motion authors, educators, and
people debugging generated SVG. A GodSVG-class visual editing surface is a
separate extension opportunity, not the core roadmap.

## Competitive landscape

| Product | Center of gravity | Overlap | Opening left for this project |
| --- | --- | --- | --- |
| [GodSVG](https://github.com/MewPurPur/GodSVG) | Active structured SVG editor that edits code directly, adds no metadata, and keeps UI/code changes synchronized | It is both the closest competitor and the benchmark for a possible element, inspector, geometry, and path extension | Keep the core code-forward; if the separate extension is pursued, target its structured-editing class while reusing deeper CSS/SMIL provenance and controls |
| [EditSVGCode](https://editsvgcode.com/features) | Monaco-based SVG code editor with schema completion, live preview, click-to-source, cloud files, and optional AI | It already has the basic split view, transformed-element selection, and a bounding highlight | Make linking bidirectional and parser-backed; make animation and variables first-class; remain local-first and quieter |
| [Visual SVG Editor for VS Code](https://marketplace.visualstudio.com/items?itemName=barbozaa.visual-svg-editor) | IDE extension with live preview, element tree, selection, attribute inspector, optimization, and JSX conversion | Strong code/visual inspection inside an existing editor | A focused browser instrument can have a better preview clock, control surface, portability story, and lower chrome |
| [SVG Editor](https://www.svgeditor.co.uk/) | Free local-first PWA with drawing tools, CodeMirror, two-way code/canvas sync, layers, properties, and sanitization | Broad visual editing, offline storage, and ordinary SVG import/export | Do not compete on drawing breadth; specialize in authored code, animation, inspection, and parameter tuning |
| [SVG Visualize](https://www.svgvisualize.com/) | Lightweight web code/visual editor with bidirectional canvas changes | Validates that simple split preview is a commodity | Win on precision, trust, animation, and source-range fidelity rather than feature count |
| [SVGEdit](https://github.com/svg-edit/svgedit) | Mature open-source visual drawing editor and embeddable SVG canvas | Deep conventional vector-editor surface | Reusing it would pull the product toward a canvas model; it is better treated as prior art than a foundation |
| [SVGator](https://www.svgator.com/help/export-and-file-formats/what-export-options-are-available) | Commercial visual animation authoring and multi-format export | Sophisticated animation, triggers, speed, direction, and playback options | Preserve hand-authored source and avoid generated runtime/project lock-in; serve code readers rather than no-code motion designers |
| [Figma Motion](https://www.figma.com/blog/introducing-figma-motion/) | New 2026 design-canvas timeline with variables, Dev Mode inspection, code handoff, MCP, and animated SVG/video export | It raises baseline expectations for timeline polish, variables, and developer handoff | Do not compete with its canvas/team system; own faithful re-opening, debugging, and surgical editing of ordinary SVG source |
| [CSSVG](https://cssvg.com/) | Focused icon animation timeline exporting CSS, SMIL, and JSX | Native-runtime animation, play/pause/scrub, keyframes, easing | Do not build a timeline first; make existing CSS/SMIL source understandable and controllable |
| [AnimGraphLab](https://animgraphlab.com/) | Procedural node graph with parameters, expressions, sliders, animation, and state machines | The strongest adjacent proof that parametric SVG controls are useful | Keep the mechanism in readable CSS/SVG source rather than a node graph and embedded runtime |
| [slideVars](https://codepen.github.io/slideVars/) | Automatic UI controls for CSS custom properties | Direct precedent for detecting units, colors, inferred ranges, and configured sliders | Integrate controls with exact SVG source ranges, selection, undo, and portable authoring conventions |

Rive and Lottie-class tools are relevant substitutes for motion design, but
their native project/runtime models are not ordinary editable SVG. Rive's SVG
animation export is an SVG frame sequence rather than a source-preserving SVG
animation workflow ([Rive export docs](https://rive.app/docs/editor/exporting/exporting-for-video-and-static-design)).

### GodSVG as the optional-extension benchmark

GodSVG is not merely a split preview. Its current public workflow includes an
element tree, attribute-linked inspector fields, adding/removing/reordering
elements, viewport geometry manipulation, multi-selection, transforms, and a
specialized path-command/subpath editor. Its repository contains typed element
and attribute classes, SVG and path-data parsers, transform models, and a large
selection/geometry command surface. That is evidence of the real complexity
behind the polished interaction, not a prescription to port its Godot
architecture.

The relevant extension target is the class of capability:

1. code/render navigation and faithful preview;
2. structured element tree and attribute editing;
3. direct shape, transform, and multi-selection manipulation;
4. command-aware path editing;
5. robust animation inspection and visual authoring that round-trips to CSS
   and SVG animation source.

The extension should diverge deliberately in two places: retain the core's free
text buffer as the sole authority, and reuse its animation provenance rather
than introduce a separate project model. GodSVG demonstrates that the extension
is a serious editor-sized undertaking: the inspected 2026 repository has
roughly 185 GDScript source files and distinct models for elements, typed
attributes, transforms, and path commands. It belongs in a separate
multi-quarter roadmap and must not inflate the opening workbench.

### Product conclusion

No individual proposed feature is a moat. The core workflow needs a strong
stance:

- source is always visible and authoritative;
- one selection spans the code and image;
- animation is a property of the document being inspected, not decorative app
  motion;
- variables turn code into a small instrument without introducing a project
  graph or template language;
- the file stays useful after the editor disappears.

If the visual extension is pursued, each operation should remain an
intelligible source edit and any timeline should remain a projection of
CSS/SMIL, not a proprietary project graph.

This is an inference from the surveyed products, not proof of demand. The
first validation should be five to eight task interviews or observed trials
with people who currently hand-edit animated SVG, followed by a narrow public
prototype.

## Animation research

SVG supports two dependency-free declarative animation families that matter
for the first release:

1. CSS animations/transitions inside the SVG.
2. SVG animation elements (`animate`, `animateTransform`, `animateMotion`, and
   `set`), commonly called SMIL animation.

The SVG `<animate>` element is broadly available in modern browsers, and SVG's
own DOM exposes a document clock with pause, resume, current-time, and
set-current-time operations ([MDN `<animate>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/animate),
[MDN `SVGSVGElement`](https://developer.mozilla.org/en-US/docs/Web/API/SVGSVGElement)).
CSS animations, CSS transitions, and Web Animations can be enumerated and
controlled through `Element.getAnimations({subtree: true})`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations)).

These are different clocks. A truthful MVP can offer run/pause/restart across
both. A unified inspection scrubber is also feasible with two adapters: set the
SVG document clock for SMIL and set `currentTime` on the CSS/Web Animation
objects. The hard part is not seeking; it is choosing an honest horizon for
indefinite duration, event-triggered begins, delays, and mixed documents.
Reloading the isolated preview remains the reliable common restart operation.

JavaScript-driven animation is a different security product. SVG can contain
scripts and event handlers, but running arbitrary file code while retaining
parent-page inspection creates an avoidable trust boundary. The SVG 2
processing model itself distinguishes a secure animated mode: declarative
animation on, scripts and external resources off
([W3C SVG 2 conformance](https://www.w3.org/TR/SVG2/conform.html#secure-animated-mode)).
That is the right default for this editor. An explicitly unsafe, opaque-origin
script lab can be explored later.

### Recommended animation boundary

MVP:

- render CSS animation and SVG animation elements;
- show play/pause and restart in stable positions;
- show which animation families were detected;
- provide a shared time scrubber over both adapters when the duration or an
  explicit inspection horizon is known;
- show which animation declaration drives the selected element and jump to it
  for direct SMIL children and supported CSS keyframes;
- begin paused when the user's reduced-motion preference requires it;
- preserve all animation source exactly.

Defer:

- arbitrary JavaScript execution;
- external animation libraries and network imports;
- a generated keyframe timeline;
- morph normalization and a visual easing editor;
- Lottie, JSX, video, or sprite-sequence export.

## Source ↔ rendered-element navigation

### Feasibility verdict

Useful bidirectional jumping is medium difficulty and should be a founding
spike, not a late polish task.

- A convincing happy path for ordinary nested SVG is a few engineering days.
- Production behavior across malformed edits, namespaces, transforms,
  animation, `use`, overlapping elements, `pointer-events="none"`, and large
  files is roughly one to two focused engineer-weeks.
- A promise that every visible pixel maps to one unique source element is not
  achievable. Repeated `use` instances, markers, patterns, masks, filters, and
  browser-generated instance trees do not always have a unique authored node.

One direct competitor proves the basic interaction is tractable. Its open
source implementation maps DOM order and tag occurrences with regular
expressions, then uses structural XPath for the reverse direction
([EditSVGCode source](https://github.com/nbelyh/editsvgcode)). That is a useful
baseline, but a new editor can avoid its fragile class of edge cases by using
the editor parser's exact node ranges.

### Recommended mapping design

Use one source string and two derived structures:

```text
CodeMirror document
    ├── Lezer XML tree ── authored element ranges / cursor ownership
    └── DOMParser ─────── validated XML DOM ── isolated rendered preview
                \\________ parallel preorder map ________/

editor selection  <──── one selection identity ────>  preview element
```

The `@codemirror/lang-xml` package provides XML language support backed by a
Lezer parser, while Lezer nodes retain source positions
([package docs](https://www.npmjs.com/package/%40codemirror/lang-xml),
[Lezer reference](https://lezer.codemirror.net/docs/ref/)). On each valid
document version:

1. Collect authored element nodes and their exact `from..to` ranges from the
   Lezer tree.
2. Parse the same text as `image/svg+xml`; reject `<parsererror>` and keep the
   last-known-good preview while the user is between valid states.
3. Walk authored nodes and DOM elements in preorder, checking expanded names
   and structure; produce range-to-element and element-to-range maps.
4. On code cursor movement, resolve the deepest enclosing authored element and
   highlight its rendered bounds.
5. On preview click, use the composed event path to find the deepest mapped
   authored element, reveal its opening tag, and show a textual ancestor
   breadcrumb.
6. Never write mapping IDs into the user's source. Ephemeral attributes or
   weak maps may exist only in the preview DOM.

### Honest fallbacks

- A click on a `use` instance selects the authored `use`; a follow-reference
  action can separately jump to the referenced definition.
- A generated marker, pattern tile, mask result, or filter result selects the
  nearest authored owner, not an imaginary node.
- Alt/Shift-click can climb to a parent group; a later repeated click can cycle
  overlapping hit candidates.
- An element that cannot receive pointer events remains reachable from source
  and a future element outline/tree, even if direct click does not find it.
- While source is invalid, keep the last valid preview visibly stale and show
  the parser error. Never render a half-parsed replacement silently.

### Selection rendering

Draw the selection in an HTML overlay rather than adding a filter or stroke to
the SVG being evaluated. This avoids changing filter composition, layout, and
the authored image. Track `getBoundingClientRect()` on animation frames only
while a selected element is moving or the document is playing.

## Variable controls and sliders

CSS custom properties are the best first variable substrate. They are valid,
portable CSS, inherit naturally, work with `var()`, and can feed SVG
presentation and geometry properties because those attributes have CSS
counterparts ([MDN custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties),
[MDN SVG attributes](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute)).
They do not substitute into element names, selectors, arbitrary XML syntax, or
every non-CSS SVG attribute, so they are a powerful subset rather than a
general template language.

Recommended v1 convention:

```svg
<svg
  viewBox="0 0 200 200"
  style="--radius: 32px; --period: 1.8s; --ink: #c1432e"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- @control --radius min=8 max=80 step=1 unit=px -->
  <style>
    .pulse { r: var(--radius); fill: var(--ink); animation: pulse var(--period) infinite; }
  </style>
  <!-- ... -->
</svg>
```

- Discover literal custom properties on the root `style` attribute first.
- Show every numeric value as monospaced editable type with drag-to-scrub.
- Show a thin slider only when an explicit bounded `@control` directive is
  present; never invent a meaningful min/max silently.
- Derive labels from the variable name, show units, and display the source
  declaration on focus.
- Treat colors as compact swatches plus exact text, not three generic sliders.
- Update the exact declaration range through a CodeMirror transaction and
  coalesce a continuous scrub into one undo step.
- Treat directives as optional comments: the SVG stays valid and behaves
  normally without this editor. Warn that optimizers may strip comments.

Later work may discover declarations in `<style>` blocks, use CSS `@property`
metadata for types, or support a sidecar manifest when teams need durable
labels/ranges without comments. The founding spike should compare readable
comment directives with a root foreign-namespace or `data-*` control schema;
the latter is more machine-structured, while the former is substantially
cleaner for hand authors. Do not introduce `{{template}}` placeholders into
SVG source in the MVP; invalid intermediate SVG and a private expression
language would undermine the product promise.

### UX verdict on sliders

Sliders are valuable for bounded perceptual tuning—radius, opacity, blur,
rotation, duration, amplitude—not as the universal face of numeric values.
Yale's design language prefers typographic direct manipulation. The control
rail should therefore lead with label, exact value, and unit; scrubbing is the
default, and a hairline slider appears only when its range carries meaning.

## Preview security

`DOMParser.parseFromString()` accepts SVG/XML but parsed content becomes
dangerous when inserted into an active DOM; MDN classifies parsing/insertion
APIs as injection-sensitive and recommends explicit sanitization policies
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString)).

The proposed preview uses a same-origin-readable iframe with scripting still
disabled: `sandbox="allow-same-origin"`, never `allow-scripts`. The HTML
standard specifically identifies this combination as a way to disable script
while retaining parent access to the embedded DOM
([WHATWG HTML](https://html.spec.whatwg.org/multipage/browsers.html#relaxing-the-same-origin-restriction)).
Inside the frame, a restrictive Content Security Policy should block all
network fetches and allow only inline style plus `data:`/`blob:` assets that
the product explicitly supports. Navigation, forms, popups, and downloads
remain sandboxed.

The spike must verify this behavior in current Chrome, Firefox, and Safari.
If browser behavior makes same-origin inspection unsafe or inconsistent, use
an opaque-origin iframe and a narrowly injected postMessage bridge rather than
weakening the sandbox.

## Local documentation and policy survey

| Project | What works | Cost / lesson |
| --- | --- | --- |
| `txtop` | A single concise `AGENTS.md` captures intent, hard constraints, scope, architecture, UX, tests, and non-goals. `docs/README.md` is task-oriented. Goals and success criteria are explicit. | Some intent repeats across `AGENTS.md`, `goals.md`, and README. The best parts can fit in fewer files here. |
| `metrainome` | Excellent cold-start ordering, authoritative topic docs, durable consult/review outcomes, browser behavior as architecture, and a clear artifact taxonomy. | Per-chunk briefs, separate issues/plans/decisions/reviews, indexes, frontmatter, and mandatory consult/review cadence are high ceremony for a one-person project before code exists. |
| `countrain` | One strong design doc moves from positioning and principles through architecture, data model, and phases. A compact chronological decision log is easy to scan. Research is separated from the synthesized design. | Its design doc is long and can become a mixed source of present behavior and future roadmap unless actively edited. It also lacks the strong cold-start policy of the other two. |

### Simplest high-leverage practice set

Keep:

- one short `AGENTS.md` with cold start, invariants, boundaries, and validation;
- one `docs/README.md` declaring authority and linking the working set;
- one living `docs/design.md` for product and architecture;
- one current `docs/plan.md` with goal, non-goals, gates, and work sequence;
- one compact `docs/decisions.md` for choices whose rationale must persist;
- dated research notes, with durable conclusions folded into design;
- targeted tests plus explicit browser/security fixtures;
- collaboration on genuinely high-risk work, with the outcome persisted.

Leave for later:

- mandatory issue files for every task;
- a chunk brief for every nontrivial edit;
- one ADR file per choice and merge-time ID allocation;
- append-only review snapshots or review receipts;
- mandatory second-agent consult and review for every commit;
- duplicate `CLAUDE.md`, code-standards docs, and workflow prose;
- indexes for folders that contain only a handful of files.

Promotion rule: add structure only when the current structure loses a real
coordination signal. Examples are multiple simultaneous plans, more than a
handful of active contributors/workstreams, or a decision log that is no
longer quickly scannable.

## Research-driven risks to retire first

1. **Mapping fidelity:** prove parser range ↔ preview element mapping on nested
   groups, namespaces, transforms, `use`, `foreignObject`, styles, and invalid
   intermediate source.
2. **Secure animation:** prove CSS and SVG animation run while script,
   navigation, event handlers, and network requests do not.
3. **Mixed animation control:** verify pause/restart and identify the honest
   limit of seeking when CSS and SMIL coexist.
4. **Source-preserving controls:** prove continuous variable edits touch only
   the literal value and produce one undo step.
5. **Scale:** measure parsing, mapping, render, and moving-selection overlay on
   representative 100 KB/1,000-element and 500 KB/5,000-element fixtures.

## Collaboration with Fable

Fable ran an independent Parley research/planning turn while the primary
research and local-project survey proceeded. Its memo agreed on the central
decisions: text as the only authority, CodeMirror/Lezer ranges, last-good
preview, CSS + SVG animation rather than JavaScript, CSS custom properties,
source-preserving scrubbing, local/static delivery, and the Yale linking accent.

It materially improved this synthesis in four places:

- GodSVG is a closer strategic competitor than the initial survey recognized;
- Figma Motion's 2026 animated-SVG export means visual timeline/export is now a
  platform baseline, not open territory;
- animation provenance—“what declaration is driving this selected element
  now?”—is a stronger differentiator than generic playback controls;
- a shared CSS/SMIL scrubber is feasible as two playback adapters even though
  duration inference and event-based timing still need explicit limits.

The collaboration also exposed useful disagreement:

- Fable recommended vanilla TypeScript; the initial draft proposed React. The
  revised recommendation starts with vanilla TypeScript because CodeMirror,
  the iframe, and playback are already imperative owners. Add a UI framework
  only after the vertical slice demonstrates concrete component/state pressure.
- Fable preferred a namespaced root attribute for slider schemas; the initial
  draft preferred readable comments. The plan keeps values in standard CSS
  variables and makes metadata representation a Phase 0 preservation/usability
  decision rather than pretending the tradeoff is settled.
- Fable cautioned that `var()` in presentation attributes was not portable. A
  local 2026 browser probe rendered `r="var(--r)"` correctly in current
  Chromium, Firefox, and WebKit, and a second probe successfully sought CSS and
  SMIL animations to the same 1-second position in all three. These probes
  support the architecture but become checked-in regression fixtures; they do
  not replace published compatibility guarantees.

Fable's broad claim that current tools lack click-to-source was not retained:
EditSVGCode currently advertises and open-sources that feature. This is why the
positioning here claims an integrated animation-time/source workflow rather
than novelty for selection alone.
