# FUSE Campaign Studio — ComfyUI Workflows

One workflow file per production template. Each is a ready-to-load ComfyUI
img2img pipeline with a LoRA slot pre-wired.

## Workflow Structure

```
LoadImage (product photo)
    │
CheckpointLoaderSimple (SDXL base)
    │
LoraLoader ◄── replace lora_name with actual .safetensors
    │
CLIPTextEncode (positive prompt — campaign style)
CLIPTextEncode (negative prompt)
    │
VAEEncode → KSampler → VAEDecode → SaveImage
```

## Quick Start

1. Open ComfyUI (`python main.py`)
2. Drag any `*_workflow.json` from this folder into the ComfyUI canvas
3. In **LoadImage** → point to your product photo
4. In **LoraLoader** → replace `<slug>_style.safetensors` with the real LoRA
   path (downloaded via `sync-weavy-loras`)
5. In **CheckpointLoaderSimple** → confirm your SDXL checkpoint name
6. Queue → Generate

## Getting the Real LoRA Files

The LoRA file names are placeholders until the Weavy workflows are synced.
Run `sync-weavy-loras` to populate the actual paths from each Weavy workflow:

```bash
curl -X POST \
  "https://sdmwcjfksoqbplcqqmhg.supabase.co/functions/v1/sync-weavy-loras" \
  -H "Authorization: Bearer <your-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Then query the templates table to get the real `loras[].path` values and
update the `LoraLoader` widgets_values in each workflow file.

## Workflow Files

| File | Template | Weavy Recipe ID | KSampler Denoise |
|------|----------|-----------------|-----------------|
| papparazi_workflow.json | PAPPARAZI | dvgEXt4aeShCeokMq5MIpZ | 0.72 |
| raven_workflow.json | RAVEN | 8pyXqysncP9g3L2ic8Nob8 | 0.75 |
| doctor_workflow.json | DOCTOR | P9KHisYdvYAfWpunm3Qlme | 0.70 |
| blue_lab_workflow.json | BLUE LAB | yRblK7UvAxiaRjEw9blCJz | 0.73 |
| garage_workflow.json | GARAGE | 86BheMWSbZTZbjUrTRHY7o | 0.74 |
| unboxing_workflow.json | UNBOXING | EtWKBYSzByNh548YHW4JQe | 0.68 |
| gas_station_workflow.json | GAS STATION | itkxIO30C0huXXMrsYEwaN | 0.76 |
| jeans_workflow.json | JEANS | RkWlfogU1nhPSxKqDHXOjE | 0.72 |
| ice_pick_workflow.json | ICE PICK | xeKqScADHcfDu54ofVVujY | 0.74 |
| skatepark_workflow.json | SKATEPARK | VFCSb8jQZrVYqhqkwQSc5g | 0.73 |
| amazon_guy_workflow.json | AMAZON GUY | slqi1gyGckjLnKfun8FIiS | 0.71 |
| armored_truck_workflow.json | ARMORED TRUCK | 3XW2sv5u2GVW2V1HVtGjL0 | 0.76 |
| ugc_mirror_workflow.json | UGC MIRROR | pqLsbL5ZJ8tlBCf3rH8eL1 | 0.69 |

## Recommended Base Model

**SDXL Base 1.0** (`sd_xl_base_1.0.safetensors`) — matches the style these
LoRAs were trained against. Swap for a community SDXL merge for stylistic
variations.

## Node Connections at a Glance

```
[1] CheckpointLoader  MODEL → [2] LoraLoader → MODEL → [7] KSampler
                      CLIP  → [2] LoraLoader → CLIP  → [3] CLIPTextEncode+ → COND → [7]
                                              → CLIP  → [4] CLIPTextEncode- → COND → [7]
                      VAE   ──────────────────────────────────────────────────────→ [6] VAEEncode
[5] LoadImage         IMAGE → [6] VAEEncode   LATENT → [7] KSampler
                                                        [7] → LATENT → [8] VAEDecode → IMAGE → [9] SaveImage
```
