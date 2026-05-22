# Production Graph Audit - 2026-05-22

Scope: active live `template_versions` in production Supabase.

## Active Version Summary

| Template | Live version | User inputs | Execution nodes | Orphan execution nodes | Exposed outputs |
|---|---:|---:|---:|---:|---:|
| AMAZON GUY | v2 | 4 | 11 | 1 | 6 |
| RAVEN | v2 | 4 | 7 | 1 | 3 |
| UGC Mirror Grunge | v1 | 4 | 8 | 1 | 7 |
| ARMORED TRUCK | v2 | 5 | 26 | 0 | 10 |
| BLUE LAB | v2 | 9 | 12 | 0 | 6 |
| GARAGE | v2 | 4 | 22 | 0 | 6 |
| GAS STATION | v2 | 5 | 26 | 0 | 11 |
| GRILLZZZZ | v2 | 12 | 14 | 0 | 14 |
| ICE PICK | v2 | 10 | 17 | 0 | 8 |
| JEANS | v2 | 2 | 19 | 0 | 7 |
| PAPARAZZI | v3 | 2 | 2 | 0 | 1 |
| SKATEPARK | v2 | 9 | 14 | 0 | 6 |
| UGC MIRROR | v2 | 3 | 5 | 0 | 3 |
| UNBOXING | v2 | 4 | 18 | 0 | 6 |

## Version Status

| Template | Live version | Other versions |
|---|---:|---|
| AMAZON GUY | v2 | v1 inactive |
| RAVEN | v2 | v1 inactive |
| UGC Mirror Grunge | v1 | none |

## Legend

- `user_input`: customer upload or hidden guide/reference image node.
- `image_gen`: image generation step.
- `video_gen`: video generation step.
- `orphan`: an image/video step with no incoming edge. It cannot receive an image from an upload, guide, or prior output.
- `exposed`: marked as final deliverable output.

## AMAZON GUY v2

```mermaid
flowchart LR
  AG_U1["Input 1<br/>user_input"]
  AG_U2["Input 2<br/>user_input"]
  AG_R1["Reference A<br/>hidden user_input"]
  AG_R2["Reference B<br/>hidden user_input"]

  AG_I1["Gemini image A<br/>image_gen"]
  AG_I2["Gemini image B<br/>image_gen"]
  AG_I3["Gemini image C<br/>image_gen"]
  AG_I4["Gemini image D<br/>image_gen<br/>terminal image"]
  AG_BAD["ORPHAN: Gemini image<br/>image_gen<br/>0 in / 0 out"]:::bad

  AG_V1["Kling First & Last Frame<br/>video_gen<br/>exposed"]
  AG_V2["Kling Video<br/>video_gen<br/>exposed"]
  AG_V3["Kling Video<br/>video_gen<br/>exposed"]
  AG_V4["Kling Video<br/>video_gen<br/>exposed"]
  AG_V5["Kling Video<br/>video_gen<br/>exposed"]
  AG_V6["Kling Video<br/>video_gen<br/>exposed"]

  AG_U1 -->|image_2| AG_I4
  AG_R2 -->|image_1| AG_I4

  AG_U1 -->|image_3| AG_I1
  AG_U2 -->|image_2| AG_I1
  AG_I1 --> AG_V1
  AG_I1 --> AG_V2
  AG_I1 --> AG_V3

  AG_U2 -->|image_1| AG_I2
  AG_I2 --> AG_V4

  AG_U1 -->|image_2| AG_I3
  AG_R1 -->|image_1| AG_I3
  AG_I3 --> AG_V5
  AG_I3 --> AG_V6

  classDef bad fill:#3b0d0d,stroke:#ff4d4f,color:#fff;
```

## RAVEN v2

```mermaid
flowchart LR
  RV_U1["Input 1<br/>user_input"]
  RV_R1["Reference A<br/>hidden user_input"]
  RV_R2["Reference B<br/>hidden user_input"]
  RV_R3["Reference C<br/>hidden user_input"]

  RV_I1["Gemini image A<br/>image_gen"]
  RV_I2["Gemini image B<br/>image_gen"]
  RV_I3["Gemini image C<br/>image_gen"]
  RV_BAD["ORPHAN: Import Model<br/>image_gen<br/>0 in / 0 out"]:::bad

  RV_V1["Kling First & Last Frame<br/>video_gen<br/>exposed"]
  RV_V2["Kling First & Last Frame<br/>video_gen<br/>exposed"]
  RV_V3["Kling Video<br/>video_gen<br/>exposed"]

  RV_U1 -->|image_2| RV_I1
  RV_R1 -->|image_1| RV_I1
  RV_I1 -->|init_image| RV_V1
  RV_I1 -->|end_frame_image| RV_V2

  RV_U1 -->|image_2| RV_I2
  RV_R2 -->|image_1| RV_I2
  RV_I2 -->|init_image| RV_V2

  RV_U1 -->|image_2| RV_I3
  RV_R3 -->|image_1| RV_I3
  RV_I3 -->|end_frame_image| RV_V1
  RV_I3 -->|init_image| RV_V3

  classDef bad fill:#3b0d0d,stroke:#ff4d4f,color:#fff;
```

## UGC Mirror Grunge v1

```mermaid
flowchart LR
  UGC_TOP["Top Garment<br/>user_input"]
  UGC_HAT["HAT<br/>user_input guide"]
  UGC_BOTTOM["Bottom Garment<br/>user_input"]
  UGC_BOTTOM_GUIDE["Bottom Garment Guide<br/>user_input guide"]

  UGC_I1["Top Garment Image Output 1<br/>image_gen<br/>exposed"]
  UGC_I3["Top Garment Image Output 3<br/>image_gen"]
  UGC_I4["Top Garment Image Output 4<br/>image_gen<br/>exposed terminal"]
  UGC_BI2["Bottom Garment Image Output 2<br/>image_gen<br/>exposed"]

  UGC_V1["Top Garment Video Output 1<br/>video_gen<br/>exposed"]
  UGC_V3["Top Garment Video Output 3<br/>video_gen<br/>exposed"]
  UGC_BV2["Bottom Garment Video Output 2<br/>video_gen<br/>exposed"]
  UGC_BAD["ORPHAN: Top Garment Video Output 4<br/>video_gen<br/>EXPOSED<br/>0 in / 0 out"]:::bad

  UGC_TOP -->|top_garment_image| UGC_I1
  UGC_HAT -->|reference_image| UGC_I1
  UGC_I1 --> UGC_V1

  UGC_TOP -->|top_garment_image| UGC_I3
  UGC_HAT -->|reference_image| UGC_I3
  UGC_I3 --> UGC_V3

  UGC_TOP -->|top_garment_image| UGC_I4

  UGC_BOTTOM -->|bottom_garment_image| UGC_BI2
  UGC_BOTTOM_GUIDE -->|reference_image| UGC_BI2
  UGC_BI2 --> UGC_BV2

  classDef bad fill:#3b0d0d,stroke:#ff4d4f,color:#fff;
```
