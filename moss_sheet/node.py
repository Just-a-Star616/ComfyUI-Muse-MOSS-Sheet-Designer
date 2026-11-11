"""MOSS sheet designer (views, part prompts, styles, layout) driven by FLUX.2 / Qwen Image 2.1.

per_view: every selected view is its own generation (reference edit of
character_image when connected), optionally edited by a per-view instruction,
cached per node so only changed, unconfirmed views re-render. Runs only preview
the views; the "build" action pastes them into the MOSS layout boxes and the
Muse 5-panel template and emits the outputs.
single_canvas: one generation of the whole sheet from MOSS's natural-language
caption (never the MOSS layout JSON, which FLUX.2 / Qwen do not understand).
prompt_list: dataset run over one of the bundled prompt lists.
image_edit: redraws character_image in the designer style plus view_control edits["image"], at the image's own aspect.
"""
import hashlib
import json
import math
from pathlib import Path

import torch

import comfy.bg_removal_model
import comfy.model_management
import comfy.utils
import folder_paths
import nodes
from comfy_execution.graph import ExecutionBlocker
from nodes import MAX_RESOLUTION

from .catalog import CONTRACT as C, DEFAULT, VIEWS
from .compiler import compile_state, render_prompt
from .layout import compute_layout
from .state import StateError, compact, parse_state, validate_prompt

BACKGROUND_RGB = {"white": 1.0, "light_gray": 0.85}
# Tiled VAE on this ROCm box: full-frame encode/decode page-faults the GPU (ROCM_STABILITY_FIXES.md #5).
TILED_VAE = dict(tile_size=512, overlap=64, temporal_size=64, temporal_overlap=8)
DEFAULT_CONTROL = '{"locked":[],"seeds":{},"edits":{},"edit_seeds":{},"prompts":{},"action":null}'
PROMPT_LISTS = json.loads((Path(__file__).parent / "prompt_lists.json").read_text(encoding="utf-8"))
# Muse sheet geometry: portrait panel, then front / body_left (faces right) / body_right (faces left) / back panels.
PORTRAIT_SIZE = (1280, 2304)
BODY_PANEL = dict(width=704, height=2304, figure_height=2048, bottom_margin=128)

# Template panel x-ranges as fractions of the sheet width (1280 + 4 x 704 = 4096).
POSE_PANELS = {"face_front": (0, 1280), "body_front": (1280, 1984), "body_left": (1984, 2688), "body_right": (2688, 3392), "body_back": (3392, 4096)}

# LC Vision Prompt Enhancer: one request per toggled text box, answer routed back to that box.
VISION_FIELDS = {
    "prompt": ("describe_character", "Describe only this character's identity as compact comma-separated visual facts: species, apparent adult age, face, eyes, hair colour, length and style, skin, ears, tail, horns, markings. For a braid, ponytail or other one-sided feature, name the character's own side, which is the opposite of the image side (hair on the left of the image is over her RIGHT shoulder). No clothing, no pose, no background."),
    "outfit": ("describe_outfit", "Describe only the clothing and accessories this character wears as compact comma-separated visual facts: each garment, colours, materials, trims, ribbons, sleeves, gloves, jewellery, headwear. Leave out footwear, body, pose and background."),
    "body_details": ("describe_body", "Describe only this character's body build and proportions as compact comma-separated visual facts: overall build, height impression, shoulders, chest size, waist, hips, legs. No clothing, face, hair, pose or background, and no details only visible when nude."),
}
MUSE_VISION_PRESET = "Muse (per field)"
VISION_STYLE_TAG = {"none": "None", "anime": "Anime", "photo": "Realistic", "realistic_painting": "Realistic", "semi_realistic_anime": "Anime",
                    "oil_painting": "Illustration", "watercolor": "Illustration", "gouache": "Illustration", "colored_pencil": "Illustration", "3d": "Cartoon"}

_SESSIONS = {}


def _vision_presets():
    lc = nodes.NODE_CLASS_MAPPINGS.get("LCVisionPromptEnhancer")
    return [MUSE_VISION_PRESET] + ([p for p in lc.INPUT_TYPES()["required"]["preset"][0] if p != "Custom"] if lc else [])


def _describe(vision_model, preset, instruction, notes, style, images, seed, keep_notes):
    """keep_notes: put the user's existing text (name/trigger) in front of the answer verbatim."""
    muse = preset == MUSE_VISION_PRESET
    lc_preset, system = ("Custom", instruction) if muse else (preset, "")
    text = instruction if preset != MUSE_VISION_PRESET else "Describe the character in image 1."
    if notes.strip():
        text += f"\nKeep these user notes where they fit: {notes.strip()}"
    answer = _node("LCVisionPromptEnhancer").run(vision_model=vision_model, prompt_text=text, preset=lc_preset, custom_system_prompt=system,
                                               style_tag="None" if muse else VISION_STYLE_TAG[style], max_tokens=400, temperature=0.3, top_p=0.9,
                                               repetition_penalty=1.1, seed=int(seed) % 2**31, image_1=images[0], image_2=images[1])[0].strip()
    return f"{notes.strip().rstrip(',.')}, {answer}" if keep_notes and notes.strip() else answer


def _pose_crop(pose_image, view):
    span = POSE_PANELS.get(view)
    if pose_image is None or span is None:
        return None
    w = pose_image.shape[2]
    return pose_image[:1, :, round(span[0] * w / 4096):round(span[1] * w / 4096), :3]


def _node(name):
    return nodes.NODE_CLASS_MAPPINGS[name]()


def _round32(x):
    # Qwen 2.1 needs multiples of 32, FLUX.2 needs 16.
    return max(256, int(round(x / 32.0)) * 32)


def _tensor_hash(t):
    return hashlib.sha1(t.detach().to("cpu", torch.float32).contiguous().numpy().tobytes()).hexdigest()


def _get_models(model, clip, vae, kv_cache, qwen21_cache, qwen21_cache_dtype):
    family = model.model.model_config.unet_config.get("image_model")
    if family == "qwen_image21":
        model = _node("QwenImage21Cache").execute(model=model, device=qwen21_cache, dtype=qwen21_cache_dtype)[0]
    elif family == "flux2" and kv_cache != "off":
        # FluxKVCache only works on the 9B-KV checkpoint; set kv_cache off for 4B / non-KV Klein.
        model = _node("FluxKVCache").execute(model=model)[0]
    return {"model": model, "clip": clip, "vae": vae, "family": family}


def _conditioning(models, prompt, refs, ref_megapixels):
    if models["family"] == "qwen_image21":
        out = _node("TextEncodeQwenImage21").execute(
            clip=models["clip"], prompt=prompt, negative_prompt="", vae=models["vae"], resolution=1024,
            images={f"image_{i + 1}": img for i, img in enumerate(refs)},
        )
        return out[0], out[1]
    positive = _node("CLIPTextEncode").encode(models["clip"], prompt)[0]
    negative = _node("ConditioningZeroOut").zero_out(positive)[0]
    for img, mp in zip(refs, ref_megapixels):
        scaled = _node("ImageScaleToTotalPixels").execute(image=img, upscale_method="lanczos", megapixels=mp, resolution_steps=1)[0]
        latent = _node("VAEEncodeTiled").encode(vae=models["vae"], pixels=scaled, **TILED_VAE)[0]
        positive = _node("ReferenceLatent").execute(conditioning=positive, latent=latent)[0]
        negative = _node("ReferenceLatent").execute(conditioning=negative, latent=latent)[0]
    return positive, negative


def _generate(models, prompt, refs, width, height, seed, steps, cfg, ref_megapixels=None):
    """ref_megapixels: encode size per reference (FLUX.2 / Flux3); default 1 MP each."""
    positive, negative = _conditioning(models, prompt, refs, ref_megapixels or [1.0] * len(refs))
    channels = models["model"].get_model_object("latent_format").latent_channels
    ratio = models["vae"].spacial_compression_encode()
    latent = {"samples": torch.zeros([1, channels, height // ratio, width // ratio], device=comfy.model_management.intermediate_device())}
    sampled = _node("KSampler").sample(
        model=models["model"], seed=int(seed), steps=int(steps), cfg=float(cfg), sampler_name="euler", scheduler="simple",
        positive=positive, negative=negative, latent_image=latent, denoise=1.0,
    )[0]
    image = _node("VAEDecodeTiled").decode(vae=models["vae"], samples=sampled, **TILED_VAE)[0][..., :3]
    comfy.model_management.soft_empty_cache()
    return image


def _sentence(prefix, text):
    text = text.strip().rstrip(".")
    return f"{prefix}{text}." if text else ""


def _view_prompt(item, kind, state, profile, has_ref, pose_index=None):
    """profile: (character, outfit, body, nsfw). Flat-lay clothing shows only the outfit,
    hand/foot close-ups skip the body description, nude details only reach an outfit-less (nude) sheet.
    pose_index: image number of the pose guide."""
    character, outfit, body, nsfw = profile
    caption = item["caption"].removeprefix(C["view_prefix_character"])
    details = (_sentence("Outfit: ", outfit),) if kind == "clothing" else (
        _sentence("Character details: " if has_ref else "The character: ", character),
        _sentence("Body: ", body) if kind in ("portrait", "body") else "",
        _sentence("Nude details: ", nsfw) if kind in ("portrait", "body") and not outfit.strip() else "",
        _sentence("Outfit: ", outfit))
    tail = (C["styles"][state["style"]], f"Shown alone on {C['backgrounds'][state['background']]}.")
    if has_ref:
        keep = "Same face, hairstyle, skin tone and outfit unchanged." if item["label"] == "character" else "Same outfit design, colors and materials as image 1."
        pose = f"Match the exact pose, body proportions and framing of the grey mannequin in image {pose_index}, but not its appearance." if pose_index else ""
        return " ".join(s for s in (f"The character from image 1. {caption}", pose, *details, *tail, keep) if s)
    return " ".join(s for s in (caption, *details, *tail) if s)


def _list_prompt(entry, state, profile, has_ref):
    """entry flags: outfit = the prompt sets no clothing of its own, body = the prompt needs body details,
    nude = nudity is in shot, so nude-only details apply."""
    character, outfit, body, nsfw = profile
    text = entry["text"]
    lead = "The character from image 1" if has_ref else "The character"
    text = f"{lead}, {text}" if text[:1].islower() else (f"{lead}. {text}" if has_ref else text)
    details = (_sentence("Character details: " if has_ref else "The character: ", character),
               _sentence("Body: ", body) if entry["body"] else "",
               _sentence("Nude details: ", nsfw) if entry["nude"] else "",
               _sentence("Outfit: ", outfit) if entry["outfit"] else "",
               C["styles"][state["style"]])
    keep = ("Same face, hairstyle, skin tone and outfit as image 1." if entry["outfit"] else "Same face, hairstyle and skin tone as image 1.") if has_ref else ""
    return " ".join(s for s in (text, *details, keep) if s)


def _contain(image, width, height, fill, bottom=False):
    """Scale to fit inside width x height without cropping; pad with fill (centred, or flush with the bottom edge)."""
    scale = min(width / image.shape[2], height / image.shape[1])
    w, h = max(1, round(image.shape[2] * scale)), max(1, round(image.shape[1] * scale))
    out = torch.full((1, height, width, 3), fill, device=image.device)
    y, x = (height - h) if bottom else (height - h) // 2, (width - w) // 2
    out[:, y:y + h, x:x + w] = comfy.utils.common_upscale(image.movedim(-1, 1), w, h, "lanczos", "disabled").movedim(1, -1)
    return out


def _load_bg_model():
    # ComfyUI's own background removal (managed loading/offload); AILab RMBG faulted the GPU on ROCm here.
    files = folder_paths.get_filename_list("background_removal")
    if not files:
        raise RuntimeError("remove_background needs a model in models/background_removal (e.g. birefnet.safetensors).")
    name = next((f for f in files if "birefnet" in f.lower()), files[0])
    return comfy.bg_removal_model.load(folder_paths.get_full_path_or_raise("background_removal", name))


def _align(image, mask, width, height, figure_height, bottom_margin):
    """Muse sheet alignment: scale the figure's mask bounds to figure_height, stand it on
    bottom_margin, centre it. The panel widens instead of failing when a pose is wider."""
    if mask is None:
        mask = 1.0 - image[0].min(dim=-1).values
    rows = torch.where((mask[0] if mask.ndim == 3 else mask).gt(0.1).sum(dim=1) >= 3)[0].tolist()
    cols = torch.where((mask[0] if mask.ndim == 3 else mask).gt(0.1).sum(dim=0) >= 3)[0].tolist()
    if not rows or not cols:
        return torch.ones((1, height, width, 3), device=image.device)
    y0, y1, x0, x1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
    scaled = max(1, round((x1 - x0) * figure_height / (y1 - y0)))
    figure = comfy.utils.common_upscale(image[:, y0:y1, x0:x1].movedim(-1, 1), scaled, figure_height, "lanczos", "disabled").movedim(1, -1).clamp(0, 1)
    width = max(width, scaled)
    canvas = torch.ones((1, height, width, 3), device=image.device)
    top, left = height - bottom_margin - figure_height, (width - scaled) // 2
    canvas[:, top:top + figure_height, left:left + scaled] = figure
    return canvas


def _on_white(entry):
    if entry["mask"] is None:
        return entry["image"], None
    m = entry["mask"].reshape(1, *entry["image"].shape[1:3], 1).to(entry["image"])
    return entry["image"] * m + (1 - m), entry["mask"]


def _template(session):
    portrait = session.get("face_front")
    # Bust portraits are wider than the tall panel: fit the whole image and sit its cut-off chest on the bottom edge.
    panels = [_contain(_on_white(portrait)[0], *PORTRAIT_SIZE, 1.0, bottom=True) if portrait else torch.ones((1, PORTRAIT_SIZE[1], PORTRAIT_SIZE[0], 3))]
    for view in ("body_front", "body_left", "body_right", "body_back"):
        entry = session.get(view)
        panels.append(_align(*_on_white(entry), **BODY_PANEL) if entry else torch.ones((1, BODY_PANEL["height"], BODY_PANEL["width"], 3)))
    device = comfy.model_management.intermediate_device()
    return torch.cat([p.to(device) for p in panels], dim=2)


def _parse_control(raw):
    try:
        data = json.loads(raw or DEFAULT_CONTROL)
        ints = lambda d: {k: int(v) for k, v in d.items()}
        strip = lambda d: {k: v.strip() for k, v in d.items() if v.strip()}
        return (set(data.get("locked", [])), ints(data.get("seeds", {})), strip(data.get("edits", {})), ints(data.get("edit_seeds", {})),
                strip(data.get("prompts", {})), data.get("action") or {})
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError(f"view_control is not valid JSON: {error}")


def _key(*parts):
    return hashlib.sha1(json.dumps(parts).encode()).hexdigest()


class MuseMossSheetDesigner:
    CATEGORY = "Muse/Character Sheet"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE", "STRING", "IMAGE", "IMAGE", "STRING", "IMAGE", "IMAGE")
    RETURN_NAMES = ("sheet", "prompts", "template", "images", "captions", "character_image", "detail_image")
    OUTPUT_IS_LIST = (False, False, False, True, True, False, False)
    OUTPUT_NODE = True
    DESCRIPTION = ("MOSS character-sheet designer (views, part prompts, styles, layout) generating with FLUX.2 Klein, Qwen Image 2.1 or MOSS-Image. "
                   "per_view renders each view as a candidate card (confirm, re-roll, prompt, edit); Build final sheet assembles the MOSS sheet plus the Muse 5-panel template; "
                   "single_canvas renders the whole sheet at once; prompt_list renders a bundled dataset prompt list to images/captions; "
                   "image_edit restyles character_image (designer style + edit text) to images/captions.")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True, "default": "", "placeholder": "Character description: name/trigger, face, hair, eyes, skin, distinguishing features (required)", "tooltip": "Character description: name/trigger, face, hair, skin, distinguishing features. Outfit and body details have their own optional boxes. Saved with character presets."}),
                "state_json": ("STRING", {"default": compact(DEFAULT), "multiline": True, "dynamicPrompts": False}),
                "mode": (["per_view", "single_canvas", "prompt_list", "image_edit"], {"default": "per_view"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": "fixed"}),
                "steps": ("INT", {"default": 4, "min": 1, "max": 100, "tooltip": "Klein: 4. Qwen 2.1: 20-25, or 8 with the Lightning LoRA."}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 30.0, "step": 0.1}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.25, "max": 4.0, "step": 0.05, "tooltip": "per_view: generation size of each view (keeps the layout box aspect). single_canvas uses the MOSS canvas size, prompt_list the list's resolution."}),
                "kv_cache": (["auto", "on", "off"], {"default": "auto", "tooltip": "FLUX.2 only: FluxKVCache on for auto/on - set off for Klein 4B / non-KV checkpoints (broken output). Qwen 2.1 uses qwen21_cache."}),
                "view_control": ("STRING", {"default": DEFAULT_CONTROL, "multiline": False, "tooltip": "Per-view confirms, seeds, prompts, edits and the pending action, written by the view cards."}),
            },
            "optional": {
                "outfit": ("STRING", {"multiline": True, "default": "", "placeholder": "Outfit description (optional) - shoes go in the designer's Footwear part prompt", "tooltip": "Outfit description. Used on every view; the only text on flat-lay clothing views. Prompt lists drop it on prompts that set their own clothing. Saved with character presets."}),
                "body_details": ("STRING", {"multiline": True, "default": "", "placeholder": "Body / figure details (optional): build, proportions, chest size... Nude-only details go in nsfw_details.", "tooltip": "Body/figure details (build, proportions, chest size, etc.). Used on portrait and full-body views, and on prompt-list prompts that need it. Saved with character presets."}),
                "remove_background": ("BOOLEAN", {"default": True, "tooltip": "per_view: remove each view's background (ComfyUI BiRefNet from models/background_removal) and composite it onto the sheet background. Keep on for pose generation and the template output."}),
                "prompt_list": (list(PROMPT_LISTS), {"tooltip": "prompt_list mode: which dataset list to render (resolution is in the name)."}),
                "qwen21_cache": (["auto", "gpu", "cpu", "off"], {"default": "auto", "tooltip": "Qwen Image 2.1 only: QwenImage21Cache reference-token cache. auto = spare VRAM then RAM, gpu = VRAM, cpu = RAM, off = recompute every step."}),
                "qwen21_cache_dtype": (["default", "int8", "int4"], {"default": "default", "tooltip": "Qwen Image 2.1 cache storage precision. int8 halves cache memory at about bf16 accuracy."}),
                "describe_character": ("BOOLEAN", {"default": False, "tooltip": "Fill character_description from character_image (+ detail_image) with LC Vision (needs vision_model). Describe-only run: fills the box and switches itself off; queue again to generate."}),
                "describe_outfit": ("BOOLEAN", {"default": False, "tooltip": "Fill outfit from the reference image(s) with LC Vision. Describe-only run: fills the box and switches itself off; queue again to generate."}),
                "describe_body": ("BOOLEAN", {"default": False, "tooltip": "Fill body_details from the reference image(s) with LC Vision. Describe-only run: fills the box and switches itself off; queue again to generate."}),
                "vision_preset": (_vision_presets(), {"default": MUSE_VISION_PRESET, "tooltip": "Muse (per field) asks for just that box's facts (no style text). Any other choice uses that LC Vision preset for every toggled box, with style_tag from the designer's Style. Text already in character_description (name/trigger) is kept in front."}),
                "nsfw_details": ("STRING", {"multiline": True, "default": "", "placeholder": "Nude-only details (optional): nipples, pubic hair, genitals... Used only on nude prompt-list prompts, or on the sheet when outfit is empty.", "tooltip": "Details that are only visible nude. Never added to clothed views. Saved with character presets."}),
                "character_image": ("IMAGE", {"tooltip": "Identity reference (image 1). Without it the sheet is plain text-to-image. Ignored for MOSS-Image models (text-to-image only)."}),
                "detail_image": ("IMAGE", {"tooltip": "Optional outfit/detail reference (image 2)."}),
                "vision_model": ("LC_VISION_MODEL", {"tooltip": "From LC Vision Loader. Used only when a describe_* toggle is on. Set keep_model_loaded off on the loader to free VRAM before sampling."}),
                "pose_megapixels": ("FLOAT", {"default": 0.75, "min": 0.1, "max": 4.0, "step": 0.05, "tooltip": "FLUX.2 / Flux3: encode size of the pose_image panel reference. 0.75 fits all three references at a 1 MP output on 24 GB with Klein 9B; the other references stay at 1 MP."}),
                "pose_image": ("IMAGE", {"tooltip": "Optional Muse 5-panel pose template (portrait, front, right-facing, left-facing, back), e.g. the grey mannequin sheet or this node's template output. per_view crops the matching panel as the last reference for portrait, front, left-side, right-side and back views."}),
            },
            "hidden": {"node_id": "UNIQUE_ID"},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, state_json, prompt=None, describe_character=False):
        try:
            parse_state(state_json, MAX_RESOLUTION)
            if prompt is not None and not describe_character:
                validate_prompt(prompt)
            return True
        except StateError as error:
            return str(error)

    def run(self, model, clip, vae, prompt, state_json, mode, seed, steps, cfg, megapixels, kv_cache, view_control,
            outfit="", body_details="", remove_background=True, prompt_list=None, qwen21_cache="auto", qwen21_cache_dtype="default", character_image=None, detail_image=None, pose_image=None, pose_megapixels=0.75, describe_character=False, describe_outfit=False, describe_body=False,
            vision_preset=MUSE_VISION_PRESET, nsfw_details="", vision_model=None, node_id=None):
        state = parse_state(state_json, MAX_RESOLUTION)
        fields = {"prompt": prompt, "outfit": outfit, "body_details": body_details}
        toggles = {"describe_character": describe_character, "describe_outfit": describe_outfit, "describe_body": describe_body}
        described = {}
        wanted = [f for f, (toggle, _) in VISION_FIELDS.items() if toggles[toggle]]
        if wanted:
            if vision_model is None or character_image is None:
                raise ValueError("describe_* toggles need vision_model (LC Vision Loader) and character_image connected.")
            images = (character_image[:1], detail_image[:1] if detail_image is not None else None)
            for f in wanted:
                print(f"[MuseMossSheetDesigner] LC Vision -> {f}", flush=True)
                described[f] = _describe(vision_model, vision_preset, VISION_FIELDS[f][1], fields[f], state["style"], images, seed, f == "prompt")
            # Describe-only run: the boxes get filled for review/editing; nothing is generated until the next queue.
            blocked = ExecutionBlocker(None)
            return {"ui": {"muse_described": [described]}, "result": (blocked, "\n\n".join(f"[{f}] {t}" for f, t in described.items()), blocked, [blocked], [blocked], blocked, blocked)}
        nude = () if outfit.strip() else (nsfw_details,)
        state["character"] = {"identity": " ".join(t.strip() for t in (prompt, body_details, *nude) if t.strip()), "outfit": outfit.strip()}
        layout = compute_layout(state, MAX_RESOLUTION)
        draft = compile_state(state, layout)["layout_draft"]
        models = _get_models(model, clip, vae, kv_cache, qwen21_cache, qwen21_cache_dtype)
        # MOSS-Image is text-to-image: reference latents make it copy the reference instead of following the view.
        refs = [] if models["family"] == "moss_image" else [img[:1, ..., :3] for img in (character_image, detail_image) if img is not None]
        profile = (prompt, outfit, body_details, nsfw_details)
        width, height = layout["canvas"]
        status = {"compiler_revision": C["contract_version"], "input_hash": hashlib.sha256(compact(state).encode()).hexdigest(),
                  "width": width, "height": height, "resolved_format": "caption", "warning_codes": []}
        blocked = ExecutionBlocker(None)
        passthrough = (character_image if character_image is not None else ExecutionBlocker(None), detail_image if detail_image is not None else ExecutionBlocker(None))
        session = _SESSIONS.setdefault(node_id, {})
        model_key = [_tensor_hash(r) for r in refs] + [id(model), id(clip), id(vae), int(steps), float(cfg), kv_cache, qwen21_cache, qwen21_cache_dtype]

        if mode == "single_canvas":
            text = render_prompt(draft, layout, "caption")
            if refs:
                text = "The character from image 1, drawn in every view of this sheet. " + text
            sheet = _generate(models, text, refs, _round32(width), _round32(height), seed, steps, cfg)
            return {"ui": {"moss_sheet_status": [status], "muse_described": [described]}, "result": (sheet, text, blocked, [blocked], [blocked], *passthrough)}

        if mode == "prompt_list":
            plist = PROMPT_LISTS[prompt_list]
            images, captions = [], []
            for i, entry in enumerate(plist["prompts"]):
                text = _list_prompt(entry, state, profile, bool(refs))
                key = _key(text, seed + i, plist["width"], plist["height"], model_key)
                slot = f"list:{prompt_list}:{i}"
                if session.get(slot, {}).get("key") != key:
                    print(f"[MuseMossSheetDesigner] {prompt_list} {i + 1}/{len(plist['prompts'])} (seed={seed + i})", flush=True)
                    session[slot] = {"key": key, "image": _generate(models, text, refs, plist["width"], plist["height"], seed + i, steps, cfg)}
                images.append(session[slot]["image"])
                captions.append(text)
            for slot in [s for s in session if s.startswith("list:") and not s.startswith(f"list:{prompt_list}:")]:
                del session[slot]
            previews = [nodes.PreviewImage().save_images(img)["ui"]["images"][0] for img in images]
            return {"ui": {"moss_sheet_status": [status], "images": previews, "muse_captions": captions, "muse_described": [described]}, "result": (blocked, "\n".join(captions), blocked, images, captions, *passthrough)}

        locked, seeds, edits, edit_seeds, overrides, action = _parse_control(view_control)
        if mode == "image_edit":
            if not refs:
                raise ValueError("image_edit needs character_image (and a FLUX.2 / Qwen model).")
            src = refs[0]
            text = " ".join(s for s in ("Redraw image 1 with the same character, pose, framing, outfit and background.", C["styles"][state["style"]], edits.get("image", "")) if s)
            aspect = src.shape[2] / src.shape[1]
            gen_w, gen_h = _round32(math.sqrt(megapixels * 1e6 * aspect)), _round32(math.sqrt(megapixels * 1e6 / aspect))
            key = _key(text, seed, gen_w, gen_h, model_key)
            if session.get("edit:image", {}).get("key") != key:
                print(f"[MuseMossSheetDesigner] image_edit (seed={seed}, {gen_w}x{gen_h})", flush=True)
                session["edit:image"] = {"key": key, "image": _generate(models, text, [src], gen_w, gen_h, seed, steps, cfg)}
            image = session["edit:image"]["image"]
            preview = nodes.PreviewImage().save_images(image)["ui"]["images"]
            return {"ui": {"moss_sheet_status": [status], "images": preview, "muse_captions": [text], "muse_described": [described]}, "result": (blocked, text, blocked, [image], [text], *passthrough)}
        # Views render as candidates; sheet/template only come out on "build" (the Build final sheet button).
        scope, build = action.get("type", "all"), action.get("type") == "build"
        bg_model = None
        sheet = torch.full((1, height, width, 3), BACKGROUND_RGB[state["background"]], device=comfy.model_management.intermediate_device())
        prompts, cards = [], {}
        for panel, item in zip(layout["panels"], draft["items"]):
            view = panel["id"]
            pose = _pose_crop(pose_image, view) if refs else None
            view_refs = refs + [pose] if pose is not None else refs
            text = overrides.get(view) or _view_prompt(item, panel["kind"], state, profile, bool(refs), len(view_refs) if pose is not None else None)
            x0, y0, x1, y1 = panel["bbox_px"]
            aspect = (x1 - x0) / (y1 - y0)
            if panel["kind"] == "portrait":
                # Tall portrait boxes (extended layouts) make the models draw a full body; keep head-and-chest framing.
                aspect = min(max(aspect, 0.75), 1.33)
            gen_w, gen_h = _round32(math.sqrt(megapixels * 1e6 * aspect)), _round32(math.sqrt(megapixels * 1e6 / aspect))
            view_seed = seeds.get(view, seed + VIEWS.index(view))
            base_key = _key(text, view_seed, gen_w, gen_h, model_key, [_tensor_hash(pose), float(pose_megapixels)] if pose is not None else None)
            edit, edit_seed = edits.get(view, ""), edit_seeds.get(view, view_seed + 1)
            final_key = _key(base_key, edit, edit_seed, bool(remove_background), state["background"])
            entry = session.get(view)
            stale = entry is None or (entry["final_key"] != final_key and view not in locked)
            if stale and (scope in ("all", "build") or (scope == "view" and action.get("view") == view) or scope == "next"):
                scope = "done" if scope == "next" else scope
                if entry is None or entry["key"] != base_key:
                    print(f"[MuseMossSheetDesigner] generating {view} (seed={view_seed}, {gen_w}x{gen_h})", flush=True)
                    ref_mp = [1.0] * len(refs) + ([float(pose_megapixels)] if pose is not None else [])
                    entry = {"key": base_key, "raw": _generate(models, text, view_refs, gen_w, gen_h, view_seed, steps, cfg, ref_mp)}
                image, mask = entry["raw"], None
                if edit:
                    print(f"[MuseMossSheetDesigner] editing {view}: {edit}", flush=True)
                    image = _generate(models, edit, [image], gen_w, gen_h, edit_seed, steps, cfg)
                if remove_background:
                    bg_model = bg_model or _load_bg_model()
                    mask = bg_model.encode_image(image)
                    m = mask.unsqueeze(-1).to(image)
                    image = image * m + BACKGROUND_RGB[state["background"]] * (1 - m)
                entry = session[view] = {**entry, "final_key": final_key, "image": image, "mask": mask}
                stale = False
            prompts.append(f"[{view}] {text}" + (f" [edit] {edit}" if edit else ""))
            card = cards[view] = {"seed": view_seed, "prompt": text, "stale": stale, "image": None}
            if entry is None:
                continue
            sheet[:, y0:y1, x0:x1] = _contain(entry["image"], x1 - x0, y1 - y0, BACKGROUND_RGB[state["background"]]).to(sheet)
            card["image"] = nodes.PreviewImage().save_images(entry["image"])["ui"]["images"][0]
        for view in [v for v in session if not v.startswith(("list:", "edit:")) and v not in state["views"]]:
            del session[view]
        ui = {"moss_sheet_status": [status], "muse_described": [described], "muse_views": [cards], "muse_built": [build]}
        if not build:
            return {"ui": ui, "result": (blocked, blocked, blocked, [blocked], [blocked], blocked, blocked)}
        return {"ui": ui, "result": (sheet, "\n".join(prompts), _template(session), [blocked], [blocked], *passthrough)}
