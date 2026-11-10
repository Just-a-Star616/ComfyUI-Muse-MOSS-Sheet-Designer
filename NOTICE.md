# Licensing scope and artwork notice

The MIT grant in [LICENSE](LICENSE) covers only original code and documentation for which ukr8b3g-cmyk holds the applicable rights. It does not relicense third-party material.

## Images and artwork

The following are outside that MIT grant:

- `web/assets/mannequin-atlas.png` (Git blob `35dd5fabbe138b7b181b89d55432a6e53d0e9c34`).
- Artwork, including the SVG fallback artwork in `web/avatar.js`, and images/screenshots embedded in or linked from the README and documentation.
- User-provided references and generated outputs.

The source code implementing display/layout functionality is distinct from rights in the depicted artwork. No separate image license or complete chain of rights was established by this documentation update. Inclusion in this repository does not by itself grant permission to reuse depicted characters, designs or other third-party content. Confirm applicable rights before reuse or redistribution.

## Local MOSS UI port (2026-10-31)

The Reference13 UI code, styles, atlas, additional view PNGs and existing SVG fallback were adapted from the user's installed H3 Character Sheet Designer in ComfyUI_W. Original notices are retained. Source hashes are recorded in `docs/h3-ui-source-hashes.json`. This local adaptation does not establish new artwork licenses or authorize redistribution. MOSS prompt compilation is independent of the H3 image-reference prompt path.

## External components

ComfyUI, MiniMax H3 models, dependencies and external services retain their own licenses and terms. The repository's MIT grant does not extend to them or guarantee rights in generated content. Preserve applicable original licenses, attribution and notices when redistributing third-party material.

## Muse MOSS Sheet Designer fork (2026-11-09)

This pack forks the MOSS-Image Character Sheet Designer v1.0 (MIT, ukr8b3g-cmyk): its prompt compiler, layout planner, state schema and designer UI. Added: the FLUX.2 / Qwen Image 2.1 / Flux3 / MOSS generation engine, `body_3q` and `body_right` views, per-view confirm/re-roll/prompt/edit cards and the build step, character presets, prompt lists and the template output. The artwork exclusions above still apply; `body_3q` and `body_right` cards reuse the existing atlas regions.
