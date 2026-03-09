"""
Generate ComfyUI workflows for all 19 FUSE Campaign Studio templates.
Each workflow correctly mirrors the Weavy pipeline:
  - One LoadImage node per input_manifest entry (labelled required/optional)
  - ImageBatch to combine multiple product images before VAEEncode
  - Logo gets a dedicated IPAdapterApply branch (style+branding guide)
  - Locked references pre-wired as immutable LoadImage nodes (paparazzi, etc.)
  - Reference images (raven, ugc, garage) wired as IPAdapter style guides
  - Step 2: AnimateDiff + IPAdapter + VHS_VideoCombine for video (9:16, 24 frames)
  - PAPARAZZI: 3 KSampler stages (scene_gen → product_swap → video_gen)
"""

import json, os

OUT_DIR = "/home/user/fuse-campaign-studio/comfyui/workflows"
REF_DIR = "references"   # relative path ComfyUI uses for LoadImage
NEG_GENERAL = "blurry, low quality, distorted, deformed, extra limbs, duplicate, watermark, text, artifacts"
NEG_VIDEO   = "blurry, low quality, distorted, duplicate frames, jitter, watermark, text"

# ─────────────────────────────────────────────────────────────────────────────
# Template definitions — every field from input_manifest + prompts
# ─────────────────────────────────────────────────────────────────────────────
TEMPLATES = [
  {
    "file": "armored_truck", "name": "ARMORED TRUCK",
    "negative": NEG_GENERAL, "img_denoise": 0.75,
    "inputs": [
      {"key":"front_outfit",  "label":"Front Outfit",  "required":True,  "hint":"Front of the product — will be worn in the armored truck heist scene."},
      {"key":"back_outfit",   "label":"Back Outfit",   "required":False, "hint":"Optional back view as the character moves in the scene."},
    ],
    "reference": None,
    "img_prompt": "Cinematic armored truck fashion photo. A figure wearing the clothing product stands next to or emerges from an armored truck in an urban setting. Security guards in background, dramatic lighting, gritty cinematic atmosphere. Tack-sharp clothing detail, high-fashion editorial quality, medium format look.",
    "vid_prompt": "Armored truck heist fashion video. Figure in the clothing product steps out of an armored truck dramatically, security escorts on each side, urban street setting, slow cinematic walk, clothing fabric moving naturally, dramatic color grade.",
  },
  {
    "file": "blue_lab_original", "name": "BLUE LAB (original)",
    "negative": "warm lighting, orange tones, dark shadows, blurry, low quality", "img_denoise": 0.73,
    "inputs": [
      {"key":"product_image", "label":"Product Image", "required":True, "hint":"White or light background preferred. Single product shot — the lab scene is generated around it."},
    ],
    "reference": None,
    "img_prompt": "Blue laboratory fashion editorial photo. A model wearing the clothing product in a futuristic lab setting — blue LED lighting, glass tubes, scientific equipment, sleek metallic surfaces. Tack-sharp clothing detail, editorial fashion quality, cinematic blue color grade.",
    "vid_prompt": "Blue lab editorial video. Model in the clothing product walks through a sleek blue-lit laboratory environment, blue light rays visible, equipment in background, slow confident walk, fabric moving naturally.",
  },
  {
    "file": "copy_of_unboxing", "name": "Copy of UNBOXING",
    "negative": "dark, messy, blurry, low quality, distorted", "img_denoise": 0.68,
    "inputs": [
      {"key":"product_image", "label":"Product",     "required":True,  "hint":"Main product being unboxed."},
      {"key":"second_item",   "label":"Second Item", "required":False, "hint":"Optional second item for the reveal."},
    ],
    "reference": None,
    "img_prompt": "Product unboxing photography, alternative angle. Side-angle view of a person opening a premium package and revealing the clothing product. Clean packaging, tissue paper, premium brand aesthetic. Soft diffused lighting, sharp clothing detail.",
    "vid_prompt": "Unboxing reveal from a side angle. Person at a table opens a package, the clothing product slowly revealed and lifted out, tissue paper moved aside, natural hand movements, premium brand aesthetic.",
  },
  {
    "file": "delivery_amazon_guy", "name": "DELIVERY (Amazon Guy)",
    "negative": "studio, fake, blurry, low quality, distorted", "img_denoise": 0.71,
    "inputs": [
      {"key":"front_outfit", "label":"Front Outfit", "required":True,  "hint":"Front of the product — will be shown delivered in the Amazon van scene."},
      {"key":"back_outfit",  "label":"Back Outfit",  "required":False, "hint":"Optional back view for more product detail."},
    ],
    "reference": None,
    "img_prompt": "Amazon delivery unboxing photo. A delivery driver in a uniform is opening a brown Amazon box to reveal the clothing product. Urban doorstep setting, natural daylight, authentic delivery aesthetic. Sharp clothing detail.",
    "vid_prompt": "Delivery unboxing video at the doorstep. Person opens an Amazon box and dramatically reveals the clothing product, pulls it out and holds it up, authentic delivery energy, natural light.",
  },
  {
    "file": "doctor", "name": "DOCTOR",
    "negative": "dark, grungy, messy, colorful chaos, blurry, low quality", "img_denoise": 0.70,
    "inputs": [
      {"key":"product_image", "label":"Product Image", "required":True, "hint":"Front-facing product on any clean background. White or light colors stand out best in the clinical setting."},
    ],
    "reference": None,
    "img_prompt": "Fashion editorial in a medical/clinical setting. A model wearing the clothing product poses in a clean clinic or hospital environment. Sterile white walls, clinical lighting, professional medical aesthetic. Sharp clothing detail, high fashion editorial quality.",
    "vid_prompt": "Clinical fashion video. Model in the clothing product walks through a clean white hospital corridor, clinical fluorescent lighting, slow confident walk, medical aesthetic, sharp clothing detail in motion.",
  },
  {
    "file": "garage_guy", "name": "GARAGE guy",
    "negative": "office, clean, bright, low quality, blurry", "img_denoise": 0.74,
    "inputs": [
      {"key":"front_top_bottoms","label":"Front Top + Bottoms","required":True,  "hint":"Front view of the full outfit — top and bottoms together on a clean background."},
      {"key":"logo",             "label":"Logo",              "required":False, "hint":"Your brand logo. Will be subtly incorporated into the scene."},
      {"key":"back_outfit",      "label":"Back Outfit",       "required":False, "hint":"Back view of the outfit for back-of-jacket or full-look detail."},
    ],
    "reference": "garage-edit.png",
    "img_prompt": "Streetwear garage editorial. A model wearing the full outfit (front and back shown) stands in a gritty urban garage or workshop. Concrete floor, tool chests, cars or motorcycles in background. Dramatic industrial lighting, tack-sharp clothing detail.",
    "vid_prompt": "Garage fashion video. Person in the clothing product moves through a gritty auto garage, leans against a car or picks up a tool, gritty urban energy, dramatic lighting, clothing fabric movement.",
  },
  {
    "file": "gas_station_w_snow", "name": "GAS STATION W SNOW",
    "negative": "daytime, warm, tropical, sunny, blurry, low quality", "img_denoise": 0.76,
    "inputs": [
      {"key":"front_top_bottoms","label":"Front Top + Bottoms","required":True,  "hint":"Front view of the full outfit on a clean background."},
      {"key":"back_top_bottoms", "label":"Back Top + Bottoms", "required":False, "hint":"Back view of the full outfit."},
      {"key":"logo",             "label":"Logo",              "required":False, "hint":"Brand logo — will appear in the gas station environment."},
    ],
    "reference": None,
    "img_prompt": "Cinematic fashion photography at a snowy gas station at night. A model wearing the full outfit — front and back details visible — stands under the gas station canopy as snow falls. Neon pump lights reflecting off wet pavement, cold blue tones, moody cinematic atmosphere. Sharp clothing texture.",
    "vid_prompt": "Gas station snow cinematic video. Model wearing the clothing walks slowly through heavy snowfall under a gas station canopy, neon signs glowing, breath visible in cold air, slow cinematic movement.",
  },
  {
    "file": "ice_2.0", "name": "ICE 2.0",
    "negative": "warm, tropical, dirty, blurry, low quality, distorted", "img_denoise": 0.74,
    "inputs": [
      {"key":"hoodie",  "label":"Hoodie",  "required":True, "hint":"The hoodie or top piece. Clean/white background preferred."},
      {"key":"bottoms", "label":"Bottoms", "required":True, "hint":"Pants or shorts. Clean/white background preferred."},
    ],
    "reference": None,
    "img_prompt": "Hyper-clean ice editorial fashion photo. A model wearing a hoodie and matching bottoms in an ultra-modern frozen environment. Crystal clear ice formations, glacial blue tones, frozen water droplets mid-air, ultra-sharp clothing detail, high-fashion editorial quality.",
    "vid_prompt": "Ice editorial video. Model with the clothing product in a frozen crystal environment, ice formations cracking around them, cold air mist, glacial blue tones, slow dramatic camera movement.",
  },
  {
    "file": "ice_original", "name": "ICE (Original)",
    "negative": "warm, summer, tropical, blurry, low quality", "img_denoise": 0.74,
    "inputs": [
      {"key":"product_image", "label":"Product Image", "required":True, "hint":"Any product. Strong color contrast against white/blue works best."},
    ],
    "reference": None,
    "img_prompt": "Frozen winter editorial fashion photo. A model wearing the clothing product in a snow-covered outdoor setting — frozen landscape, bare trees, snowflakes, cold blue-white light. Tack-sharp clothing detail, editorial fashion quality.",
    "vid_prompt": "Winter ice fashion video. Model in the clothing product in a frozen landscape, snowflakes falling slowly, breath mist visible, cold light, slow movement through snow.",
  },
  {
    "file": "jeans", "name": "JEANS",
    "negative": "indoor, dark, blurry, low quality, distorted", "img_denoise": 0.72,
    "inputs": [
      {"key":"product_image", "label":"Jeans (Front)", "required":True,  "hint":"Front view of the jeans/denim. Flat lay, worn, or folded."},
      {"key":"product_back",  "label":"Jeans (Back)",  "required":False, "hint":"Optional back view for pocket and back detail."},
    ],
    "reference": None,
    "img_prompt": "Iconic denim jeans editorial campaign photo. A model wearing the jeans in a classic campaign setting — urban rooftop or sun-lit street. Golden hour lighting, confident pose, tack-sharp denim texture and stitching detail, high-fashion campaign quality.",
    "vid_prompt": "Denim campaign video. Model in the jeans walks confidently through a sun-lit setting, the denim fabric moves naturally, golden hour light, slow cinematic tracking shot.",
  },
  {
    "file": "pack_theif_pants", "name": "PACK THEIF (Pants)",
    "negative": "bright, cheerful, office, blurry, low quality", "img_denoise": 0.73,
    "inputs": [
      {"key":"product_image", "label":"Pants (Front)", "required":True,  "hint":"Front view of the pants. Flat lay or folded works well."},
      {"key":"product_back",  "label":"Pants (Back)",  "required":False, "hint":"Optional back view for more detail in the generated output."},
    ],
    "reference": None,
    "img_prompt": "Streetwear thief aesthetic. Someone is pulling a pair of pants out of a shipping box dramatically. Urban street background, hoodie, mysterious energy. Sharp clothing detail, cinematic street photography.",
    "vid_prompt": "Streetwear thief video. A hooded character dramatically pulls the pants out of a box, holds them up to admire, turns them around showing front and back, mysterious urban energy.",
  },
  {
    "file": "paparazzi_original", "name": "PAPARAZZI (Original)",
    "negative": "studio, posed, blurry, low quality, daytime", "img_denoise": 0.72,
    "inputs": [
      {"key":"product_image", "label":"Product Image", "required":True, "hint":"Front-facing product photo on a clean background."},
    ],
    "reference": None,
    "img_prompt": "Original Paparazzi style celebrity photo. A model wearing the clothing product is caught by paparazzi leaving a fashion event or club. Camera flashes, crowd, urban night setting. Tack-sharp clothing detail.",
    "vid_prompt": "Original paparazzi video. Celebrity model leaving a venue, photographers surrounding them with cameras flashing, the model in the clothing product walks confidently through the crowd.",
  },
  {
    "file": "raven_original", "name": "RAVEN (Original)",
    "negative": "bright, cheerful, colorful, blurry, low quality", "img_denoise": 0.75,
    "inputs": [
      {"key":"product_image", "label":"Product Image", "required":True, "hint":"Front-facing product. Dark backgrounds enhance the effect."},
    ],
    "reference": "raven-original.png",
    "img_prompt": "Original Raven dark editorial fashion photo. A model wearing the clothing product in a dramatically lit dark setting. Gothic architecture, dark feathers, dramatic shadows. Tack-sharp clothing detail, cinematic color grade.",
    "vid_prompt": "Dark Raven editorial fashion film. Model in the clothing stands in dramatic low-key lighting, black feathers floating in the background, shadows playing across the fabric, Gothic high fashion energy.",
  },
  {
    "file": "raven", "name": "RAVEN",
    "negative": "bright, cheerful, colorful, warm tones, blurry, low quality", "img_denoise": 0.75,
    "inputs": [
      {"key":"front_outfit", "label":"Front Outfit", "required":True,  "hint":"Front-facing product. Dark or black backgrounds work best."},
      {"key":"back_outfit",  "label":"Back Outfit",  "required":False, "hint":"Optional back view for more detail in the editorial scene."},
    ],
    "reference": "raven-original.png",
    "img_prompt": "Dark editorial fashion photography. A model wearing the clothing product in a dramatically lit scene. Raven-black aesthetic — deep shadows, dramatic contrast, moody atmosphere. Gothic architecture or dark industrial setting. Medium format, tack sharp clothing detail, cinematic color grading with crushed blacks and desaturated palette. High fashion Vogue editorial quality.",
    "vid_prompt": "Dark moody fashion film. Model with the clothing product stands in dramatic low-key lighting, slow cinematic camera push-in, dark feathers floating in background, shadows playing across the clothing fabric, Gothic high fashion energy, slow motion fabric movement.",
  },
  {
    "file": "skate_park", "name": "SKATE PARK",
    "negative": "formal, office, dark, blurry, low quality", "img_denoise": 0.73,
    "inputs": [
      {"key":"t_shirt",     "label":"T-Shirt",      "required":True,  "hint":"Front of the t-shirt on a clean background."},
      {"key":"shorts",      "label":"Shorts",       "required":True,  "hint":"The shorts/bottoms on a clean background."},
      {"key":"sun_glasses", "label":"Sun Glasses",  "required":False, "hint":"The sunglasses or accessories."},
    ],
    "reference": None,
    "img_prompt": "Skate park street fashion editorial. A model wearing a t-shirt, shorts, and sunglasses in an urban skate park setting. Concrete ramps and rails in background, sun-drenched, authentic skate culture energy. Sharp clothing detail, street fashion quality.",
    "vid_prompt": "Skate park fashion video. Model in the t-shirt and shorts skates or walks through a sun-drenched skate park, sunglasses on, authentic street energy, clothing moving naturally.",
  },
  {
    "file": "ugc_mirror", "name": "UGC MIRROR",
    "negative": "professional studio, fake, blurry, low quality", "img_denoise": 0.69,
    "inputs": [
      {"key":"front_outfit", "label":"Front Outfit", "required":True,  "hint":"Front of the product on any clean background."},
      {"key":"back_outfit",  "label":"Back Outfit",  "required":False, "hint":"Optional back view — generates a more complete outfit mirror shot."},
    ],
    "reference": "ugc-white-girl.png",
    "img_prompt": "UGC-style selfie mirror photo. A person wearing the clothing product is taking a selfie in a bathroom or bedroom mirror. Phone visible in mirror, natural casual lighting, authentic user-generated content aesthetic. Sharp clothing detail.",
    "vid_prompt": "UGC mirror selfie video. Person wearing the clothing product films themselves in a mirror, adjusting their outfit, turning to show front and back, casual authentic energy.",
  },
  {
    "file": "ugc_studio", "name": "UGC STUDIO",
    "negative": "dark, cluttered, professional fashion, blurry, low quality", "img_denoise": 0.69,
    "inputs": [
      {"key":"front_outfit", "label":"Front Outfit", "required":True,  "hint":"Front of the product on clean/white background."},
      {"key":"back_outfit",  "label":"Back Outfit",  "required":False, "hint":"Optional back view for a full front-to-back review shot."},
    ],
    "reference": "ugc-studio.png",
    "img_prompt": "Clean studio UGC content creator photo. A person is wearing and showing off the clothing product against a clean white or light background. Natural content creator aesthetic, ring light, sharp clothing detail, honest UGC energy.",
    "vid_prompt": "UGC studio review video. Content creator wearing the clothing product does a quick outfit check, turns around to show front and back, points out details, natural talking-to-camera energy.",
  },
  {
    "file": "unboxing", "name": "UNBOXING",
    "negative": "dark, messy, blurry, low quality, distorted", "img_denoise": 0.68,
    "inputs": [
      {"key":"product_image", "label":"Product",     "required":True,  "hint":"Main product — the hero item being unboxed. Flat lay or folded."},
      {"key":"second_item",   "label":"Second Item", "required":False, "hint":"Optional second item (pants, hoodie, accessories) for the reveal."},
    ],
    "reference": None,
    "img_prompt": "Product unboxing photography. Close-up of hands opening a premium branded box to reveal the clothing product. Clean packaging, tissue paper, premium brand aesthetic. Soft diffused lighting, sharp clothing detail, luxury feel.",
    "vid_prompt": "Unboxing reveal video. Hands carefully open a package and slowly reveal the clothing product, tissue paper moved aside, premium packaging, natural hand movements, luxury brand energy.",
  },
]

PAPARAZZI_3STEP = {
  "file": "paparazzi", "name": "PAPARAZZI",
  "inputs": [
    {"key":"clothing_item", "label":"CLOTHING ITEM", "required":True, "hint":"Your product on a clean background. It will replace the shirt in the locked overhead scene."},
  ],
  "locked_ref": "paparazzi-documentation.png",
  "scene_prompt":  "Static overhead shot of a taped-down graphic t-shirt centered against a matte black backdrop. Multiple hands enter frame from all sides holding smartphones with ring lights, each screen lit bright, capturing the shirt from every angle. Shot with a medium-format film camera from directly above. Rembrandt lighting from above, dramatic shadows framing the shirt. Hyper-realistic photographic quality, fashion documentary style.",
  "scene_neg":     "blurry, low quality, distorted, side angle, people visible above waist",
  "scene_denoise": 0.80,
  "swap_prompt":   "replace all t-shirts with uploaded black product, remove hanger and tag on the right sleeve, seamless product placement, photorealistic quality, keep all hands and phones exactly in place",
  "swap_neg":      "blurry, low quality, bad quality, artifacts, distorted product",
  "swap_denoise":  0.55,
  "vid_prompt":    "Documentation overhead video. Multiple hands holding smartphones slowly circle around the clothing item laid flat on the matte black surface, ring lights glowing, each phone screen visible capturing the product. Slow cinematic rotation, dramatic top-down perspective, fashion documentary energy.",
}

# ─────────────────────────────────────────────────────────────────────────────
# Node / link builders
# ─────────────────────────────────────────────────────────────────────────────

class Counter:
    def __init__(self, start=1):
        self.n = start - 1
    def next(self):
        self.n += 1
        return self.n

def make_note(nid, title, body, x, y):
    text = f"{title}\n{body}"
    return {
        "id": nid, "type": "Note",
        "pos": [x, y], "size": {"0": 800, "1": 120},
        "flags": {}, "order": 0, "mode": 0, "inputs": [], "outputs": [],
        "properties": {"text": text},
        "widgets_values": [text],
    }

def make_checkpoint(nid, order, out_model_links, out_clip_links, out_vae_links, x=50, y=50):
    return {
        "id": nid, "type": "CheckpointLoaderSimple",
        "pos": [x, y], "size": {"0": 315, "1": 98},
        "flags": {}, "order": order, "mode": 0,
        "outputs": [
            {"name":"MODEL","type":"MODEL","links": out_model_links, "slot_index":0},
            {"name":"CLIP", "type":"CLIP", "links": out_clip_links,  "slot_index":1},
            {"name":"VAE",  "type":"VAE",  "links": out_vae_links,   "slot_index":2},
        ],
        "properties": {"Node name for S&R": "CheckpointLoaderSimple"},
        "widgets_values": ["sd_xl_base_1.0.safetensors"],
    }

def make_lora(nid, order, in_model_link, in_clip_link, out_model_links, out_clip_links, lora_name, x=420, y=50):
    return {
        "id": nid, "type": "LoraLoader",
        "pos": [x, y], "size": {"0": 315, "1": 126},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"model","type":"MODEL","link": in_model_link},
            {"name":"clip", "type":"CLIP", "link": in_clip_link},
        ],
        "outputs": [
            {"name":"MODEL","type":"MODEL","links": out_model_links, "slot_index":0},
            {"name":"CLIP", "type":"CLIP", "links": out_clip_links,  "slot_index":1},
        ],
        "properties": {"Node name for S&R": "LoraLoader"},
        "widgets_values": [lora_name, 1.0, 1.0],
    }

def make_clip_encode(nid, order, in_clip_link, out_cond_links, text, x=50, y=200):
    return {
        "id": nid, "type": "CLIPTextEncode",
        "pos": [x, y], "size": {"0": 422, "1": 164},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [{"name":"clip","type":"CLIP","link": in_clip_link}],
        "outputs": [{"name":"CONDITIONING","type":"CONDITIONING","links": out_cond_links, "slot_index":0}],
        "properties": {"Node name for S&R": "CLIPTextEncode"},
        "widgets_values": [text],
    }

def make_load_image(nid, order, out_img_links, label, hint, required, filename="product.png", x=50, y=400):
    req_tag = "★ REQUIRED" if required else "○ optional"
    return {
        "id": nid, "type": "LoadImage",
        "pos": [x, y], "size": {"0": 315, "1": 314},
        "flags": {}, "order": order, "mode": 0,
        "outputs": [
            {"name":"IMAGE","type":"IMAGE","links": out_img_links, "slot_index":0},
            {"name":"MASK", "type":"MASK", "links":[],             "slot_index":1},
        ],
        "properties": {"Node name for S&R": "LoadImage"},
        "widgets_values": [filename, "image"],
        "_label": f"{req_tag} — {label}",
        "_hint": hint,
    }

def make_image_batch(nid, order, in_img1_link, in_img2_link, out_img_links, x=400, y=400):
    return {
        "id": nid, "type": "ImageBatch",
        "pos": [x, y], "size": {"0": 210, "1": 46},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"image1","type":"IMAGE","link": in_img1_link},
            {"name":"image2","type":"IMAGE","link": in_img2_link},
        ],
        "outputs": [{"name":"IMAGE","type":"IMAGE","links": out_img_links, "slot_index":0}],
        "properties": {"Node name for S&R": "ImageBatch"},
    }

def make_vae_encode(nid, order, in_img_link, in_vae_link, out_lat_links, x=650, y=400):
    return {
        "id": nid, "type": "VAEEncode",
        "pos": [x, y], "size": {"0": 210, "1": 46},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"pixels","type":"IMAGE","link": in_img_link},
            {"name":"vae",   "type":"VAE",  "link": in_vae_link},
        ],
        "outputs": [{"name":"LATENT","type":"LATENT","links": out_lat_links, "slot_index":0}],
        "properties": {"Node name for S&R": "VAEEncode"},
    }

def make_ksampler(nid, order, in_model_link, in_pos_link, in_neg_link, in_lat_link, out_lat_links, denoise, x=900, y=200):
    return {
        "id": nid, "type": "KSampler",
        "pos": [x, y], "size": {"0": 315, "1": 262},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"model",       "type":"MODEL",       "link": in_model_link},
            {"name":"positive",    "type":"CONDITIONING","link": in_pos_link},
            {"name":"negative",    "type":"CONDITIONING","link": in_neg_link},
            {"name":"latent_image","type":"LATENT",      "link": in_lat_link},
        ],
        "outputs": [{"name":"LATENT","type":"LATENT","links": out_lat_links, "slot_index":0}],
        "properties": {"Node name for S&R": "KSampler"},
        "widgets_values": [42, "fixed", 20, 7.0, "dpmpp_2m", "karras", denoise],
    }

def make_vae_decode(nid, order, in_lat_link, in_vae_link, out_img_links, x=1270, y=200):
    return {
        "id": nid, "type": "VAEDecode",
        "pos": [x, y], "size": {"0": 210, "1": 46},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"samples","type":"LATENT","link": in_lat_link},
            {"name":"vae",    "type":"VAE",   "link": in_vae_link},
        ],
        "outputs": [{"name":"IMAGE","type":"IMAGE","links": out_img_links, "slot_index":0}],
        "properties": {"Node name for S&R": "VAEDecode"},
    }

def make_save_image(nid, order, in_img_link, prefix, x=1530, y=200):
    return {
        "id": nid, "type": "SaveImage",
        "pos": [x, y], "size": {"0": 315, "1": 270},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [{"name":"images","type":"IMAGE","link": in_img_link}],
        "outputs": [],
        "properties": {"Node name for S&R": "SaveImage"},
        "widgets_values": [prefix],
    }

def make_ipadapter_apply(nid, order, in_img_link, in_model_link, out_model_links, weight=0.80, x=900, y=600):
    return {
        "id": nid, "type": "IPAdapterApply",
        "pos": [x, y], "size": {"0": 315, "1": 200},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"ipadapter",   "type":"IPADAPTER",   "link": None},
            {"name":"clip_vision", "type":"CLIP_VISION", "link": None},
            {"name":"image",       "type":"IMAGE",        "link": in_img_link},
            {"name":"model",       "type":"MODEL",        "link": in_model_link},
        ],
        "outputs": [{"name":"MODEL","type":"MODEL","links": out_model_links, "slot_index":0}],
        "properties": {"Node name for S&R": "IPAdapterApply"},
        "widgets_values": [weight, "original", "V only", 0, 1, "concat"],
        "_note": "Connect IPAdapterModelLoader and CLIPVisionLoader from manager.",
    }

def make_animatediff(nid, order, in_model_link, out_model_links, x=50, y=900):
    return {
        "id": nid, "type": "ADE_AnimateDiffLoaderWithContext",
        "pos": [x, y], "size": {"0": 315, "1": 150},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [{"name":"model","type":"MODEL","link": in_model_link}],
        "outputs": [{"name":"MODEL","type":"MODEL","links": out_model_links, "slot_index":0}],
        "properties": {"Node name for S&R": "ADE_AnimateDiffLoaderWithContext"},
        "widgets_values": ["mm_sd_v15_v2.ckpt", "autosize", 24, None, None, None],
    }

def make_empty_latent(nid, order, out_lat_links, x=50, y=1000):
    return {
        "id": nid, "type": "EmptyLatentImage",
        "pos": [x, y], "size": {"0": 210, "1": 90},
        "flags": {}, "order": order, "mode": 0,
        "outputs": [{"name":"LATENT","type":"LATENT","links": out_lat_links, "slot_index":0}],
        "properties": {"Node name for S&R": "EmptyLatentImage"},
        "widgets_values": [512, 912, 24],
        "_note": "512×912 = 9:16 aspect ratio. 24 frames."
    }

def make_vae_decode_tiled(nid, order, in_lat_link, in_vae_link, out_img_links, x=1270, y=1000):
    return {
        "id": nid, "type": "VAEDecodeTiled",
        "pos": [x, y], "size": {"0": 210, "1": 66},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [
            {"name":"samples","type":"LATENT","link": in_lat_link},
            {"name":"vae",    "type":"VAE",   "link": in_vae_link},
        ],
        "outputs": [{"name":"IMAGE","type":"IMAGE","links": out_img_links, "slot_index":0}],
        "properties": {"Node name for S&R": "VAEDecodeTiled"},
        "widgets_values": [512],
    }

def make_vhs_combine(nid, order, in_img_link, prefix, x=1530, y=1000):
    return {
        "id": nid, "type": "VHS_VideoCombine",
        "pos": [x, y], "size": {"0": 315, "1": 200},
        "flags": {}, "order": order, "mode": 0,
        "inputs": [{"name":"images","type":"IMAGE","link": in_img_link}],
        "outputs": [],
        "properties": {"Node name for S&R": "VHS_VideoCombine"},
        "widgets_values": [24, 1, "mp4", prefix, True, True, None, "video/h264-mp4"],
    }

# ─────────────────────────────────────────────────────────────────────────────
# Build a 2-step workflow for any template config
# ─────────────────────────────────────────────────────────────────────────────
def build_2step(t):
    """
    Handles 1, 2, or 3 user inputs.
    Logo input always goes to a separate IPAdapterApply node (branding guide).
    Reference image (if present) also goes to IPAdapterApply (style guide, weight 0.5).
    """
    slug = t["file"]
    inputs = t["inputs"]
    reference = t.get("reference")
    product_inputs = [i for i in inputs if i["key"] != "logo"]
    logo_input    = next((i for i in inputs if i["key"] == "logo"), None)

    nid = Counter()
    lid = Counter()

    nodes = []
    links = []

    # ── Header note ──────────────────────────────────────────────────────────
    note_id = nid.next()
    body_lines = [f"Inputs: {', '.join(i['label']+(' ★' if i['required'] else ' ○') for i in inputs)}"]
    if reference:
        body_lines.append(f"Style reference: references/{reference}")
    body_lines += [
        "Step 1: img2img (nano_banana_pro) — KSampler denoise=" + str(t['img_denoise']),
        "Step 2: video_gen (kling) — AnimateDiff 24 frames 9:16 MP4",
        "Custom nodes: ComfyUI-AnimateDiff-Evolved · ComfyUI-IPAdapter-plus · ComfyUI-VideoHelperSuite"
    ]
    nodes.append(make_note(note_id, f"FUSE — {t['name']}", "\n".join(body_lines), 50, -150))

    # ── Checkpoint + LoRA ────────────────────────────────────────────────────
    ckpt_model_lid = lid.next()
    ckpt_clip_lid  = lid.next()
    ckpt_vae_links = []

    ckpt_id = nid.next()
    lora_id = nid.next()

    lora_model_links = []
    lora_clip_links  = []

    # VAE links — we'll assign as we need them
    vae_link_encode1 = lid.next(); ckpt_vae_links.append(vae_link_encode1)
    vae_link_decode1 = lid.next(); ckpt_vae_links.append(vae_link_decode1)
    vae_link_decode2 = lid.next(); ckpt_vae_links.append(vae_link_decode2)

    # LoRA model links — img KSampler, AnimateDiff
    lora_to_img_model = lid.next();  lora_model_links.append(lora_to_img_model)
    lora_to_anim      = lid.next();  lora_model_links.append(lora_to_anim)

    # LoRA clip links — pos/neg encode (img) + pos/neg encode (vid)
    lora_to_img_pos_clip = lid.next(); lora_clip_links.append(lora_to_img_pos_clip)
    lora_to_img_neg_clip = lid.next(); lora_clip_links.append(lora_to_img_neg_clip)
    lora_to_vid_pos_clip = lid.next(); lora_clip_links.append(lora_to_vid_pos_clip)
    lora_to_vid_neg_clip = lid.next(); lora_clip_links.append(lora_to_vid_neg_clip)

    nodes.append(make_checkpoint(ckpt_id, 1, [ckpt_model_lid], [ckpt_clip_lid], ckpt_vae_links))
    nodes.append(make_lora(lora_id, 2, ckpt_model_lid, ckpt_clip_lid, lora_model_links, lora_clip_links,
                           f"{slug}_style.safetensors"))
    links += [
        [ckpt_model_lid, ckpt_id, 0, lora_id, 0, "MODEL"],
        [ckpt_clip_lid,  ckpt_id, 1, lora_id, 1, "CLIP"],
    ]

    # ── CLIPTextEncode (img positive/negative) ───────────────────────────────
    img_pos_id = nid.next()
    img_neg_id = nid.next()
    img_pos_out = lid.next()
    img_neg_out = lid.next()
    nodes.append(make_clip_encode(img_pos_id, 3, lora_to_img_pos_clip, [img_pos_out], t["img_prompt"], x=50,  y=220))
    nodes.append(make_clip_encode(img_neg_id, 4, lora_to_img_neg_clip, [img_neg_out], t["negative"],    x=50,  y=420))
    links += [
        [lora_to_img_pos_clip, lora_id, 1, img_pos_id, 0, "CLIP"],
        [lora_to_img_neg_clip, lora_id, 1, img_neg_id, 0, "CLIP"],
        [img_pos_out, img_pos_id, 0, None, 1, "CONDITIONING"],  # placeholder; patched after KSampler created
        [img_neg_out, img_neg_id, 0, None, 2, "CONDITIONING"],
    ]

    # ── LoadImage nodes + ImageBatch chain ───────────────────────────────────
    # product_inputs — up to 3 items that get batched together
    order = 5
    load_ids = []
    load_out_links = []
    x_start = 50
    y_start = 640

    for idx, inp in enumerate(product_inputs):
        li = lid.next()
        load_id = nid.next()
        load_out_links.append(li)
        load_ids.append(load_id)
        fname = f"{inp['key']}.png"
        nodes.append(make_load_image(load_id, order, [li], inp["label"], inp["hint"], inp["required"],
                                     filename=fname, x=x_start, y=y_start + idx * 370))
        order += 1
        links.append([li, load_id, 0, None, None, "IMAGE"])  # patched below

    # Chain batches
    current_img_link = load_out_links[0]
    current_img_src_id = load_ids[0]
    current_img_src_slot = 0

    for i in range(1, len(load_out_links)):
        batch_id = nid.next()
        batch_in1 = current_img_link
        batch_in2 = load_out_links[i]
        batch_out = lid.next()
        nodes.append(make_image_batch(batch_id, order, batch_in1, batch_in2, [batch_out],
                                      x=400 + (i-1)*220, y=y_start + 160))
        # patch link targets
        _patch_link_target(links, batch_in1, batch_id, 0)
        _patch_link_target(links, batch_in2, batch_id, 1)
        links.append([batch_out, batch_id, 0, None, None, "IMAGE"])
        current_img_link = batch_out
        current_img_src_id = batch_id
        current_img_src_slot = 0
        order += 1

    # ── VAEEncode ────────────────────────────────────────────────────────────
    vae_enc_id = nid.next()
    lat_out1   = lid.next()
    nodes.append(make_vae_encode(vae_enc_id, order, current_img_link, vae_link_encode1, [lat_out1],
                                 x=800, y=y_start+160))
    _patch_link_target(links, current_img_link, vae_enc_id, 0)
    links.append([vae_link_encode1, ckpt_id, 2, vae_enc_id, 1, "VAE"])
    order += 1

    # ── Logo IPAdapter (optional, weight 0.4) ────────────────────────────────
    # Build model chain: lora → [logo_ipa] → [ref_ipa] → KSampler
    # Each stage gets a fresh link ID for its output; chain is resolved below.
    logo_ipa_id = logo_ipa_out = None
    if logo_input:
        logo_load_id  = nid.next()
        logo_img_link = lid.next()
        logo_ipa_id   = nid.next()
        logo_ipa_out  = lid.next()
        nodes.append(make_load_image(logo_load_id, order, [logo_img_link], logo_input["label"],
                                     logo_input["hint"], logo_input["required"],
                                     filename="logo.png", x=x_start, y=y_start + len(product_inputs)*370))
        nodes.append(make_ipadapter_apply(logo_ipa_id, order+1, logo_img_link, lora_to_img_model,
                                          [logo_ipa_out], weight=0.40, x=400, y=y_start + len(product_inputs)*370))
        links.append([logo_img_link,      logo_load_id, 0, logo_ipa_id, 2, "IMAGE"])
        links.append([lora_to_img_model,  lora_id,      0, logo_ipa_id, 3, "MODEL"])
        order += 2

    # ── Reference IPAdapter (style guide, weight 0.50) ───────────────────────
    ref_ipa_id = ref_ipa_out = None
    if reference:
        ref_load_id   = nid.next()
        ref_img_link  = lid.next()
        ref_ipa_id    = nid.next()
        ref_ipa_out   = lid.next()
        ref_in_model  = lid.next()  # link from previous stage → ref_ipa model input
        src_model_node  = logo_ipa_id if logo_input else lora_id
        nodes.append(make_load_image(ref_load_id, order, [ref_img_link],
                                     "Style Reference (LOCKED)", "Pre-set reference image — do not change.",
                                     False, filename=f"references/{reference}",
                                     x=x_start+350, y=y_start + (len(product_inputs)+bool(logo_input))*370))
        nodes.append(make_ipadapter_apply(ref_ipa_id, order+1, ref_img_link, ref_in_model,
                                          [ref_ipa_out], weight=0.50, x=700, y=y_start + (len(product_inputs)+bool(logo_input))*370))
        links.append([ref_img_link,   ref_load_id,    0, ref_ipa_id, 2, "IMAGE"])
        links.append([ref_in_model,   src_model_node, 0, ref_ipa_id, 3, "MODEL"])
        order += 2

    # ── KSampler (image_edit) ─────────────────────────────────────────────────
    # Determine the model link into KSampler (end of the chain)
    if ref_ipa_out:
        ks1_model_link = ref_ipa_out
        ks1_model_src  = ref_ipa_id
    elif logo_ipa_out:
        ks1_model_link = logo_ipa_out
        ks1_model_src  = logo_ipa_id
    else:
        ks1_model_link = lora_to_img_model
        ks1_model_src  = None  # emitted as direct link record below

    ks1_id     = nid.next()
    ks1_lat_out = lid.next()
    nodes.append(make_ksampler(ks1_id, order, ks1_model_link, img_pos_out, img_neg_out, lat_out1,
                               [ks1_lat_out], t["img_denoise"], x=1100, y=220))
    _patch_link_target(links, img_pos_out, ks1_id, 1)
    _patch_link_target(links, img_neg_out, ks1_id, 2)
    if ks1_model_src:
        links.append([ks1_model_link, ks1_model_src, 0, ks1_id, 0, "MODEL"])
    else:
        links.append([lora_to_img_model, lora_id, 0, ks1_id, 0, "MODEL"])
    order += 1

    # ── VAEDecode → SaveImage ─────────────────────────────────────────────────
    vd1_id        = nid.next()
    save1_id      = nid.next()
    save1_in_link = lid.next()
    vd1_to_vid_link = lid.next()
    # Output link list set directly — no orphaned placeholder link record needed
    nodes.append(make_vae_decode(vd1_id, order, ks1_lat_out, vae_link_decode1, [save1_in_link, vd1_to_vid_link],
                                 x=1470, y=220))
    links.append([vae_link_decode1, ckpt_id, 2, vd1_id, 1, "VAE"])
    order += 1

    nodes.append(make_save_image(save1_id, order, save1_in_link, f"fuse_{slug}_image", x=1730, y=220))
    links.append([save1_in_link, vd1_id, 0, save1_id, 0, "IMAGE"])
    order += 1

    # ── Video section ─────────────────────────────────────────────────────────
    vid_y = 1200
    anim_id   = nid.next()
    anim_out  = lid.next()
    nodes.append(make_animatediff(anim_id, order, lora_to_anim, [anim_out], x=50, y=vid_y))
    links.append([lora_to_anim, lora_id, 0, anim_id, 0, "MODEL"])
    order += 1

    vid_pos_id  = nid.next(); vid_pos_out = lid.next()
    vid_neg_id  = nid.next(); vid_neg_out = lid.next()
    nodes.append(make_clip_encode(vid_pos_id, order,   lora_to_vid_pos_clip, [vid_pos_out], t["vid_prompt"],  x=420, y=vid_y))
    nodes.append(make_clip_encode(vid_neg_id, order+1, lora_to_vid_neg_clip, [vid_neg_out], NEG_VIDEO,         x=420, y=vid_y+200))
    links += [
        [lora_to_vid_pos_clip, lora_id, 1, vid_pos_id, 0, "CLIP"],
        [lora_to_vid_neg_clip, lora_id, 1, vid_neg_id, 0, "CLIP"],
    ]
    order += 2

    # IPAdapter: feed edited image into AnimateDiff for visual consistency
    ipa_vid_id  = nid.next(); ipa_vid_out = lid.next()
    nodes.append(make_ipadapter_apply(ipa_vid_id, order, vd1_to_vid_link, anim_out, [ipa_vid_out],
                                      weight=0.80, x=900, y=vid_y))
    links += [
        [vd1_to_vid_link, vd1_id, 0, ipa_vid_id, 2, "IMAGE"],
        [anim_out, anim_id, 0, ipa_vid_id, 3, "MODEL"],
    ]
    order += 1

    elat_id  = nid.next(); elat_out = lid.next()
    nodes.append(make_empty_latent(elat_id, order, [elat_out], x=50, y=vid_y+250))
    order += 1

    ks2_id   = nid.next(); ks2_lat_out = lid.next()
    nodes.append(make_ksampler(ks2_id, order, ipa_vid_out, vid_pos_out, vid_neg_out, elat_out,
                               [ks2_lat_out], 1.0, x=900, y=vid_y+300))
    links += [
        [ipa_vid_out, ipa_vid_id, 0, ks2_id, 0, "MODEL"],
        [vid_pos_out, vid_pos_id, 0, ks2_id, 1, "CONDITIONING"],
        [vid_neg_out, vid_neg_id, 0, ks2_id, 2, "CONDITIONING"],
        [elat_out, elat_id, 0, ks2_id, 3, "LATENT"],
    ]
    order += 1

    vdt_id  = nid.next(); vdt_out = lid.next()
    nodes.append(make_vae_decode_tiled(vdt_id, order, ks2_lat_out, vae_link_decode2, [vdt_out], x=1270, y=vid_y+300))
    links += [
        [ks2_lat_out, ks2_id, 0, vdt_id, 0, "LATENT"],
        [vae_link_decode2, ckpt_id, 2, vdt_id, 1, "VAE"],
    ]
    order += 1

    vhs_id = nid.next()
    vhs_in = lid.next()
    nodes.append(make_vhs_combine(vhs_id, order, vhs_in, f"fuse_{slug}_video", x=1530, y=vid_y+300))
    links.append([vhs_in, vdt_id, 0, vhs_id, 0, "IMAGE"])

    # ── Groups ───────────────────────────────────────────────────────────────
    groups = [
        {"title":f"Step 1: image_edit (nano_banana_pro) — {t['name']}", "bounding":[40,160,1950,900], "color":"#3d5e8a"},
        {"title":"Step 2: video_gen (kling / AnimateDiff 9:16)",         "bounding":[40,1150,1900,700],"color":"#5e3d8a"},
    ]

    return _wrap(nodes, links, groups, t["name"], slug, ["image_edit","video_gen"],
                 {"nano_banana_pro":"KSampler img2img","kling":"AnimateDiff+IPAdapter+VHS"})


def _patch_link_target(links, link_id, node_id, slot):
    """Find link by id and fill in target node/slot (placeholder None values)."""
    for lk in links:
        if lk[0] == link_id and lk[3] is None:
            lk[3] = node_id
            lk[4] = slot
            return

def _wrap(nodes, links, groups, name, slug, steps, equiv):
    return {
        "last_node_id": max(n["id"] for n in nodes),
        "last_link_id": max(lk[0] for lk in links),
        "nodes": nodes,
        "links": links,
        "groups": groups,
        "config": {},
        "extra": {
            "fuse_template": name,
            "fuse_file": slug,
            "pipeline_steps": steps,
            "comfyui_equivalents": equiv,
            "required_custom_nodes": [
                "ComfyUI-AnimateDiff-Evolved",
                "ComfyUI-IPAdapter-plus",
                "ComfyUI-VideoHelperSuite (VHS)",
            ],
        },
        "version": 0.4,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PAPARAZZI 3-step
# ─────────────────────────────────────────────────────────────────────────────
def build_paparazzi(t):
    slug = t["file"]
    nid = Counter(); lid = Counter()
    nodes = []; links = []

    # Header
    note_id = nid.next()
    nodes.append(make_note(note_id,
        "FUSE — PAPARAZZI (3-step)",
        "Step 1 scene_gen: locked ref + clothing → overhead scene\n"
        "Step 2 product_swap: replace shirt with user clothing (denoise=0.55)\n"
        "Step 3 video_gen: AnimateDiff 24 frames 9:16",
        50, -160))

    # Checkpoint + LoRA
    cm_lid = lid.next(); cc_lid = lid.next()
    vae1 = lid.next(); vae2 = lid.next(); vae3 = lid.next(); vae4 = lid.next()

    lm1 = lid.next(); lm2 = lid.next(); lm3 = lid.next()
    lc1 = lid.next(); lc2 = lid.next(); lc3 = lid.next(); lc4 = lid.next(); lc5 = lid.next(); lc6 = lid.next()

    ckpt_id = nid.next(); lora_id = nid.next()
    nodes += [
        make_checkpoint(ckpt_id, 1, [cm_lid], [cc_lid], [vae1,vae2,vae3,vae4]),
        make_lora(lora_id, 2, cm_lid, cc_lid, [lm1,lm2,lm3], [lc1,lc2,lc3,lc4,lc5,lc6],
                  "paparazzi_style.safetensors"),
    ]
    links += [
        [cm_lid, ckpt_id, 0, lora_id, 0, "MODEL"],
        [cc_lid, ckpt_id, 1, lora_id, 1, "CLIP"],
        [vae1, ckpt_id, 2, None, None, "VAE"],
        [vae2, ckpt_id, 2, None, None, "VAE"],
        [vae3, ckpt_id, 2, None, None, "VAE"],
        [vae4, ckpt_id, 2, None, None, "VAE"],
    ]

    # ── Step 1: scene_gen ────────────────────────────────────────────────────
    y1 = 200
    sp_id = nid.next(); sp_out = lid.next()
    sn_id = nid.next(); sn_out = lid.next()
    nodes.append(make_clip_encode(sp_id, 3, lc1, [sp_out], t["scene_prompt"],  x=50,  y=y1))
    nodes.append(make_clip_encode(sn_id, 4, lc2, [sn_out], t["scene_neg"],     x=50,  y=y1+210))
    links += [[lc1,lora_id,1,sp_id,0,"CLIP"],[lc2,lora_id,1,sn_id,0,"CLIP"]]

    # Locked reference (overhead documentation image)
    locked_load_id = nid.next(); locked_img_link = lid.next()
    nodes.append(make_load_image(locked_load_id, 5, [locked_img_link],
                                 "LOCKED REFERENCE — paparazzi overhead scene",
                                 "Do NOT change. This is the locked scene reference from the Weavy template.",
                                 False, filename=f"references/{t['locked_ref']}", x=50, y=y1+450))
    links.append([locked_img_link, locked_load_id, 0, None, None, "IMAGE"])

    # User clothing input
    cloth_load_id = nid.next(); cloth_img_link = lid.next()
    inp = t["inputs"][0]
    nodes.append(make_load_image(cloth_load_id, 6, [cloth_img_link],
                                 inp["label"], inp["hint"], inp["required"],
                                 filename="clothing_item.png", x=420, y=y1+450))
    links.append([cloth_img_link, cloth_load_id, 0, None, None, "IMAGE"])

    # Batch locked_ref + clothing for scene_gen context
    batch1_id = nid.next(); batch1_out = lid.next()
    nodes.append(make_image_batch(batch1_id, 7, locked_img_link, cloth_img_link, [batch1_out], x=750, y=y1+450))
    _patch_link_target(links, locked_img_link, batch1_id, 0)
    _patch_link_target(links, cloth_img_link,  batch1_id, 1)
    links.append([batch1_out, batch1_id, 0, None, None, "IMAGE"])

    # VAEEncode → KSampler (scene)
    ve1_id = nid.next(); ve1_out = lid.next()
    nodes.append(make_vae_encode(ve1_id, 8, batch1_out, vae1, [ve1_out], x=1020, y=y1+450))
    _patch_link_target(links, batch1_out, ve1_id, 0)
    _patch_link_target(links, vae1, ckpt_id, ve1_id); links.append([vae1,ckpt_id,2,ve1_id,1,"VAE"])

    ks1_id = nid.next(); ks1_out = lid.next()
    nodes.append(make_ksampler(ks1_id, 9, lm1, sp_out, sn_out, ve1_out, [ks1_out], t["scene_denoise"], x=1300, y=y1))
    _patch_link_target(links, sp_out, ks1_id, 1)
    _patch_link_target(links, sn_out, ks1_id, 2)
    links += [[lm1,lora_id,0,ks1_id,0,"MODEL"],[ve1_out,ve1_id,0,ks1_id,3,"LATENT"]]

    vd1_id = nid.next(); vd1_out = lid.next()
    nodes.append(make_vae_decode(vd1_id, 10, ks1_out, vae2, [vd1_out], x=1670, y=y1))
    links += [[ks1_out,ks1_id,0,vd1_id,0,"LATENT"],[vae2,ckpt_id,2,vd1_id,1,"VAE"]]

    save1_id = nid.next(); s1_in = lid.next()
    nodes.append(make_save_image(save1_id, 11, s1_in, "fuse_paparazzi_scene", x=1930, y=y1))
    vd1_to_swap = lid.next()
    links.append([s1_in, vd1_id, 0, save1_id, 0, "IMAGE"])
    for n in nodes:
        if n["id"] == vd1_id:
            n["outputs"][0]["links"] = [s1_in, vd1_to_swap]

    # ── Step 2: product_swap ─────────────────────────────────────────────────
    y2 = 1300
    wp_id = nid.next(); wp_out = lid.next()
    wn_id = nid.next(); wn_out = lid.next()
    nodes.append(make_clip_encode(wp_id, 12, lc3, [wp_out], t["swap_prompt"], x=50,  y=y2))
    nodes.append(make_clip_encode(wn_id, 13, lc4, [wn_out], t["swap_neg"],    x=50,  y=y2+210))
    links += [[lc3,lora_id,1,wp_id,0,"CLIP"],[lc4,lora_id,1,wn_id,0,"CLIP"]]

    ve2_id = nid.next(); ve2_out = lid.next()
    nodes.append(make_vae_encode(ve2_id, 14, vd1_to_swap, vae3, [ve2_out], x=500, y=y2+120))
    links += [[vd1_to_swap,vd1_id,0,ve2_id,0,"IMAGE"],[vae3,ckpt_id,2,ve2_id,1,"VAE"]]

    ks2_id = nid.next(); ks2_out = lid.next()
    nodes.append(make_ksampler(ks2_id, 15, lm2, wp_out, wn_out, ve2_out, [ks2_out], t["swap_denoise"], x=900, y=y2))
    _patch_link_target(links, wp_out, ks2_id, 1)
    _patch_link_target(links, wn_out, ks2_id, 2)
    links += [[lm2,lora_id,0,ks2_id,0,"MODEL"],[ve2_out,ve2_id,0,ks2_id,3,"LATENT"]]

    vd2_id = nid.next(); vd2_out = lid.next()
    nodes.append(make_vae_decode(vd2_id, 16, ks2_out, vae4, [vd2_out], x=1270, y=y2))
    links += [[ks2_out,ks2_id,0,vd2_id,0,"LATENT"],[vae4,ckpt_id,2,vd2_id,1,"VAE"]]

    save2_id = nid.next(); s2_in = lid.next()
    nodes.append(make_save_image(save2_id, 17, s2_in, "fuse_paparazzi_swapped", x=1530, y=y2))
    vd2_to_vid = lid.next()
    links.append([s2_in, vd2_id, 0, save2_id, 0, "IMAGE"])
    for n in nodes:
        if n["id"] == vd2_id:
            n["outputs"][0]["links"] = [s2_in, vd2_to_vid]

    # ── Step 3: video_gen ────────────────────────────────────────────────────
    y3 = 2400
    anim_id = nid.next(); anim_out = lid.next()
    nodes.append(make_animatediff(anim_id, 18, lm3, [anim_out], x=50, y=y3))
    links.append([lm3,lora_id,0,anim_id,0,"MODEL"])

    vp_id = nid.next(); vp_out = lid.next()
    vn_id = nid.next(); vn_out = lid.next()
    nodes.append(make_clip_encode(vp_id, 19, lc5, [vp_out], t["vid_prompt"], x=420, y=y3))
    nodes.append(make_clip_encode(vn_id, 20, lc6, [vn_out], NEG_VIDEO,       x=420, y=y3+200))
    links += [[lc5,lora_id,1,vp_id,0,"CLIP"],[lc6,lora_id,1,vn_id,0,"CLIP"]]

    ipa_id = nid.next(); ipa_out = lid.next()
    nodes.append(make_ipadapter_apply(ipa_id, 21, vd2_to_vid, anim_out, [ipa_out], 0.80, x=900, y=y3))
    links += [[vd2_to_vid,vd2_id,0,ipa_id,2,"IMAGE"],[anim_out,anim_id,0,ipa_id,3,"MODEL"]]

    el_id = nid.next(); el_out = lid.next()
    nodes.append(make_empty_latent(el_id, 22, [el_out], x=50, y=y3+300))

    ks3_id = nid.next(); ks3_out = lid.next()
    nodes.append(make_ksampler(ks3_id, 23, ipa_out, vp_out, vn_out, el_out, [ks3_out], 1.0, x=900, y=y3+300))
    links += [[ipa_out,ipa_id,0,ks3_id,0,"MODEL"],
              [vp_out,vp_id,0,ks3_id,1,"CONDITIONING"],
              [vn_out,vn_id,0,ks3_id,2,"CONDITIONING"],
              [el_out,el_id,0,ks3_id,3,"LATENT"]]

    vae5 = lid.next()
    links.append([vae5, ckpt_id, 2, None, None, "VAE"])
    vdt_id = nid.next(); vdt_out = lid.next()
    nodes.append(make_vae_decode_tiled(vdt_id, 24, ks3_out, vae5, [vdt_out], x=1270, y=y3+300))
    links += [[ks3_out,ks3_id,0,vdt_id,0,"LATENT"],[vae5,ckpt_id,2,vdt_id,1,"VAE"]]

    vhs_id = nid.next(); vhs_in = lid.next()
    nodes.append(make_vhs_combine(vhs_id, 25, vhs_in, "fuse_paparazzi_video", x=1530, y=y3+300))
    links.append([vhs_in, vdt_id, 0, vhs_id, 0, "IMAGE"])

    groups = [
        {"title":"Step 1: scene_gen (locked ref + clothing → overhead scene)",  "bounding":[40,160,2050,1000],"color":"#3d5e8a"},
        {"title":"Step 2: product_swap (scene → replace shirt, denoise=0.55)",   "bounding":[40,1250,1850,900],"color":"#3d8a5e"},
        {"title":"Step 3: video_gen (kling / AnimateDiff 9:16)",                 "bounding":[40,2350,1900,700],"color":"#5e3d8a"},
    ]
    return _wrap(nodes, links, groups, "PAPARAZZI", slug,
                 ["scene_gen","product_swap","video_gen"],
                 {"nano_banana_pro":"KSampler img2img","kling":"AnimateDiff+IPAdapter+VHS"})


# ─────────────────────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────────────────────
os.makedirs(OUT_DIR, exist_ok=True)

for t in TEMPLATES:
    wf = build_2step(t)
    path = f"{OUT_DIR}/{t['file']}_workflow.json"
    with open(path, "w") as f:
        json.dump(wf, f, indent=2)
    n_inputs = len(t["inputs"])
    has_ref  = "+" if t["reference"] else " "
    print(f"✓ {t['file']}_workflow.json  inputs={n_inputs}{has_ref}  — {t['name']}")

wf = build_paparazzi(PAPARAZZI_3STEP)
path = f"{OUT_DIR}/paparazzi_workflow.json"
with open(path, "w") as f:
    json.dump(wf, f, indent=2)
print(f"✓ paparazzi_workflow.json  3-step + locked-ref  — PAPARAZZI")

print(f"\n✅ Generated {len(TEMPLATES)+1} workflows.")
