# Muse MOSS Sheet Designer

ComfyUI custom node `MuseMossSheetDesigner`. ComfyUI's own `AGENTS.md` (parent folders) applies: small direct changes, sparse comments, match local style, no internet requests.

## Layout

- `moss_sheet/node.py`: the node. Every prompt sent to a model is built here, in `_view_prompt` (per view) and the mode branches of `run` (`per_view`, `single_canvas`, `prompt_list`, `image_edit`).
- `contracts/prompt_contract.v1.json`: views (caption, `kind`: portrait / body / clothing / ...), styles, backgrounds, presets. `web/catalog.js` mirrors view captions for the card UI; change both together.
- `moss_sheet/prompt_lists.json`: bundled dataset lists, with per-prompt `outfit` / `body` / `nude` flags.
- `web/`: node face (view cards, presets, describe buttons). `web/assets/` artwork is not MIT, see `NOTICE.md`.
- `pose_templates/`: Muse 5-panel templates.

## Prompt rules that are deliberate

- Portraits (`kind == "portrait"`) get no body or nude details, and with a `character_image` no outfit text either: those words make the models widen the head-and-shoulders shot.
- Body and nude details only reach full-body views; nude details only when `outfit` is empty.
- References are encoded at 1 MP; the pose panel at `pose_megapixels` (default 0.75) so three references fit on a 24 GB GPU with Klein 9B.

## 5-panel template

Fractions of a 4096 width: portrait 0-1280, front 1280-1984, left side (faces right) 1984-2688, right side (faces left) 2688-3392, back 3392-4096. Side figures in new templates must face the same way as these panels.

## Checks and release

- No test suite: run `python -m py_compile moss_sheet/*.py`, and for prompt changes print `_view_prompt` output for a portrait and a body view from ComfyUI's venv.
- ComfyUI must be restarted to load node changes. Work happens on branch `catalogue-support`; the remote ComfyUI only picks changes up after it pulls that branch and restarts.
- Commit subjects follow the ComfyUI style (`Add ...`, `Fix ...`, `Use ...`). Keep the README tables in step with input or prompt changes.

## Related

Kons Character Curator (separate repo, `ComfyUI-Kons-Character-Curator`) drives this node over the ComfyUI API, keyed on node id `muse`, and reads `muse_views`, `muse_captions` and `muse_described` from the UI output. Keep those keys stable.
