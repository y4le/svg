# svg

A code-forward SVG workbench: source on one side, the rendered document on the
other, with one selection shared between them.

The core product keeps code primary while making the rendered document,
animation, and variables directly inspectable. A separate optional visual
editing extension is benchmarked against GodSVG, but it builds on the
code-forward core rather than redefining it. The intended edge is not merely
live preview:

- edit ordinary SVG source without a proprietary project format;
- jump from source to the rendered element and back;
- run, pause, seek, inspect, and eventually author native CSS and SVG
  animations;
- expose authored CSS custom properties as direct numeric controls and,
  where a bounded range is declared, sliders;
- leave a clean extension seam for element/attribute editing, geometry, paths,
  and a source-backed visual timeline;
- keep files local and treat previewed SVG as untrusted content.

Start with [the docs index](docs/README.md). The current recommendation is in
[the design](docs/design.md), the evidence behind it is in
[foundational research](docs/research/2026-08-04-foundational.md), and the
proposed delivery sequence is in [the plan](docs/plan.md). The optional
GodSVG-class expansion is isolated in the
[visual editing extension](docs/visual-editing-extension.md).

For a new working session, begin with the [handoff](docs/handoff.md).

## Run the MVP

```sh
npm install
npm run dev
```

Then open the local URL Vite prints. The bundled mixed CSS/SMIL example is
immediately editable; use the preview to jump to source, the bottom rail to
tune variables, and **open** / **download** for local SVG files.

Validation:

```sh
npm run validate
npm run test:browser
```
