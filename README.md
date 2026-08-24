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
**open** / **download** for local SVG files. The **demos** control or Shift+D
outside the editor opens preregistered SVG source from GitHub; a shortname such
as `?demo=card` opens the same entry directly. Demo fetching is explicit;
everything else remains local and previewed content stays offline.

For HTTPS access from another device on the tailnet:

```sh
npm run dev:tailnet
```

This uses `tailnet-dev-host`, starts Vite on loopback, and exposes the
path-scoped `https://<tailnet-host>/svg/` route on the standard HTTPS port. It
does not claim a root route, and Vite refuses an occupied local port rather
than silently moving.
Override the local port with `PORT` or the mount with `TAILNET_PATH`; pass other
Vite options after `--`. The command prints the final URL and exact `unexpose`
command. The route intentionally persists after Vite stops; inspect registered
routes with `tailnet-dev-host status`.

Browser tests use their own strict port (`SVG_E2E_PORT`, default `43174`) and
never reuse an existing server, so a live workbench cannot be mistaken for the
test build of another Vite project.

Validation:

```sh
npm run validate
npm run test:browser
```

## Publish

Pushing `main` to `y4le/svg` validates the repository, runs the Chromium,
Firefox, and WebKit contracts, builds the app with its `/svg/` project-site
base, and deploys `dist` through GitHub Pages. The project site inherits the
user site's `yalethom.as` custom domain and is published at
<https://yalethom.as/svg/>; this repository does not carry its own `CNAME`.
Pull requests run the same validation, Pages-shape assertions, and browser
contracts without uploading or deploying an artifact.

To reproduce the Pages build locally:

```sh
npm run build:pages
```
