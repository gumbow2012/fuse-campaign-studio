# FUSE Campaign Studio — ComfyUI Workflows

19 ComfyUI workflow files that precisely recreate every Weavy template pipeline locally.

## Pipeline Map

| Weavy node | ComfyUI equivalent |
|---|---|
| `nano_banana_pro` (image edit) | KSampler img2img + LoraLoader |
| `kling` (video gen) | AnimateDiff-Evolved + IPAdapterApply + VHS_VideoCombine |
| Multiple inputs (`front_outfit`, `back_outfit`, …) | One `LoadImage` per slot → `ImageBatch` chain |
| Logo input | Dedicated `IPAdapterApply` (weight 0.40) for branding |
| `locked_inputs` reference (PAPARAZZI) | Pre-wired `LoadImage` → `ImageBatch` → `scene_gen` KSampler |
| Preview/style reference (RAVEN, UGC, GARAGE) | `IPAdapterApply` style guide (weight 0.50) |

## Required Custom Nodes

Install via ComfyUI Manager before loading any workflow:

| Pack | Nodes used |
|---|---|
| [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved) | `ADE_AnimateDiffLoaderWithContext` |
| [ComfyUI-IPAdapter-plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) | `IPAdapterApply`, `IPAdapterModelLoader`, `CLIPVisionLoader` |
| [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | `VHS_VideoCombine` |

Base checkpoint: `sd_xl_base_1.0.safetensors`
AnimateDiff model: `mm_sd_v15_v2.ckpt`

## Reference Images

Stored in `comfyui/references/`. Already wired into the workflows as locked LoadImage nodes.
Replace placeholder PNGs with real images when the Weavy CDN is accessible.

| File | Used by |
|---|---|
| `raven-original.png` | RAVEN, RAVEN (Original) |
| `garage-edit.png` | GARAGE guy |
| `paparazzi-documentation.png` | PAPARAZZI (locked scene ref) |
| `ugc-white-girl.png` | UGC MIRROR |
| `ugc-studio.png` | UGC STUDIO |

## Workflow Anatomy

### Standard 2-step (18 templates)

```
┌─ Step 1: image_edit ──────────────────────────────────────────────────────┐
│  LoadImage [front ★] ──►┐                                                  │
│  LoadImage [back  ○] ──►├─ ImageBatch ──► VAEEncode ──►┐                  │
│                          └──────────────────────────────►┤                  │
│  LoraLoader ──► CLIPTextEncode(+) ──────────────────────►├─ KSampler ──► VAEDecode ──► SaveImage
│               └─ CLIPTextEncode(-) ─────────────────────►┘ denoise=0.68–0.76
│                                                                             │
│  [Logo ○] ──► IPAdapterApply (w=0.40) ──► KSampler model                  │
│  [StyleRef] ──► IPAdapterApply (w=0.50) ──► KSampler model                │
└────────────────────────────────────────────────────────────────────────────┘
┌─ Step 2: video_gen ───────────────────────────────────────────────────────┐
│  LoraLoader ──► AnimateDiffLoader ──►┐                                     │
│  edited_image ───────────────────── ►├─ IPAdapterApply(w=0.80) ──►┐        │
│  CLIPTextEncode(+) ─────────────────────────────────────────────── ►├─ KSampler ──► VAEDecodeTiled ──► VHS MP4
│  CLIPTextEncode(-) ─────────────────────────────────────────────── ►┘  24 frames 512×912 (9:16)
│  EmptyLatentImage (512×912×24) ─────────────────────────────────── ►┘
└────────────────────────────────────────────────────────────────────────────┘
```

### PAPARAZZI 3-step

```
┌─ Step 1: scene_gen ─────┐   ┌─ Step 2: product_swap ───┐   ┌─ Step 3: video_gen ──────┐
│ LoadImage [LOCKED ref]  │   │ KSampler denoise=0.55     │   │ AnimateDiff + IPAdapter   │
│ LoadImage [clothing ★]  │──►│ (surgical product replace)│──►│ 24 frames 9:16 MP4        │
│ ImageBatch → VAEEncode  │   │ VAEEncode ← scene output  │   │                           │
│ KSampler denoise=0.80   │   │                           │   │                           │
└─────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
```

## All 19 Workflows

| File | Template | Upload Slots | Ref | Steps | Denoise |
|------|----------|-------------|-----|-------|---------|
| `armored_truck_workflow.json` | ARMORED TRUCK | front ★, back ○ | — | 2 | 0.75 |
| `blue_lab_original_workflow.json` | BLUE LAB (original) | product ★ | — | 2 | 0.73 |
| `copy_of_unboxing_workflow.json` | Copy of UNBOXING | product ★, second ○ | — | 2 | 0.68 |
| `delivery_amazon_guy_workflow.json` | DELIVERY (Amazon Guy) | front ★, back ○ | — | 2 | 0.71 |
| `doctor_workflow.json` | DOCTOR | product ★ | — | 2 | 0.70 |
| `garage_guy_workflow.json` | GARAGE guy | front ★, logo ○, back ○ | garage-edit.png | 2 | 0.74 |
| `gas_station_w_snow_workflow.json` | GAS STATION W SNOW | front ★, back ○, logo ○ | — | 2 | 0.76 |
| `ice_2.0_workflow.json` | ICE 2.0 | hoodie ★, bottoms ★ | — | 2 | 0.74 |
| `ice_original_workflow.json` | ICE (Original) | product ★ | — | 2 | 0.74 |
| `jeans_workflow.json` | JEANS | front ★, back ○ | — | 2 | 0.72 |
| `pack_theif_pants_workflow.json` | PACK THEIF (Pants) | front ★, back ○ | — | 2 | 0.73 |
| `paparazzi_original_workflow.json` | PAPARAZZI (Original) | product ★ | — | 2 | 0.72 |
| `paparazzi_workflow.json` | PAPARAZZI | clothing ★ + LOCKED overhead scene | paparazzi-documentation.png | **3** | 0.80/0.55/— |
| `raven_original_workflow.json` | RAVEN (Original) | product ★ | raven-original.png | 2 | 0.75 |
| `raven_workflow.json` | RAVEN | front ★, back ○ | raven-original.png | 2 | 0.75 |
| `skate_park_workflow.json` | SKATE PARK | t-shirt ★, shorts ★, sunglasses ○ | — | 2 | 0.73 |
| `ugc_mirror_workflow.json` | UGC MIRROR | front ★, back ○ | ugc-white-girl.png | 2 | 0.69 |
| `ugc_studio_workflow.json` | UGC STUDIO | front ★, back ○ | ugc-studio.png | 2 | 0.69 |
| `unboxing_workflow.json` | UNBOXING | product ★, second ○ | — | 2 | 0.68 |

★ = required  ○ = optional  Ref = style/locked reference image pre-wired into workflow
