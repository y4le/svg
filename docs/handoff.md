# Fresh-session handoff

## State

The code-forward SVG workbench is a usable, locally verified MVP with secure
last-valid preview, source ↔ rendered selection, document-derived CSS/SMIL
inspection timing, source-backed variable controls, local file handling, and
explicit recovery. The implementation checkpoint is `fd7f744`; this handoff
update follows it.

`docs/design.md` remains authoritative for product and architecture, and
`docs/plan.md` remains authoritative for scope. Local `main` is 16 implementation
commits ahead of `origin/main` at `9ba9a94`; the series has not yet run in GitHub
Actions or reached the published site.

## Verified locally — 2026-08-19

- `npm run validate` passes formatting, typed lint, TypeScript, 64 unit tests,
  and the production build on Node 24.14.1.
- `npm run test:browser` passes 41 contracts in Chromium, Firefox, and WebKit:
  123/123 in two consecutive runs.
- The three formerly load-sensitive dialog/variable contracts pass 90/90 under
  `--repeat-each 10` across all three engines.
- `npm audit` and `npm audit --omit=dev` report zero vulnerabilities.
- Every focused commit below received an Opus staged-diff `looks-good` review.

These are local results. The Pages workflow, pull-request gate, `.nvmrc` input,
and Dependabot configuration still need their first hosted run after push.

## Review follow-through

| Finding                                                   | Commit    |
| --------------------------------------------------------- | --------- |
| Document-derived inspection horizon                       | `ddc7d5a` |
| Keyboard preview path and resize-stable overlay           | `215d3da` |
| Focused follow-through plan                               | `f1bc92d` |
| Browser contracts gate Pages deployment                   | `e3c38ef` |
| Recovery survives unresolved choices and storage failures | `547d723` |
| Public metadata and app-shell CSP                         | `3b449ff` |
| Live, expected-text-guarded variable edit intents         | `4addc50` |
| Native-browser security and validation coverage           | `7e33566` |
| Enumerated `spellcheck` value                             | `12ca903` |
| Redundant same-selection geometry work                    | `c34e02b` |
| Unreachable styles                                        | `6bec0d7` |
| Generated coverage excluded from typed lint               | `9c09a7c` |
| Node 24 and bounded dependency automation                 | `6fd82e1` |
| Pull-request build/browser gate                           | `cb6263a` |
| Transitive audit hygiene                                  | `797d6a3` |
| Load-independent browser assertions                       | `fd7f744` |

Two review points are closed by an explicit boundary rather than bulk changes:
share metadata remains text-only until a reliable raster card exists (D022),
and remaining package updates—including a TypeScript major—are left to separate
Dependabot pull requests that the new CI path can test.

## Current limits

- Variable controls fail closed after any source change and re-arm only when
  the next valid version publishes; the deliberate stale-command tests depend
  on that same-task window.
- While an offered recovery copy is unresolved, autosave pauses. A download
  click cannot confirm bytes reached disk, so its recovery copy is retained.
- The meta CSP cannot enforce `frame-ancestors`; deployment headers would be
  required if embedding policy becomes a requirement.
- Native XML/DOM security cases run through the Playwright Vite server rather
  than a Node DOM shim.
- Animation provenance/source jumps, Inspect/Interact, pan/zoom, performance
  budgets, deeper instance fallbacks, and observed-user validation remain
  follow-on work in the plan.

## Next pickup

1. Push local `main`, then confirm the first Actions run uses Node 24 from
   `.nvmrc`, both build and browser jobs pass, and the push run deploys.
2. Verify `https://yalethom.as/svg/` serves the new CSP-bearing build and
   `/svg/icon.svg`; confirm a pull request skips artifact upload and deployment.
3. In the repository Dependabot page, confirm both ecosystems parsed and use
   **Check for updates** rather than waiting for the monthly schedule.
4. Start the next code-forward animation slice from `docs/plan.md`: index direct
   CSS keyframe and SMIL targets for the current selection, explain unsupported
   provenance honestly, and jump to exact source ranges.
5. Before that slice, run `npm ci`, `npm run validate`, and
   `npm run test:browser`; update the plan before changing architecture.
