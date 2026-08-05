# Decision log

This is a compact chronological log. `proposed` entries are recommendations,
not owner-approved facts. Change their status to `accepted` when the owner
confirms them or implementation deliberately locks them in. To reverse an
accepted choice, append a superseding entry rather than rewriting its original
rationale.

| ID | Date | Status | Decision | Rationale |
| --- | --- | --- | --- | --- |
| D001 | 2026-08-04 | accepted | Keep the product core a code-forward SVG workbench with robust animation; treat GodSVG-class visual-first editing as a separate possible extension | The owner explicitly separated the visual-first roadmap from the code-forward display; split preview alone is crowded, but folding a full vector editor into the core would bury the strongest source/animation loop |
| D002 | 2026-08-04 | proposed | Treat the source string as the only save/export authority | DOM serialization would silently rewrite user code and destroy the tool's trust proposition |
| D003 | 2026-08-04 | proposed | Support CSS and SVG animation elements plus a shared inspection scrubber in MVP; defer arbitrary JavaScript and a visual keyframe timeline | Declarative animation is portable and can run in secure animated mode; two browser playback adapters can seek it without turning the product into a timeline authoring suite |
| D004 | 2026-08-04 | proposed | Use CodeMirror 6 with its Lezer XML tree plus native DOMParser | CodeMirror is focused and mobile-capable, and parser node ranges directly serve source/render mapping; DOMParser supplies browser XML semantics |
| D005 | 2026-08-04 | proposed | Map authored parser nodes to preview DOM structurally per valid source version | This keeps mapping IDs out of source, preserves exact ranges, and allows honest per-element degradation |
| D006 | 2026-08-04 | proposed | Use CSS custom properties as the first variable substrate | They remain valid portable SVG/CSS and cover the high-value numeric, time, color, and geometry cases without a template language |
| D007 | 2026-08-04 | proposed | Lead numeric controls with exact values and scrubbing; show sliders only for explicitly bounded variables | It preserves precision and follows the quiet, typographic Yale interaction ethos while retaining sliders where perceptual range matters |
| D008 | 2026-08-04 | proposed | Start with a static local-first Vite/TypeScript app, no UI framework, and no backend | CodeMirror, iframe preview, and playback already have imperative owners; framework and server complexity should be added only after a demonstrated need |
| D009 | 2026-08-04 | proposed | Use one living design, one current plan, one decision log, dated research, and one concise agent policy | This keeps the best cold-start, authority, rationale, and durability practices from the local projects without their scale-dependent ceremony |
| D010 | 2026-08-04 | proposed | Express core controls and any later visual extension through versioned source-range commands, never a second serialized project model | This preserves unsupported SVG and human formatting outside each explicit edit while leaving a safe extension seam |
| D011 | 2026-08-04 | accepted | Treat GodSVG as the benchmark for a separate optional visual-editing extension, not as an implementation dependency or core roadmap | The owner named GodSVG as the desired capability endpoint and then explicitly placed visual-first editing in a separate possible extension; its scope and Godot model should not pull the core into becoming a vector suite |
| D012 | 2026-08-04 | proposed | Route variable and supported animation writes through one version-checked `EditIntent` compiler with explicit numeric formatting and byte-fidelity fixtures | Shared minimal-edit and undo machinery prevents offset races, float noise, duplicated writeback paths, and later extension lockout without adding visual-editor features now |
