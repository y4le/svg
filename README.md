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

Vite listens only on `127.0.0.1:4173` and fails instead of silently choosing a
different port. Then open the local URL it prints. The bundled mixed CSS/SMIL
example is immediately editable; use the preview to jump to source, the bottom
rail to tune variables, the top-rail filename to rename the next download, and
**open** / **download** for local SVG files.

For HTTPS access from another device on the tailnet:

```sh
npm run dev:tailnet
```

This uses `tailnet-dev-host`, starts Vite on loopback, and exposes `/` on the
dedicated Tailnet HTTPS port `4443` after refusing a live root route owned by
another project on that port. Override the local or HTTPS port with `PORT` or
`TAILNET_HTTPS_PORT`; pass other Vite options after `--`. The command prints the
final URL and the exact `unexpose` command. The route intentionally persists
after Vite stops because the shared helper does not yet provide a lease-safe
automatic cleanup contract; inspect registered routes with
`tailnet-dev-host status`.

Validation:

```sh
npm run validate
npm run test:browser
```
