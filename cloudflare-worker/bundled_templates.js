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
    "estimated_credits_per_run": 50,
    "is_active": true,
    "asset_requirements": "Any bold statement piece. The cinematic heist scene is generated around it.",
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
        "hint": "Front of the product — will be worn in the armored truck heist scene."
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
        "hint": "Optional back view as the character moves in the scene."
      }
    ],
    "steps": [
      {
        "id": "image_edit",
        "type": "nano_banana_pro",
        "prompt": "Cinematic armored truck fashion photo. A figure wearing the clothing product stands next to or emerges from an armored truck. Urban city setting, dramatic cinematography, security guards in background. The clothing worn with extreme confidence — this is a high-value drop. Think Supreme or Kanye drop energy. Cinematic color grade, dramatic low-angle perspective.",
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
        "image",
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