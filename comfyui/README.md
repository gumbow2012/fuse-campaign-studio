# FUSE Campaign Studio — ComfyUI Workflows

19 drag-and-drop ComfyUI workflow files recreating every Weavy pipeline locally.

## Pipeline Map

| Weavy step | ComfyUI equivalent |
|---|---|
| `nano_banana_pro` (image edit) | KSampler img2img + LoraLoader (denoise 0.55–0.80) |
| `kling` (video gen) | AnimateDiff-Evolved + IPAdapter + VHS_VideoCombine |

## Required Custom Nodes

Install these from ComfyUI Manager before loading workflows:

| Node pack | Purpose |
|---|---|
| [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved) | AnimateDiff video generation |
| [ComfyUI-IPAdapter-plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) | Reference image for video |
| [ComfyUI-VideoHelperSuite (VHS)](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | MP4 output |

Base model: **SDXL Base 1.0** (`sd_xl_base_1.0.safetensors`)
AnimateDiff model: `mm_sd_v15_v2.ckpt`

## Standard 2-Step Layout (18 workflows)

```
┌─ Step 1: image_edit (nano_banana_pro) ─────────────────────────────────────┐
│                                                                              │
│  LoadImage ──► VAEEncode ──►┐                                               │
│  CheckpointLoader ──► LoraLoader ──► CLIPTextEncode(+) ──►┐                 │
│                              └──► CLIPTextEncode(-) ──────►├─► KSampler ──► VAEDecode ──► SaveImage
│                                                             │   denoise=0.70–0.76         (edited image)
└─────────────────────────────────────────────────────────────────────────────┘

┌─ Step 2: video_gen (kling) ────────────────────────────────────────────────┐
│                                                                              │
│  LoraLoader ──► ADE_AnimateDiffLoader ──►┐                                  │
│  edited_image ──────────────────────────►├─► IPAdapterApply ──►┐            │
│  LoraLoader ──► CLIPTextEncode(+) ───────────────────────────►─┤            │
│              └── CLIPTextEncode(-) ──────────────────────────►─├─► KSampler ──► VAEDecodeTiled ──► VHS_VideoCombine (MP4)
│  EmptyLatentImage (512×912, 24 frames) ─────────────────────►──┘
└─────────────────────────────────────────────────────────────────────────────┘
```

## PAPARAZZI 3-Step Layout

```
Step 1: scene_gen ──► overhead scene image
Step 2: product_swap ──► replace shirt with user product  (denoise=0.55 — surgical swap)
Step 3: video_gen ──► MP4 from product-swapped image
```

## Quick Start

1. Open ComfyUI
2. Drag a `*_workflow.json` from `comfyui/workflows/` onto the canvas
3. **LoadImage** → select your product photo
4. **LoraLoader** → replace `<slug>_style.safetensors` with your actual LoRA
   (run `sync-weavy-loras` to get the real paths)
5. Queue Prompt

## All 19 Workflows

| File | Template | Steps | Denoise |
|------|----------|-------|---------|
| `armored_truck_workflow.json` | ARMORED TRUCK | 2 | 0.75 |
| `blue_lab_original_workflow.json` | BLUE LAB (original) | 2 | 0.73 |
| `copy_of_unboxing_workflow.json` | Copy of UNBOXING | 2 | 0.68 |
| `delivery_amazon_guy_workflow.json` | DELIVERY (Amazon Guy) | 2 | 0.71 |
| `doctor_workflow.json` | DOCTOR | 2 | 0.70 |
| `garage_guy_workflow.json` | GARAGE guy | 2 | 0.74 |
| `gas_station_w_snow_workflow.json` | GAS STATION W SNOW | 2 | 0.76 |
| `ice_2.0_workflow.json` | ICE 2.0 | 2 | 0.74 |
| `ice_original_workflow.json` | ICE (Original) | 2 | 0.74 |
| `jeans_workflow.json` | JEANS | 2 | 0.72 |
| `pack_theif_pants_workflow.json` | PACK THEIF (Pants) | 2 | 0.73 |
| `paparazzi_original_workflow.json` | PAPARAZZI (Original) | 2 | 0.72 |
| `paparazzi_workflow.json` | PAPARAZZI | **3** | 0.80 / 0.55 / — |
| `raven_original_workflow.json` | RAVEN (Original) | 2 | 0.75 |
| `raven_workflow.json` | RAVEN | 2 | 0.75 |
| `skate_park_workflow.json` | SKATE PARK | 2 | 0.73 |
| `ugc_mirror_workflow.json` | UGC MIRROR | 2 | 0.69 |
| `ugc_studio_workflow.json` | UGC STUDIO | 2 | 0.69 |
| `unboxing_workflow.json` | UNBOXING | 2 | 0.68 |
