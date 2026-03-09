// ============================================================
// FUSE V6 — STEPS PIPELINE WORKER
// Template contract system: each template defines a locked
// execution pipeline with a user-facing input_manifest.
// Users never see nodes — only the clean input form.
// ============================================================

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

// ============== BUNDLED TEMPLATES (fallback when R2 is empty) ==============
const BUNDLED_TEMPLATES = {
  "armored_truck_template": {
    "name": "ARMORED TRUCK",
    "slug": "armored-truck",
    "version": "1.0",
    "description": "Armored truck heist aesthetic — guards, dramatic cinematic, product drop energy.",
    "category": "Street",
    "tags": [
      "street",
      "cinematic",
      "heist",
      "drop",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 572,
    "is_active": true,
    "asset_requirements": "Any bold statement piece. The cinematic heist scene is generated around it.",
    "input_manifest": [
      {
        "key": "clothing",
        "label": "Clothing",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "The clothing item — will be worn in the armored truck heist scene."
      },
      {
        "key": "logo",
        "label": "Logo",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Brand logo — will be featured on the armored truck."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Cinematic armored truck fashion photo. A figure wearing the clothing product stands next to or emerges from an armored truck. Urban city setting, dramatic cinematography, security guards in background. The clothing worn with extreme confidence — this is a high-value drop. Think Supreme or Kanye drop energy. Cinematic color grade, dramatic low-angle perspective.",
        "user_prompt_key": null,
        "user_input_keys": [
          "clothing",
          "logo"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 12,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Armored truck heist fashion video. Figure in the clothing product steps out of an armored truck dramatically, security escorts, cinematic slow-motion walk, urban backdrop, dramatic color grade, the clothing shown prominently as the figure moves with confidence. High-value drop energy.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image", "image", "image", "image", "image", "image",
        "image", "image", "image", "image", "image", "image",
        "video"
      ]
    }
  },
  "blue_lab_original_template": {
    "name": "BLUE LAB (original)",
    "slug": "blue-lab-original",
    "version": "1.0",
    "description": "Blue laboratory aesthetic — scientific editorial, cool tones, futuristic and clean.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "lab",
      "futuristic",
      "blue",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "White/light background preferred. Light-colored products create the most striking blue contrast.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product Image",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "White or light background preferred. Single product shot — the lab scene is generated around it."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Blue laboratory fashion editorial photo. A model wearing the clothing product in a futuristic lab setting — blue LED lighting, clean white surfaces, scientific equipment in background. Cool blue color palette, crisp and modern. The clothing product glows in the blue light. Think Apple lab meets fashion editorial. Hyper-clean, modern, aspirational.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Blue lab editorial video. Model in the clothing product walks through a sleek blue-lit laboratory environment, blue light plays across the fabric, slow tracking camera shot, clean white and blue aesthetic, the clothing shown in detail as the model moves through the space.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "copy_of_unboxing_template": {
    "name": "Copy of UNBOXING",
    "slug": "copy-of-unboxing",
    "version": "1.0",
    "description": "Unboxing variant — alternative side-angle for product reveal content.",
    "category": "UGC",
    "tags": [
      "ugc",
      "unboxing",
      "variant",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Product on clean background. Add a second item for a full set reveal.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Main product being unboxed."
      },
      {
        "key": "second_item",
        "label": "Second Item",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional second item for the reveal."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Product unboxing photography, alternative angle. Side-angle view of a person opening a premium package and revealing the clothing product on a wooden table or marble surface. Natural window light, the person hands and slight torso visible, casual but styled. The clothing product is the clear hero item being revealed.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image",
          "second_item"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Unboxing reveal from a side angle. Person at a table opens a package, the clothing product slowly revealed and lifted out, held up and admired, slight turn to show product details. Natural light from the side, casual home setting, authentic content creator energy.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "delivery_amazon_guy_template": {
    "name": "DELIVERY (Amazon Guy)",
    "slug": "delivery-amazon-guy",
    "version": "1.0",
    "description": "Amazon delivery driver reveals your product at the doorstep. Viral unboxing energy.",
    "category": "UGC",
    "tags": [
      "ugc",
      "delivery",
      "unboxing",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Any product photo. The delivery scene is generated around it.",
    "input_manifest": [
      {
        "key": "front_outfit",
        "label": "Front Outfit",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front of the product — will be shown delivered in the Amazon van scene."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for more product detail."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Amazon delivery unboxing photo. A delivery driver in a uniform is opening a brown Amazon box to reveal the clothing product. Doorstep setting, suburban house door background, the clothing product is being pulled out of the box dramatically. Natural daylight, photorealistic, the clothing clearly visible and detailed.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_outfit",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Delivery unboxing video at the doorstep. Person opens an Amazon box and dramatically reveals the clothing product, pulls it out and holds it up, surprised and excited expression, suburban doorstep, natural light, the clothing shown clearly throughout.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "doctor_template": {
    "name": "DOCTOR",
    "slug": "doctor",
    "version": "1.0",
    "description": "Medical professional aesthetic — clean clinical setting meets high fashion. Unexpected and sharp.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "clinical",
      "unexpected",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Any clean product photo. White/light clothing creates strongest contrast against the clinical environment.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product Image",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front-facing product on any clean background. White or light colors stand out best in the clinical setting."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Fashion editorial in a medical/clinical setting. A model wearing the clothing product poses in a clean clinic or hospital hallway. Sterile white walls, clinical lighting, stainless steel elements in background. The fashion clothing contrasts sharply with the medical environment. Think Balenciaga runway meets ER. The clothing product is crisp, detailed, and clearly shown.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Clinical fashion video. Model in the clothing product walks through a clean white hospital corridor, clinical fluorescent lighting, sterile environment creates high contrast with the fashion clothing, slow confident walk, camera tracks alongside the model.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "garage_guy_template": {
    "name": "GARAGE guy",
    "slug": "garage-guy",
    "version": "1.0",
    "description": "Garage mechanic aesthetic — gritty industrial setting, grease and grit meets fashion.",
    "category": "Street",
    "tags": [
      "street",
      "garage",
      "industrial",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "preview_url": "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/assets/references/garage-edit.png",
    "asset_requirements": "Upload your outfit front, brand logo, and back. All on clean backgrounds.",
    "input_manifest": [
      {
        "key": "front_top_bottoms",
        "label": "Front Top + Bottoms",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front view of the full outfit — top and bottoms together on a clean background."
      },
      {
        "key": "logo",
        "label": "Logo",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Your brand logo. Will be subtly incorporated into the scene."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Back view of the outfit for back-of-jacket or full-look detail."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Streetwear garage editorial. A model wearing the full outfit (front and back shown) stands in a gritty urban garage or workshop. The brand logo visible in the environment. Raw cinematic lighting, concrete floors, car parts, industrial energy. The outfit is the hero — clothing shown in full detail. Think Supreme x mechanic shop aesthetic.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_top_bottoms",
          "logo",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Garage fashion video. Person in the clothing product moves through a gritty auto garage, leans against a car or picks up a tool, the clothing contrasts with the industrial environment, camera moves slowly around the subject, the clothing fabric and details shown clearly.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "gas_station_w_snow_template": {
    "name": "GAS STATION W SNOW",
    "slug": "gas-station-snow",
    "version": "1.0",
    "description": "Gas station at night in the snow — moody cinematic, neon reflections, cold weather fashion.",
    "category": "Street",
    "tags": [
      "street",
      "winter",
      "cinematic",
      "night",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Upload front and back of your full outfit. Logo optional. Clean backgrounds preferred.",
    "input_manifest": [
      {
        "key": "front_top_bottoms",
        "label": "Front Top + Bottoms",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front view of the full outfit on a clean background."
      },
      {
        "key": "back_top_bottoms",
        "label": "Back Top + Bottoms",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Back view of the full outfit."
      },
      {
        "key": "logo",
        "label": "Logo",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Brand logo — will appear in the gas station environment."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Cinematic fashion photography at a snowy gas station at night. A model wearing the full outfit — front and back details shown — stands under harsh fluorescent gas station lights with snow falling around them. The brand logo glows somewhere in the scene. Cinematic color grade, cold blue atmosphere, streetwear energy.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_top_bottoms",
          "back_top_bottoms",
          "logo"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Gas station snow cinematic video. Model wearing the clothing walks slowly through heavy snowfall under a gas station canopy, snow blowing around them, neon reflections on the ground, breath visible, the clothing moves naturally in the wind, moody cinematic camera movement.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "ice_2.0_template": {
    "name": "ICE 2.0",
    "slug": "ice-2",
    "version": "1.0",
    "description": "Icy cold aesthetic evolved — crystal-clear editorial. The next generation of cold.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "ice",
      "winter",
      "futuristic",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Upload hoodie and bottoms separately on clean/white backgrounds.",
    "input_manifest": [
      {
        "key": "hoodie",
        "label": "Hoodie",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "The hoodie or top piece. Clean/white background preferred."
      },
      {
        "key": "bottoms",
        "label": "Bottoms",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Pants or shorts. Clean/white background preferred."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Hyper-clean ice editorial fashion photo. A model wearing a hoodie and matching bottoms in an ultra-modern frozen environment — crystal clear ice formations, blue-white color palette, cold vapor mist. Futuristic winter aesthetic, the full outfit contrasts beautifully against the icy background. Studio strobe lighting with blue gels, tack-sharp clothing details, editorial magazine quality.",
        "user_prompt_key": null,
        "user_input_keys": [
          "hoodie",
          "bottoms"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Ice editorial video. Model with the clothing product in a frozen crystal environment, ice formations cracking around them, cold breath mist, slow orbit camera revealing the clothing in icy blue light, frost particles floating. Ultra-modern winter aesthetic.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "ice_original_template": {
    "name": "ICE (Original)",
    "slug": "ice-original",
    "version": "1.0",
    "description": "Original ice and snow aesthetic — frozen editorial, timeless winter look.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "ice",
      "winter",
      "original",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Any product. Strong color contrast against white/blue works best.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product Image",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Any product. Strong color contrast against white/blue works best."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Frozen winter editorial fashion photo. A model wearing the clothing product in a snow-covered outdoor setting — frozen lake, snowy field, or icy landscape. Cold blue-white atmosphere, breath visible in the cold air, snowflakes or frost on surfaces. The clothing contrasts with the white winter environment. Timeless winter fashion editorial quality.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Winter ice fashion video. Model in the clothing product in a frozen landscape, snowflakes falling slowly, breath mist visible, the clothing moves in a cold wind, slow orbit camera revealing the winter scene. Peaceful and striking winter editorial.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "jeans_template": {
    "name": "JEANS",
    "slug": "jeans",
    "version": "1.0",
    "description": "Denim editorial — classic jeans campaign. Timeless fashion imagery, iconic denim energy.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "denim",
      "jeans",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Clear shot of the denim/pants. Front required, back view optional.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Jeans (Front)",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front view of the jeans/denim. Flat lay, worn, or folded."
      },
      {
        "key": "product_back",
        "label": "Jeans (Back)",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for pocket and back detail."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Iconic denim jeans editorial campaign photo. A model wearing the jeans in a classic campaign setting — may be an urban rooftop, industrial loft, or sun-drenched outdoor location. Clean, simple, confident. The jeans are the hero item — texture, fit, wash, and back pocket detail all crisp and clear. Classic denim brand energy. Natural warm light, medium format photography quality.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image",
          "product_back"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Denim campaign video. Model in the jeans walks confidently through a sun-lit setting, the denim fabric moves naturally, camera follows at medium distance, slow-motion walk cycle, jeans texture and fit clearly shown. Classic denim brand aesthetic, warm golden light.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "pack_theif_pants_template": {
    "name": "PACK THEIF (Pants)",
    "slug": "pack-theif-pants",
    "version": "1.0",
    "description": "Thief-style unboxing — sneaky character stealing pants from a box. Street fashion energy.",
    "category": "Street",
    "tags": [
      "street",
      "unboxing",
      "pants",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Clear shot of the pants. Front required, back view optional.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Pants (Front)",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front view of the pants. Flat lay or folded works well."
      },
      {
        "key": "product_back",
        "label": "Pants (Back)",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for more detail in the generated output."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Streetwear thief aesthetic. Someone is pulling a pair of pants out of a shipping box dramatically. Urban street background, hooded figure, cinematic low-angle shot, the pants are the hero item shown prominently. Graffiti background, cinematic color grade, high fashion streetwear energy.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image",
          "product_back"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Streetwear thief video. A hooded character dramatically pulls the pants out of a box, holds them up to admire, turns them to show both sides. Urban street setting, cinematic camera move, streetwear fashion energy, the pants shown clearly throughout.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "paparazzi_original_template": {
    "name": "PAPARAZZI (Original)",
    "slug": "paparazzi-original",
    "version": "1.0",
    "description": "Original Paparazzi template. The classic version — celebrity street energy, camera flashes.",
    "category": "Street",
    "tags": [
      "street",
      "paparazzi",
      "original",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Front-facing product photo on a clean background.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product Image",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front-facing product photo on a clean background."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Original Paparazzi style celebrity photo. A model wearing the clothing product is caught by paparazzi leaving a fashion event. Photographers with cameras visible, camera flash lighting effect, the model looks effortlessly stylish and caught mid-stride. Slightly candid feel but the clothing is clearly detailed and beautiful. 35mm film photography quality.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Original paparazzi video. Celebrity model leaving a venue, photographers surrounding them with cameras flashing, the model walks through confidently, the clothing shown beautifully in the flash-lit chaos, classic celebrity street photography motion.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "paparazzi_template": {
    "name": "PAPARAZZI",
    "slug": "paparazzi",
    "version": "1.0",
    "description": "Paparazzi-style candid shots. Camera flashes, fashion week chaos, celebrity energy.",
    "category": "Street",
    "tags": [
      "street",
      "paparazzi",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Front-facing outfit on clean background. Back view optional for more angles.",
    "input_manifest": [
      {
        "key": "front_outfit",
        "label": "Front Outfit",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front-facing product on a clean/white background."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for additional outfit detail."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Paparazzi celebrity street photography. A model wearing the clothing product walks through a crowd of aggressive photographers. Camera flashes popping everywhere, chaotic fashion week sidewalk, the model looks iconic and confident. Shot on 35mm film, high contrast, cinematic grain, editorial quality. The clothing product is clearly visible and photorealistic.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_outfit",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Paparazzi scene in motion. The model walks confidently through a crowd of photographers, cameras flashing rapidly, dynamic handheld camera movement, bokeh background of press photographers. The clothing shown prominently as the model moves through fashion week chaos.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "raven_original_template": {
    "name": "RAVEN (Original)",
    "slug": "raven-original",
    "version": "1.0",
    "description": "Original Raven template — dark editorial, moody cinematic. The OG version of the iconic style.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "dark",
      "original",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Front-facing product. Dark backgrounds enhance the effect.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product Image",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front-facing product. Dark backgrounds enhance the effect."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Original Raven dark editorial fashion photo. A model wearing the clothing product in a dramatically lit dark setting. Gothic or industrial background, deep shadows, single dramatic key light illuminating the model and clothing. Raven feathers or dark organic elements in the scene. The clothing shown in sharp detail against the dark background. High contrast, desaturated, cinematic and moody.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Dark Raven editorial fashion film. Model in the clothing stands in dramatic low-key lighting, black feathers floating in the air, slow cinematic camera orbit, deep shadows and strong highlights on the clothing, gothic atmosphere, the fabric catches the light dramatically.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "raven_template": {
    "name": "RAVEN",
    "slug": "raven",
    "version": "1.0",
    "description": "Dark editorial — moody cinematic, raven aesthetic, high fashion. Deep shadows, dramatic contrast.",
    "category": "Editorial",
    "tags": [
      "editorial",
      "dark",
      "cinematic",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "preview_url": "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/assets/references/raven-original.png",
    "asset_requirements": "Front-facing product. Dark/black backgrounds enhance the raven aesthetic.",
    "input_manifest": [
      {
        "key": "front_outfit",
        "label": "Front Outfit",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front-facing product. Dark or black backgrounds work best."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for more detail in the editorial scene."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Dark editorial fashion photography. A model wearing the clothing product in a dramatically lit scene. Raven-black aesthetic — deep shadows, dramatic contrast, moody atmosphere. Gothic architecture or dark industrial setting. Medium format, tack sharp clothing detail, cinematic color grading with crushed blacks and desaturated palette. High fashion Vogue editorial quality.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_outfit",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Dark moody fashion film. Model with the clothing product stands in dramatic low-key lighting, slow cinematic camera push-in, dark feathers floating in background, shadows playing across the clothing fabric, Gothic high fashion energy, slow motion fabric movement.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "skate_park_template": {
    "name": "SKATE PARK",
    "slug": "skate-park",
    "version": "1.0",
    "description": "Skate park environment — street fashion meets skating culture. Raw, energetic, youth culture.",
    "category": "Street",
    "tags": [
      "street",
      "skate",
      "youth",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Upload t-shirt, shorts, and sunglasses separately on clean backgrounds.",
    "input_manifest": [
      {
        "key": "t_shirt",
        "label": "T-Shirt",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front of the t-shirt on a clean background."
      },
      {
        "key": "shorts",
        "label": "Shorts",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "The shorts/bottoms on a clean background."
      },
      {
        "key": "sun_glasses",
        "label": "Sun Glasses",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "The sunglasses or accessories."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Skate park street fashion editorial. A model wearing a t-shirt, shorts, and sunglasses in an urban skate park setting. Concrete bowls and rails in background, natural sunlight, relaxed confident energy. The clothing shown clearly in motion or posed at the skate park. Street photography quality, authentic skate culture aesthetic.",
        "user_prompt_key": null,
        "user_input_keys": [
          "t_shirt",
          "shorts",
          "sun_glasses"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Skate park fashion video. Model in the t-shirt and shorts skates or walks through a sun-drenched skate park, sunglasses on, confident energy, the clothing shown in natural motion. Camera follows at low angle, urban concrete backdrop.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "ugc_mirror_template": {
    "name": "UGC MIRROR",
    "slug": "ugc-mirror",
    "version": "1.0",
    "description": "User-generated content style — selfie mirror shot. Raw, authentic, relatable.",
    "category": "UGC",
    "tags": [
      "ugc",
      "mirror",
      "selfie",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "preview_url": "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/assets/references/ugc-white-girl.png",
    "asset_requirements": "Product on clean background. Back view optional for a more complete outfit shot.",
    "input_manifest": [
      {
        "key": "front_outfit",
        "label": "Front Outfit",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front of the product on any clean background."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view — generates a more complete outfit mirror shot."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "UGC-style selfie mirror photo. A person wearing the clothing product is taking a selfie in a bathroom or bedroom mirror. Casual authentic vibe, phone camera perspective, natural lighting or ring light, vertical format. The clothing is clearly shown in the mirror reflection. Real person energy, not overly polished, Instagram UGC content creator aesthetic.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_outfit",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "UGC mirror selfie video. Person wearing the clothing product films themselves in a mirror, adjusting their outfit, turning slightly to show different angles, casual phone recording movement, slight shaky cam for authenticity, natural lighting, relatable content creator vibe.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "ugc_studio_template": {
    "name": "UGC STUDIO",
    "slug": "ugc-studio",
    "version": "1.0",
    "description": "Clean studio UGC — influencer holding product. Professional but authentic.",
    "category": "UGC",
    "tags": [
      "ugc",
      "studio",
      "clean",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "preview_url": "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/assets/references/ugc-studio.png",
    "asset_requirements": "Product on white or light background for cleanest result.",
    "input_manifest": [
      {
        "key": "front_outfit",
        "label": "Front Outfit",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Front of the product on clean/white background."
      },
      {
        "key": "back_outfit",
        "label": "Back Outfit",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional back view for a full front-to-back review shot."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Clean studio UGC content creator photo. A person is wearing and showing off the clothing product against a clean white or light gray background. Ring light setup, direct camera facing shot, casual but styled, TikTok creator energy. The clothing product is the clear hero, crisp and detailed. Authentic Instagram/TikTok creator vibe.",
        "user_prompt_key": null,
        "user_input_keys": [
          "front_outfit",
          "back_outfit"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "UGC studio review video. Content creator wearing the clothing product does a quick outfit check, turns around to show front and back, points to details, clean studio background, natural lighting, TikTok/Reels format content creator energy.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  },
  "unboxing_template": {
    "name": "UNBOXING",
    "slug": "unboxing",
    "version": "1.0",
    "description": "Clean unboxing reveal — hands opening the package, product reveal moment. Classic viral format.",
    "category": "UGC",
    "tags": [
      "ugc",
      "unboxing",
      "reveal",
      "video"
    ],
    "output_type": "video",
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Product on clean background. Add a second item for a full set reveal.",
    "input_manifest": [
      {
        "key": "product_image",
        "label": "Product",
        "type": "image",
        "required": true,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Main product — the hero item being unboxed. Flat lay or folded."
      },
      {
        "key": "second_item",
        "label": "Second Item",
        "type": "image",
        "required": false,
        "accepts": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "max_size_mb": 10,
        "hint": "Optional second item (pants, hoodie, accessories) for the reveal."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Product unboxing photography. Close-up of hands opening a premium branded box to reveal the clothing product. Clean packaging, the clothing product neatly folded inside, crisp and clear. If multiple items provided, both are shown in the box. Top-down view, minimal aesthetic, the product is the star of the reveal moment.",
        "user_prompt_key": null,
        "user_input_keys": [
          "product_image",
          "second_item"
        ],
        "locked_inputs": [],
        "settings": {
          "resolution": "2K",
          "num_images": 1,
          "output_format": "png"
        }
      },
      {
        "id": "video_gen",
        "type": "kling",
        "prompt": "Unboxing reveal video. Hands carefully open a package and slowly reveal the clothing product, tissue paper moved aside, the product lifted out dramatically and held up to the camera, the fabric unfolds naturally. Satisfying unboxing ASMR energy, the clothing shown clearly.",
        "user_prompt_key": null,
        "image_source": "previous_step",
        "settings": {
          "model": "kling-v1-6",
          "duration": "10",
          "aspect_ratio": "9:16",
          "cfg_scale": 0.5,
          "mode": "std"
        }
      }
    ],
    "outputs": {
      "primary_type": "video",
      "items": [
        "image",
        "video"
      ]
    }
  }
};


// ============== AUTH ==============
function checkAuth(request, env) {
  const apiKey = request.headers.get("X-Api-Key");
  if (apiKey && apiKey === env.FUSE_API_KEY) {
    return request.headers.get("X-User-Id") || "api-user";
  }
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    if (env.FUSE_API_KEY && token === env.FUSE_API_KEY) return "bearer-user";
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.sub) return payload.sub;
    } catch {}
  }
  throw new Error("Unauthorized");
}

// ============== SUPABASE ==============
async function sbFetch(env, path, opts = {}) {
  // Always use anon key — RLS policy "open_worker_access" allows all worker writes.
  // Service role key is intentionally not used here to avoid invalid-key errors.
  const key = env.SUPABASE_ANON_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function updateProject(env, projectId, updates) {
  await sbFetch(env, `/projects?id=eq.${projectId}`, { method: "PATCH", body: updates });
}

async function getProject(env, projectId) {
  const res = await sbFetch(env, `/projects?id=eq.${projectId}&select=*`);
  if (!res.ok) throw new Error("Project not found");
  const rows = await res.json();
  return rows[0];
}

async function createProjectRow(env, userId, templateName, userInputs) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userIdForDb = UUID_RE.test(userId) ? userId : null;

  const res = await sbFetch(env, "/projects", {
    method: "POST",
    body: {
      user_id: userIdForDb,
      template_name: templateName,
      status: "queued",
      progress: 0,
      user_inputs: userInputs || {},
      outputs: { items: [] },
      logs: [`[${new Date().toISOString()}] Project created`],
      error: null,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Project creation failed: ${txt}`);
  }
  const rows = await res.json();
  return rows[0];
}

// ============== R2 HELPERS ==============

function getBundledTemplate(templateName) {
  const key = `${templateName.toLowerCase().replace(/\s+/g, "_")}_template`;
  return BUNDLED_TEMPLATES[key] || null;
}

async function loadTemplateFromR2(env, templateName) {
  // Normalize: lowercase, strip parens, collapse spaces → underscores
  const key = `${templateName.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, "_")}_template.json`;
  try {
    if (env.FUSE_TEMPLATES) {
      const obj = await env.FUSE_TEMPLATES.get(key);
      if (obj) return JSON.parse(await obj.text());
    }
  } catch (e) {
    console.error(`R2 load failed for ${key}:`, e.message);
  }
  const bundled = getBundledTemplate(templateName);
  if (bundled) return bundled;
  throw new Error(`Template not found: ${templateName}`);
}

async function storeInR2(env, r2Key, data, contentType) {
  await env.FUSE_ASSETS.put(r2Key, data, { httpMetadata: { contentType } });
}

// ============== TEMPLATE CONTRACT HELPERS ==============

/**
 * Get the input manifest from a template.
 * Supports both new format (input_manifest) and legacy (user_inputs).
 */
function getInputManifest(template) {
  return template.input_manifest || template.user_inputs || [];
}

/**
 * Resolve a user input value (URL or R2 key) to a full URL.
 */
function resolveInputUrl(value) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("uploads/") || value.startsWith("outputs/")) {
    return `${WORKER_URL}/assets/${value}`;
  }
  return value;
}

/**
 * Build the final prompt for a step.
 * Composition: prompt_prefix + user_prompt (if user_prompt_key set) + prompt_suffix
 */
function buildStepPrompt(step, userInputs) {
  const prefix = step.prompt || step.prompt_prefix || "";
  const suffix = step.prompt_suffix || "";
  const userKey = step.user_prompt_key;
  const userText = userKey ? (userInputs?.[userKey] || "").trim() : "";

  if (userText) {
    return [prefix, userText, suffix].filter(Boolean).join(" ");
  }
  return [prefix, suffix].filter(Boolean).join(" ");
}

// ============== FAL API (NANO BANANA PRO) ==============
async function callNanoBananaPro(env, prompt, imageUrls, settings) {
  if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not configured");

  const payload = {
    prompt,
    num_images: settings?.num_images || 1,
    output_format: settings?.output_format || "png",
  };
  // fal nano-banana-pro/edit expects image_url (singular) as the primary input
  if (imageUrls && imageUrls.length > 0) {
    payload.image_url = imageUrls[0];
    // Additional images as reference context
    if (imageUrls.length > 1) payload.reference_image_urls = imageUrls.slice(1);
  }

  const res = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FAL submit error (${res.status}): ${err.slice(0, 500)}`);
  }

  const { request_id } = await res.json();
  if (!request_id) throw new Error("FAL: no request_id returned");

  // Poll status endpoint for completion (max 10 min)
  const statusBase = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${request_id}`;
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    try {
      const statusRes = await fetch(`${statusBase}/status`, {
        headers: { Authorization: `Key ${env.FAL_API_KEY}` },
      });
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        // Fetch the actual result
        const resultRes = await fetch(statusBase, {
          headers: { Authorization: `Key ${env.FAL_API_KEY}` },
        });
        const result = await resultRes.json();
        // Return all images (num_images may be > 1)
        const urls = (result.images || (result.image ? [result.image] : [])).map(i => i.url).filter(Boolean);
        if (!urls.length) throw new Error("FAL completed but no image URL in response");
        const buffers = await Promise.all(urls.map(async (url) => {
          const r = await fetch(url);
          if (!r.ok) throw new Error("Failed to download FAL image");
          return r.arrayBuffer();
        }));
        return buffers; // always an array
      }
      if (statusData.status === "FAILED") {
        throw new Error(`FAL failed: ${statusData.error || "Unknown"}`);
      }
    } catch (e) {
      if (e.message && (e.message.includes("FAL failed") || e.message.includes("no image URL"))) throw e;
    }
  }
  throw new Error("FAL timed out after 10 minutes");
}

// ============== KLING VIA FAL.AI ==============
async function callKlingViaFal(env, imageUrl, prompt, settings) {
  if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not configured");

  const payload = {
    prompt,
    image_url: imageUrl,
    duration: settings?.duration || "5",
    aspect_ratio: settings?.aspect_ratio || "9:16",
    cfg_scale: settings?.cfg_scale ?? 0.5,
    negative_prompt: settings?.negative_prompt || "blur, distort, and low quality",
  };

  const res = await fetch("https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video", {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling (fal) submit failed (${res.status}): ${err.slice(0, 500)}`);
  }

  const { request_id } = await res.json();
  if (!request_id) throw new Error("Kling (fal): no request_id returned");

  // Poll for completion (max 30 min)
  const statusBase = `https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/requests/${request_id}`;
  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    try {
      const statusRes = await fetch(`${statusBase}/status`, {
        headers: { Authorization: `Key ${env.FAL_API_KEY}` },
      });
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        const resultRes = await fetch(statusBase, {
          headers: { Authorization: `Key ${env.FAL_API_KEY}` },
        });
        const result = await resultRes.json();
        const videoUrl = result?.video?.url;
        if (!videoUrl) throw new Error("Kling (fal) completed but no video URL in response");
        const vid = await fetch(videoUrl);
        if (!vid.ok) throw new Error("Failed to download Kling video from fal");
        return await vid.arrayBuffer();
      }
      if (statusData.status === "FAILED") {
        throw new Error(`Kling (fal) failed: ${statusData.error || "Unknown"}`);
      }
    } catch (e) {
      if (e.message && (e.message.includes("FAILED") || e.message.includes("no video URL"))) throw e;
    }
  }
  throw new Error("Kling (fal) timed out after 30 minutes");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============== PIPELINE RUNNER ==============
async function runPipeline(env, projectId) {
  try {
    const project = await getProject(env, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const template = await loadTemplateFromR2(env, project.template_name);
    const userInputs = (project.user_inputs || {});

    await updateProject(env, projectId, {
      status: "running",
      progress: 10,
      logs: [`[${new Date().toISOString()}] Pipeline started — ${project.template_name}`],
    });

    const outputs = { items: [] };
    let lastImageBuffer = null;
    let lastImageKey = null;

    for (let si = 0; si < template.steps.length; si++) {
      const step = template.steps[si];
      const progress = 10 + Math.floor(((si + 0.5) / template.steps.length) * 80);
      const ts = () => new Date().toISOString();

      await updateProject(env, projectId, {
        progress,
        logs: [`[${ts()}] Step ${si + 1}/${template.steps.length}: ${step.id} (${step.type})`],
      });

      if (step.type === "nano_banana_pro") {
        // Collect image URLs from user inputs mapped via input_manifest
        const manifest = getInputManifest(template);
        const imageUrls = [];

        // Add locked reference images first
        for (const ref of step.locked_inputs || []) {
          const url = resolveInputUrl(ref);
          if (url) imageUrls.push(url);
        }

        // Add user-uploaded images in manifest order
        for (const key of step.user_input_keys || []) {
          // Find the input in manifest to validate type
          const field = manifest.find((f) => f.key === key);
          const val = userInputs[key];
          if (val && (!field || field.type === "image")) {
            const url = resolveInputUrl(val);
            if (url) imageUrls.push(url);
          }
        }

        const prompt = buildStepPrompt(step, userInputs);
        const settings = step.settings || {};

        console.log(`[${projectId}][${step.id}] FAL: ${imageUrls.length} images, prompt: "${prompt.slice(0, 80)}..."`);

        const imageBuffers = await callNanoBananaPro(env, prompt, imageUrls, settings);
        for (let imgIdx = 0; imgIdx < imageBuffers.length; imgIdx++) {
          const imgKey = `outputs/${projectId}/${step.id}_${Date.now()}_${imgIdx}.png`;
          await storeInR2(env, imgKey, imageBuffers[imgIdx], "image/png");
          if (imgIdx === 0) { lastImageKey = imgKey; lastImageBuffer = imageBuffers[0]; }
          outputs.items.push({ type: "image", step_id: step.id, url: `${WORKER_URL}/assets/${imgKey}` });
        }

        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else if (step.type === "kling") {
        // Determine source image
        let sourceImageUrl;
        if (step.image_source === "previous_step") {
          if (!lastImageKey) throw new Error("No previous image available for Kling step");
          sourceImageUrl = `${WORKER_URL}/assets/${lastImageKey}`;
        } else {
          const item = outputs.items.find((x) => x.step_id === step.image_source);
          if (!item) throw new Error(`Step not found: ${step.image_source}`);
          sourceImageUrl = item.url.startsWith("http") ? item.url : `${WORKER_URL}${item.url}`;
        }

        const prompt = buildStepPrompt(step, userInputs);
        const settings = step.settings || {};

        console.log(`[${projectId}][${step.id}] Kling via fal: duration=${settings.duration || "5"}, aspect=${settings.aspect_ratio || "9:16"}`);

        const videoBuffer = await callKlingViaFal(env, sourceImageUrl, prompt, settings);
        const videoKey = `outputs/${projectId}/${step.id}_${Date.now()}.mp4`;
        await storeInR2(env, videoKey, videoBuffer, "video/mp4");

        outputs.items.push({
          type: "video",
          step_id: step.id,
          url: `${WORKER_URL}/assets/${videoKey}`,
        });

        await updateProject(env, projectId, { progress: progress + 5, outputs });

      } else {
        console.warn(`[${projectId}] Unknown step type: ${step.type} — skipping`);
      }
    }

    await updateProject(env, projectId, {
      status: "complete",
      progress: 100,
      outputs,
      completed_at: new Date().toISOString(),
    });

    console.log(`[${projectId}] Pipeline complete — ${outputs.items.length} outputs`);

  } catch (err) {
    console.error(`[${projectId}] Pipeline error:`, err);
    await updateProject(env, projectId, {
      status: "failed",
      error: (err.message || "Unknown error").slice(0, 5000),
      failed_at: new Date().toISOString(),
    });
  }
}

// ============== ROUTE HANDLERS ==============

async function handleHealth(env) {
  return Response.json({
    ok: true,
    service: "fuse-worker-v6",
    timestamp: new Date().toISOString(),
    bindings: {
      fal: !!env.FAL_API_KEY,
      kling_via_fal: !!env.FAL_API_KEY,
      r2_templates: !!env.FUSE_TEMPLATES,
      r2_assets: !!env.FUSE_ASSETS,
      supabase: !!env.SUPABASE_URL,
    },
  });
}

function templateToApiShape(t) {
  const manifest = getInputManifest(t);
  return {
    id: t.name,
    name: t.name,
    slug: t.slug || t.name.toLowerCase().replace(/\s+/g, "-"),
    description: t.description || null,
    category: t.category || null,
    output_type: t.output_type || "video",
    estimated_credits_per_run: t.estimated_credits_per_run || 50,
    is_active: t.is_active !== false,
    input_schema: manifest,
    preview_url: t.preview_url || null,
    tags: t.tags || null,
    asset_requirements: t.asset_requirements || null,
    output_count: t.outputs?.items?.length || (t.output_type === "video" ? 2 : 1),
  };
}

async function handleListTemplates(env) {
  const templates = [];
  // Try R2 first
  try {
    if (env.FUSE_TEMPLATES) {
      const list = await env.FUSE_TEMPLATES.list();
      for (const obj of list.objects) {
        if (!obj.key.endsWith("_template.json")) continue;
        try {
          const text = await (await env.FUSE_TEMPLATES.get(obj.key)).text();
          templates.push(templateToApiShape(JSON.parse(text)));
        } catch (e) {
          console.error(`Failed to parse R2 template ${obj.key}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("R2 list failed:", e.message);
  }

  // Fall back to bundled templates if R2 returned nothing
  if (templates.length === 0) {
    for (const t of Object.values(BUNDLED_TEMPLATES)) {
      if (t.is_active !== false) templates.push(templateToApiShape(t));
    }
  }

  templates.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json(templates);
}

async function handleGetTemplate(env, nameOrKey) {
  // nameOrKey can be "garage_guy_template.json" (full R2 key from frontend)
  // or "GARAGE guy" (template name). Normalize to load from R2.
  let template;
  if (nameOrKey.endsWith("_template.json")) {
    // Direct R2 key — load directly
    const obj = await env.FUSE_TEMPLATES.get(decodeURIComponent(nameOrKey));
    if (!obj) return Response.json({ error: `Template not found: ${nameOrKey}` }, { status: 404 });
    template = JSON.parse(await obj.text());
  } else {
    template = await loadTemplateFromR2(env, nameOrKey);
  }
  // Map input_manifest → user_inputs for frontend compatibility
  const manifest = getInputManifest(template);
  return Response.json({
    ...template,
    user_inputs: manifest,
    input_manifest: manifest,
    asset_requirements: template.asset_requirements || null,
  });
}

async function handleCreateProject(request, env) {
  const userId = checkAuth(request, env);
  const body = await request.json();

  const templateName = (body.template_name || body.template_id || "").trim();
  const userInputs = body.user_inputs || body.inputs || {};

  if (!templateName) {
    return Response.json({ error: "Missing template_name" }, { status: 400 });
  }

  const project = await createProjectRow(env, userId, templateName, userInputs);
  return Response.json(
    { ok: true, project_id: project.id, projectId: project.id, status: project.status, credits_used: 50 },
    { status: 201 }
  );
}

async function handleEnqueue(request, env, ctx) {
  checkAuth(request, env);
  const body = await request.json();
  const projectId = body.project_id || body.projectId;
  if (!projectId) return Response.json({ error: "Missing project_id / projectId" }, { status: 400 });
  ctx.waitUntil(runPipeline(env, projectId));
  return Response.json({ ok: true, queued: true, projectId });
}

async function handleGetProject(request, env, projectId) {
  checkAuth(request, env);
  const project = await getProject(env, projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const outputs = project.outputs || { items: [] };
  return Response.json({
    ok: true,
    id: project.id,
    status: project.status,
    progress: project.progress || 0,
    outputs,
    logs: project.logs || [],
    attempts: project.attempts || 0,
    maxAttempts: project.max_attempts || 3,
    result_url: outputs.items?.[0]?.url || null,
    error: project.error || null,
  });
}

async function handleUploadFile(request, env) {
  checkAuth(request, env);
  const fd = await request.formData();
  const file = fd.get("file");
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = (file.name || "").split(".").pop() || "png";
  const key = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  await env.FUSE_ASSETS.put(key, file.stream(), { httpMetadata: { contentType: file.type || "image/png" } });

  return Response.json({ ok: true, key, imageUrl: `${WORKER_URL}/assets/${key}` });
}

async function handleUploadTemplate(request, env) {
  checkAuth(request, env);
  const { name, template } = await request.json();
  if (!name || !template) return Response.json({ error: "Missing name or template" }, { status: 400 });

  const key = `${name.toLowerCase().replace(/\s+/g, "_")}_template.json`;
  await env.FUSE_TEMPLATES.put(key, JSON.stringify(template, null, 2));
  return Response.json({ ok: true, message: `Template "${name}" uploaded as ${key}`, key });
}

async function handleServeAsset(env, assetPath) {
  const obj = await env.FUSE_ASSETS.get(decodeURIComponent(assetPath));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

// ============== MAIN ==============
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-User-Id, X-Service-Call",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const wrap = (res) => {
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) h.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    };

    try {
      let response;

      if (path === "/health")                                           response = await handleHealth(env);
      else if (path.startsWith("/assets/"))                            response = await handleServeAsset(env, path.slice("/assets/".length));
      else if (path === "/api/templates" && request.method === "GET")  { response = await handleListTemplates(env); }
      else if (path.startsWith("/api/templates/") && request.method === "GET") { checkAuth(request, env); response = await handleGetTemplate(env, path.slice("/api/templates/".length)); }
      else if (path === "/api/upload" && request.method === "POST")    response = await handleUploadFile(request, env);
      else if (path === "/api/uploads" && request.method === "POST")   response = await handleUploadFile(request, env);
      else if (path === "/api/projects" && request.method === "POST")  response = await handleCreateProject(request, env);
      else if (path === "/api/enqueue" && request.method === "POST")   response = await handleEnqueue(request, env, ctx);
      else if (path.startsWith("/api/projects/") && request.method === "GET") { const id = path.slice("/api/projects/".length); response = await handleGetProject(request, env, id); }
      else if (path === "/admin/upload-template" && request.method === "POST") response = await handleUploadTemplate(request, env);
      else if (path === "/debug-routes")                               response = Response.json({ ok: true, version: "v6", routes: ["GET /health", "GET /assets/:key", "GET /api/templates", "GET /api/templates/:name", "POST /api/upload", "POST /api/uploads", "POST /api/projects", "POST /api/enqueue", "GET /api/projects/:id", "POST /admin/upload-template"] });
      else                                                             response = Response.json({ error: "Not found" }, { status: 404 });

      return wrap(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("Unauthorized") ? 401 : 500;
      console.error(`[worker] ${path}: ${msg}`);
      return wrap(Response.json({ error: msg }, { status }));
    }
  },
};
