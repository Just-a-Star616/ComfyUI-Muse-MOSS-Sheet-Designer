# Muse MOSS Sheet Designer

A ComfyUI character-sheet node that combines the **MOSS-Image Character Sheet Designer** UI (view cards, part prompts, styles, auto layout) with the per-view reference-edit generation of the **Muse Character Sheet** nodes. It generates with **FLUX.2 Klein**, **Qwen Image 2.1**, **Flux3 Klein** or **MOSS-Image**.

Node: **Muse MOSS Sheet Designer (FLUX.2 / Qwen)**, category `Muse/Character Sheet`, id `MuseMossSheetDesigner`.

## Why

The MOSS designer outputs a MOSS Layout JSON prompt that only MOSS's own text encoder understands. Piping it into the Muse sheet node splits that JSON across poses line by line, which garbles the images. This node keeps the MOSS design tools and sends each model a prompt it can follow.

## Install

```
cd ComfyUI/custom_nodes
git clone https://github.com/Just-a-Star616/ComfyUI-Muse-MOSS-Sheet-Designer
```

Then restart ComfyUI. There are no Python dependencies beyond ComfyUI.

`remove_background` uses ComfyUI's built-in background removal and needs a model in `models/background_removal/`, e.g. `birefnet.safetensors`.

## Models

Load the model with the standard loaders and connect `model`, `clip` and `vae`. The node detects the family from the model.

| Family | Diffusion model | Text encoder (CLIPLoader type) | VAE | Steps / cfg |
|---|---|---|---|---|
| FLUX.2 Klein 9B | `flux-2-klein-9b-kv-fp8` | `qwen_3_8b_fp8mixed` (`flux2`) | `flux2-vae` | 4 / 1.0 |
| Qwen Image 2.1 | `qwen_image_2.1_*` (turbo for fewer steps) | `qwen3vl_8b_*` (`qwen_image`) | `qwen_image_2.1_vae_bf16` | 20–25 / 1.0, or 8 with turbo/Lightning |
| Flux3 Klein | `flux3-image-klein-*` | `qwen3vl_4b_*` (`flux3`) | `flux2-vae` | 12 / 1.0 |
| MOSS-Image / AniMOSSity | `AniMOSSity_bf16` + 8-step LoRA | `qwen3.5_9b_*` (`moss_image`) | `full_encoder_small_decoder` | 8 / 2.0 |

- `kv_cache` (FLUX.2 only): FluxKVCache is on unless set to `off`. Set it to `off` for Klein 4B or non-KV checkpoints, which otherwise give broken output.
- `qwen21_cache` / `qwen21_cache_dtype` (Qwen 2.1 only): QwenImage21Cache device (`auto`/`gpu`/`cpu`/`off`) and storage precision (`default`/`int8`/`int4`). `int8` halves cache memory.

MOSS-Image is text-to-image only. The node ignores reference images for MOSS models, because MOSS copies the reference instead of drawing the requested view. Describe the character fully in the text boxes.

## Inputs

| Input | Use |
|---|---|
| `prompt` (shown as *character_description*) | Character description: name/trigger, face, hair, skin, distinguishing features. Required. |
| `outfit` | Used on every view. The only character text on flat-lay clothing views. |
| `body_details` | Build, proportions, figure. Used on portrait and full-body views only. |
| `nsfw_details` | Nude-only details (nipples, pubic hair, genitals). Only used on prompt-list prompts flagged `nude`, and on the sheet when `outfit` is empty (a nude reference sheet). Never added to clothed views. |
| `character_image` | Identity reference (image 1). Without it the sheet is text-to-image. |
| `detail_image` | Optional second reference (image 2), e.g. a face close-up or outfit detail. |
| `pose_image` | Optional Muse 5-panel pose sheet (portrait, front, facing right, facing left, back), such as a grey mannequin sheet or this node's `template` output. The matching panel is cropped as the pose reference for those five views. |
| `mode` | `per_view`, `single_canvas` or `prompt_list` (below). |
| `megapixels` | Generation size per view in `per_view`. |
| `remove_background` | `per_view`: remove each view's background before assembly. Keep on for poses and the template. |
| `describe_*`, `vision_preset`, `vision_model` | Auto-fill the three text boxes with LC Vision (below). |

Designer settings (views, part prompts, style, background, layout) are stored in `state_json` and edited through the card UI on the node.

## Auto-fill text boxes with LC Vision

Requires ComfyUI_LC_Vision_nodes. Connect an **LC Vision Loader** to `vision_model`, then switch on `describe_character`, `describe_outfit` and/or `describe_body`.

- On queue, each toggled box sends `character_image` (and `detail_image`, if connected) to LC Vision with an instruction for just that box. Any text already in the box is passed along as notes to keep.
- That run only describes: answers are written into their boxes and the toggles switch off. Nothing is generated. Review and edit the text (vision models can invent details, such as pointed ears), then press Next view or All views.
- `vision_preset`: **Muse (per field)** asks only for that box's facts. Any other LC preset (for example Character Anchor) is used for every toggled box.
- LC Vision's `style_tag` follows the designer's Style for LC presets; Muse (per field) asks for facts only, with no style text.
- Text already in character_description (name or trigger word) is kept verbatim in front of the answer.
- Set `keep_model_loaded` off on the loader so the vision model leaves VRAM before sampling.

This node calls LC Vision itself because the round trip node → LC Vision → node would be a loop, which ComfyUI cannot run. For a separate captioning branch, LC Vision's `text` can still be wired into the boxes directly.

## Modes and outputs

**`per_view`** (default) renders every selected view as its own generation. Runs only preview the views in the view cards; nothing reaches the outputs until **Build final sheet now**, which outputs:
- `sheet`: views placed in the MOSS layout, fitted without cropping.
- `template`: Muse 5-panel sheet. Portrait | Front | Left side (facing right) | Right side (facing left) | Back, scaled to one figure height on a shared floor line, about 4096×2304. Tick those five views to fill it; a missing view leaves a blank panel.
- `prompts`: the exact text sent for each view, plus any edit.
- `character_image` / `detail_image`: the input images passed through unchanged (blocked when not connected).

**`single_canvas`** renders the whole sheet in one image from MOSS's natural-language caption. It is faster, but panel count and orientation are less reliable.

**`prompt_list`** renders one bundled dataset list to the `images` and `captions` list outputs (for SaveImageKJ or similar), at the list's resolution.

Buttons: **🔍 Describe** fills the text boxes with LC Vision only (the ticked describe_* toggles, or all three). **▶ Next view** renders the next view without a current image, **▶▶ All views** every unconfirmed view whose prompt, seed or edit changed, and **▶ Prompt list** the selected dataset list. A plain Queue behaves like All views.

Results are cached per node. Re-queuing only re-renders views or prompts whose text, seed, references or model changed.

## View cards (per_view)

Each selected view gets a card with its latest render (click to open full size) and seed. A • after the name means its settings changed since that render.
- **Confirm**: keeps the image on every run, whatever else changes. Click again to unlock.
- **New seed** (**Render** before the first image): re-renders only that view. When the view has an edit, only the edit is re-rolled and the base image is kept.
- **Show prompt**: the exact prompt. Edit it and press **Apply prompt** to re-render with the same seed; **Reset** returns to the designer prompt.
- **Apply edit** (or Enter): edits that view's image before assembly, such as "make her smile and wave". Empty removes the edit.

Below the cards: Confirm all / Unconfirm all / Clear edits, **Apply edit to all** (every unconfirmed view), and **Build final sheet now**, which renders any view still missing and then outputs the sheet and template.

## Views

The 13 MOSS views plus two extras:
- **Front 3/4**: full body turned 45° toward image-right.
- **Right side**: anatomical-right profile facing image-left. It is generated, not mirrored, so asymmetric details such as a side braid stay on their real side.

The designer's Preset menu has **Muse template · 5 views** (Portrait, Front, Left side, Right side, Back), the set that fills the `template` output. It is the default for new nodes.

Put shoes in the designer's **Footwear** part prompt rather than in `outfit`. Part prompts only reach the views where that part is visible, so portraits will not try to show feet.

## Presets

Three rows above the view cards:
- **Character**: Save stores `prompt` (character description), `body_details`, `nsfw_details` and the designer state (views, part prompts, style, layout); Load restores them.
- **Outfit**: Save / Load / Delete just the `outfit` text, so one character can wear several outfits.
- **Prompt list**: Load selects that list for **▶ Prompt list**.

Type a new name or pick an existing one in the Character and Outfit boxes. Presets are stored in `ComfyUI/user/default/muse_moss_sheet_presets.json`; files from older versions are split into characters and outfits on first read.

Bundled lists: A-Poses (6, 896×1536), Portrait (18, 896×1536), Square close-ups (11, 1216×1216), Landscape (11, 1536×896), R-Rated (25, 1216×1216), XXX-Rated (25, 1216×1216).

Lists live in `moss_sheet/prompt_lists.json`. Each prompt has two flags:
- `outfit: false` drops the `outfit` text, for prompts that set their own clothing, bare shoulders or nudity.
- `body: true` adds `body_details`, for prompts that need it.
- `nude: true` adds `nsfw_details`. Every XXX-Rated prompt is flagged; other prompts are flagged when they state nudity.

Edit the file to add lists or fix flags; restart ComfyUI to load changes. The R-Rated and XXX-Rated lists are adult content, intended for adult characters only.

## Example workflow

`example_workflows/Muse MOSS Sheet Designer - Klein 9B.json` appears under ComfyUI's Templates → custom nodes. Select your own model files and character image before queuing.

## Notes

- Klein 9B with all three references at 1 MP ran out of memory on a 24 GB GPU. Qwen 2.1 handles three references at about 2.2× the time per view. One reference is the recommended default.
- VAE encode and decode are tiled (512/64), which avoids GPU page faults on ROCm.

## License

The code is MIT, forked from MOSS-Image Character Sheet Designer v1.0 by ukr8b3g-cmyk. The view-card artwork (`web/assets/`, the SVG fallback in `web/avatar.js`) is **not** covered by the MIT grant. Check `NOTICE.md` before redistributing.
