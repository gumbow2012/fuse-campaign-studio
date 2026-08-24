/**
 * FUSE Cinema — builtin COLOR palettes.
 *
 * Version-controlled CODE DATA (generated + hand-authored), not database rows.
 * Nothing here is seeded to Supabase and no credits are spent: every swatch is
 * a literal hex value.
 */

import type { ColorPalette, PartialDirectorConfig } from "../types";

export type ColorPresetCategory =
  | "Natural"
  | "Film"
  | "Blockbuster"
  | "Fashion"
  | "Streetwear"
  | "Music Video"
  | "Luxury"
  | "Jewelry"
  | "Horror"
  | "Sci-Fi"
  | "Vintage"
  | "Experimental";

export type CinemaColorPreset = {
  id: string;
  name: string;
  category: ColorPresetCategory;
  tags: string[];
  config: PartialDirectorConfig;
};

export const COLOR_PRESET_CATEGORIES: ColorPresetCategory[] = ["Natural", "Film", "Blockbuster", "Fashion", "Streetwear", "Music Video", "Luxury", "Jewelry", "Horror", "Sci-Fi", "Vintage", "Experimental"];

export const COLOR_PRESETS: CinemaColorPreset[] = [
  {
    "id": "color-clean-daylight",
    "name": "Clean Daylight",
    "category": "Natural",
    "tags": [
      "daylight",
      "neutral",
      "documentary"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1d2228",
              "name": "shadow"
            },
            {
              "hex": "#5c6a74",
              "name": "midtone"
            },
            {
              "hex": "#a9b6bd",
              "name": "accent"
            },
            {
              "hex": "#e8eef1",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-overcast-soft",
    "name": "Overcast Soft",
    "category": "Natural",
    "tags": [
      "overcast",
      "soft",
      "grey"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#22262a",
              "name": "shadow"
            },
            {
              "hex": "#5a6167",
              "name": "midtone"
            },
            {
              "hex": "#98a1a7",
              "name": "accent"
            },
            {
              "hex": "#dfe3e6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 40,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-golden-hour",
    "name": "Golden Hour",
    "category": "Natural",
    "tags": [
      "sunset",
      "warm",
      "glow"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#2a1d14",
              "name": "shadow"
            },
            {
              "hex": "#7d4f2c",
              "name": "midtone"
            },
            {
              "hex": "#d59a58",
              "name": "accent"
            },
            {
              "hex": "#f7e0bd",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 18,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-blue-hour",
    "name": "Blue Hour",
    "category": "Natural",
    "tags": [
      "dusk",
      "cool",
      "calm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#12161f",
              "name": "shadow"
            },
            {
              "hex": "#2f3b52",
              "name": "midtone"
            },
            {
              "hex": "#5d708f",
              "name": "accent"
            },
            {
              "hex": "#b9c4d6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": -16,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-open-shade",
    "name": "Open Shade",
    "category": "Natural",
    "tags": [
      "shade",
      "cool",
      "even"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#191d21",
              "name": "shadow"
            },
            {
              "hex": "#4d5760",
              "name": "midtone"
            },
            {
              "hex": "#8b969f",
              "name": "accent"
            },
            {
              "hex": "#d5dce1",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-window-light",
    "name": "Window Light",
    "category": "Natural",
    "tags": [
      "interior",
      "soft",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1e2023",
              "name": "shadow"
            },
            {
              "hex": "#5b5e63",
              "name": "midtone"
            },
            {
              "hex": "#a5a9ae",
              "name": "accent"
            },
            {
              "hex": "#f0f1f2",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-forest-green",
    "name": "Forest Green",
    "category": "Natural",
    "tags": [
      "nature",
      "green",
      "organic"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#141a15",
              "name": "shadow"
            },
            {
              "hex": "#33472f",
              "name": "midtone"
            },
            {
              "hex": "#6d8a5c",
              "name": "accent"
            },
            {
              "hex": "#cbd9b6",
              "name": "highlight"
            }
          ],
          "shadowHue": "green",
          "midtoneHue": "green",
          "highlightHue": "chartreuse",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "chartreuse",
            "green"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-desert-noon",
    "name": "Desert Noon",
    "category": "Natural",
    "tags": [
      "hot",
      "dry",
      "sand"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#2b241a",
              "name": "shadow"
            },
            {
              "hex": "#7a6a4c",
              "name": "midtone"
            },
            {
              "hex": "#c6b287",
              "name": "accent"
            },
            {
              "hex": "#f3ead6",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": 12,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-coastal-air",
    "name": "Coastal Air",
    "category": "Natural",
    "tags": [
      "sea",
      "airy",
      "teal"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#161e21",
              "name": "shadow"
            },
            {
              "hex": "#3d5a5e",
              "name": "midtone"
            },
            {
              "hex": "#7ba3a5",
              "name": "accent"
            },
            {
              "hex": "#dceeee",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "teal",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "cyan",
            "neutral",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-snowfield",
    "name": "Snowfield",
    "category": "Natural",
    "tags": [
      "snow",
      "cold",
      "bright"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1c2126",
              "name": "shadow"
            },
            {
              "hex": "#59656e",
              "name": "midtone"
            },
            {
              "hex": "#b3c0c9",
              "name": "accent"
            },
            {
              "hex": "#f6fafc",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -10,
          "tint": 0,
          "contrast": 45,
          "saturation": 50,
          "blackBehavior": "neutral",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "natural",
          "highlights": 54,
          "shadows": 46,
          "blacks": 50,
          "whites": 46,
          "fade": 8,
          "grain": 6,
          "sharpness": 60,
          "halation": 4,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-kodak-5219-night",
    "name": "Kodak 5219 Night",
    "category": "Film",
    "tags": [
      "kodak",
      "tungsten",
      "night"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0f1218",
              "name": "shadow"
            },
            {
              "hex": "#2b3547",
              "name": "midtone"
            },
            {
              "hex": "#5f6c84",
              "name": "accent"
            },
            {
              "hex": "#c3ccdb",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-kodak-2383-print",
    "name": "Kodak 2383 Print",
    "category": "Film",
    "tags": [
      "print",
      "filmic",
      "classic"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#191410",
              "name": "shadow"
            },
            {
              "hex": "#5a4634",
              "name": "midtone"
            },
            {
              "hex": "#b0906c",
              "name": "accent"
            },
            {
              "hex": "#efe2cd",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-vision3-250d",
    "name": "Vision3 250D",
    "category": "Film",
    "tags": [
      "daylight",
      "stock",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1a1e21",
              "name": "shadow"
            },
            {
              "hex": "#556169",
              "name": "midtone"
            },
            {
              "hex": "#a5b1b8",
              "name": "accent"
            },
            {
              "hex": "#eef2f4",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-portra-400",
    "name": "Portra 400",
    "category": "Film",
    "tags": [
      "portrait",
      "creamy",
      "pastel"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#221b19",
              "name": "shadow"
            },
            {
              "hex": "#6d5850",
              "name": "midtone"
            },
            {
              "hex": "#c7a495",
              "name": "accent"
            },
            {
              "hex": "#f6e7dd",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "amber",
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-ektachrome",
    "name": "Ektachrome",
    "category": "Film",
    "tags": [
      "slide",
      "saturated",
      "vivid"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#111a20",
              "name": "shadow"
            },
            {
              "hex": "#2f5a6b",
              "name": "midtone"
            },
            {
              "hex": "#5fa2ad",
              "name": "accent"
            },
            {
              "hex": "#e2f0ef",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 66,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-fuji-eterna",
    "name": "Fuji Eterna",
    "category": "Film",
    "tags": [
      "low-con",
      "muted",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1d2023",
              "name": "shadow"
            },
            {
              "hex": "#5d646a",
              "name": "midtone"
            },
            {
              "hex": "#a2a9ae",
              "name": "accent"
            },
            {
              "hex": "#e6e9ea",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 42,
          "saturation": 36,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cinestill-800t",
    "name": "Cinestill 800T",
    "category": "Film",
    "tags": [
      "halation",
      "tungsten",
      "neon"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d1119",
              "name": "shadow"
            },
            {
              "hex": "#33384f",
              "name": "midtone"
            },
            {
              "hex": "#7a6b84",
              "name": "accent"
            },
            {
              "hex": "#e6cfd4",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "violet",
          "highlightHue": "red",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 58,
          "dominantHues": [
            "blue",
            "red",
            "violet"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-bleach-bypass",
    "name": "Bleach Bypass",
    "category": "Film",
    "tags": [
      "silver",
      "harsh",
      "desat"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#151719",
              "name": "shadow"
            },
            {
              "hex": "#585c60",
              "name": "midtone"
            },
            {
              "hex": "#aeb2b5",
              "name": "accent"
            },
            {
              "hex": "#f4f6f7",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 78,
          "saturation": 18,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 58,
          "shadows": 42,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-technicolor-three-strip",
    "name": "Technicolor Three-Strip",
    "category": "Film",
    "tags": [
      "technicolor",
      "rich",
      "classic"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1a0f12",
              "name": "shadow"
            },
            {
              "hex": "#7a2230",
              "name": "midtone"
            },
            {
              "hex": "#d38a53",
              "name": "accent"
            },
            {
              "hex": "#f3e2c4",
              "name": "highlight"
            }
          ],
          "shadowHue": "rose",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 72,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "amber",
            "red",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-super-16-grain",
    "name": "Super 16 Grain",
    "category": "Film",
    "tags": [
      "grain",
      "gritty",
      "16mm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1b1a18",
              "name": "shadow"
            },
            {
              "hex": "#5b564d",
              "name": "midtone"
            },
            {
              "hex": "#a29a8b",
              "name": "accent"
            },
            {
              "hex": "#e8e3d8",
              "name": "highlight"
            }
          ],
          "shadowHue": "yellow",
          "midtoneHue": "amber",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 62,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "amber",
            "neutral",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-silver-halide-mono",
    "name": "Silver Halide Mono",
    "category": "Film",
    "tags": [
      "bw",
      "mono",
      "classic"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#121212",
              "name": "shadow"
            },
            {
              "hex": "#4c4c4c",
              "name": "midtone"
            },
            {
              "hex": "#9a9a9a",
              "name": "accent"
            },
            {
              "hex": "#f2f2f2",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 6,
          "tint": 2,
          "contrast": 55,
          "saturation": 0,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-expired-stock",
    "name": "Expired Stock",
    "category": "Film",
    "tags": [
      "expired",
      "shift",
      "odd"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#191d16",
              "name": "shadow"
            },
            {
              "hex": "#4e5a3e",
              "name": "midtone"
            },
            {
              "hex": "#9aa06a",
              "name": "accent"
            },
            {
              "hex": "#e7e3bd",
              "name": "highlight"
            }
          ],
          "shadowHue": "green",
          "midtoneHue": "chartreuse",
          "highlightHue": "yellow",
          "temperature": 6,
          "tint": 12,
          "contrast": 55,
          "saturation": 48,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 56,
          "shadows": 44,
          "blacks": 42,
          "whites": 46,
          "fade": 22,
          "grain": 34,
          "sharpness": 48,
          "halation": 26,
          "dominantHues": [
            "chartreuse",
            "green",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-teal-orange",
    "name": "Teal & Orange",
    "category": "Blockbuster",
    "tags": [
      "teal",
      "orange",
      "action"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d1a1f",
              "name": "shadow"
            },
            {
              "hex": "#1f4b57",
              "name": "midtone"
            },
            {
              "hex": "#c2703a",
              "name": "accent"
            },
            {
              "hex": "#f4d9b5",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "amber",
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-steel-action",
    "name": "Steel Action",
    "category": "Blockbuster",
    "tags": [
      "steel",
      "cold",
      "hard"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#101418",
              "name": "shadow"
            },
            {
              "hex": "#31404b",
              "name": "midtone"
            },
            {
              "hex": "#6d8290",
              "name": "accent"
            },
            {
              "hex": "#dfe8ee",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-desert-convoy",
    "name": "Desert Convoy",
    "category": "Blockbuster",
    "tags": [
      "sand",
      "hot",
      "dust"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1d160f",
              "name": "shadow"
            },
            {
              "hex": "#6b4c2c",
              "name": "midtone"
            },
            {
              "hex": "#c9903f",
              "name": "accent"
            },
            {
              "hex": "#f6e3c0",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-night-chase",
    "name": "Night Chase",
    "category": "Blockbuster",
    "tags": [
      "night",
      "sodium",
      "urban"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b0d12",
              "name": "shadow"
            },
            {
              "hex": "#26303f",
              "name": "midtone"
            },
            {
              "hex": "#7a6a4a",
              "name": "accent"
            },
            {
              "hex": "#e9d9b6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "blue",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-heroic-gold",
    "name": "Heroic Gold",
    "category": "Blockbuster",
    "tags": [
      "gold",
      "epic",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1a140c",
              "name": "shadow"
            },
            {
              "hex": "#6d5320",
              "name": "midtone"
            },
            {
              "hex": "#c9a44a",
              "name": "accent"
            },
            {
              "hex": "#fbf0cf",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cold-thriller",
    "name": "Cold Thriller",
    "category": "Blockbuster",
    "tags": [
      "thriller",
      "cyan",
      "tense"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b1114",
              "name": "shadow"
            },
            {
              "hex": "#25454c",
              "name": "midtone"
            },
            {
              "hex": "#5f929a",
              "name": "accent"
            },
            {
              "hex": "#d9eef0",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "cyan",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-explosive-amber",
    "name": "Explosive Amber",
    "category": "Blockbuster",
    "tags": [
      "fire",
      "amber",
      "impact"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1a0d09",
              "name": "shadow"
            },
            {
              "hex": "#7a3417",
              "name": "midtone"
            },
            {
              "hex": "#dc8b3a",
              "name": "accent"
            },
            {
              "hex": "#ffe6bd",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 70,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "amber",
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-concrete-grey",
    "name": "Concrete Grey",
    "category": "Blockbuster",
    "tags": [
      "grey",
      "urban",
      "modern"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#141618",
              "name": "shadow"
            },
            {
              "hex": "#4a4f54",
              "name": "midtone"
            },
            {
              "hex": "#8f959b",
              "name": "accent"
            },
            {
              "hex": "#e4e7e9",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 34,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-deep-sea-blue",
    "name": "Deep Sea Blue",
    "category": "Blockbuster",
    "tags": [
      "ocean",
      "deep",
      "blue"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#070d15",
              "name": "shadow"
            },
            {
              "hex": "#153048",
              "name": "midtone"
            },
            {
              "hex": "#3f6d92",
              "name": "accent"
            },
            {
              "hex": "#cfe2f0",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sunset-freeway",
    "name": "Sunset Freeway",
    "category": "Blockbuster",
    "tags": [
      "sunset",
      "freeway",
      "magenta"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#170e14",
              "name": "shadow"
            },
            {
              "hex": "#5c2b40",
              "name": "midtone"
            },
            {
              "hex": "#c76a6c",
              "name": "accent"
            },
            {
              "hex": "#f7d9c6",
              "name": "highlight"
            }
          ],
          "shadowHue": "rose",
          "midtoneHue": "red",
          "highlightHue": "amber",
          "temperature": -4,
          "tint": 0,
          "contrast": 68,
          "saturation": 58,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "warm",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 6,
          "grain": 10,
          "sharpness": 72,
          "halation": 14,
          "dominantHues": [
            "amber",
            "red",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-editorial-clean",
    "name": "Editorial Clean",
    "category": "Fashion",
    "tags": [
      "editorial",
      "clean",
      "white"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1f2022",
              "name": "shadow"
            },
            {
              "hex": "#63666a",
              "name": "midtone"
            },
            {
              "hex": "#adb1b5",
              "name": "accent"
            },
            {
              "hex": "#fbfbfc",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-milk-bone",
    "name": "Milk & Bone",
    "category": "Fashion",
    "tags": [
      "pale",
      "bone",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#232120",
              "name": "shadow"
            },
            {
              "hex": "#6c6560",
              "name": "midtone"
            },
            {
              "hex": "#bdb4ab",
              "name": "accent"
            },
            {
              "hex": "#faf6f0",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "amber",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-powder-pink",
    "name": "Powder Pink",
    "category": "Fashion",
    "tags": [
      "pink",
      "pastel",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#241d20",
              "name": "shadow"
            },
            {
              "hex": "#6f5559",
              "name": "midtone"
            },
            {
              "hex": "#c99ea1",
              "name": "accent"
            },
            {
              "hex": "#fbe6e6",
              "name": "highlight"
            }
          ],
          "shadowHue": "rose",
          "midtoneHue": "red",
          "highlightHue": "red",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "red",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-runway-chrome",
    "name": "Runway Chrome",
    "category": "Fashion",
    "tags": [
      "chrome",
      "metal",
      "cool"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#181b1e",
              "name": "shadow"
            },
            {
              "hex": "#555c63",
              "name": "midtone"
            },
            {
              "hex": "#a6afb7",
              "name": "accent"
            },
            {
              "hex": "#f3f6f8",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-gallery-grey",
    "name": "Gallery Grey",
    "category": "Fashion",
    "tags": [
      "gallery",
      "muted",
      "minimal"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1b1c1d",
              "name": "shadow"
            },
            {
              "hex": "#5a5c5e",
              "name": "midtone"
            },
            {
              "hex": "#a3a5a7",
              "name": "accent"
            },
            {
              "hex": "#efefef",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 24,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sepia-couture",
    "name": "Sepia Couture",
    "category": "Fashion",
    "tags": [
      "sepia",
      "warm",
      "archive"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1f1913",
              "name": "shadow"
            },
            {
              "hex": "#65503b",
              "name": "midtone"
            },
            {
              "hex": "#bb9d78",
              "name": "accent"
            },
            {
              "hex": "#f7ecda",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-neo-mint",
    "name": "Neo Mint",
    "category": "Fashion",
    "tags": [
      "mint",
      "fresh",
      "green"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#161f1c",
              "name": "shadow"
            },
            {
              "hex": "#3d5c52",
              "name": "midtone"
            },
            {
              "hex": "#88b3a2",
              "name": "accent"
            },
            {
              "hex": "#e4f5ec",
              "name": "highlight"
            }
          ],
          "shadowHue": "teal",
          "midtoneHue": "teal",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "neutral",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-ultramarine-studio",
    "name": "Ultramarine Studio",
    "category": "Fashion",
    "tags": [
      "blue",
      "studio",
      "bold"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0f1424",
              "name": "shadow"
            },
            {
              "hex": "#233166",
              "name": "midtone"
            },
            {
              "hex": "#5a6fc0",
              "name": "accent"
            },
            {
              "hex": "#dfe4fb",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-nude-studio",
    "name": "Nude Studio",
    "category": "Fashion",
    "tags": [
      "nude",
      "skin",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#221c18",
              "name": "shadow"
            },
            {
              "hex": "#6d5b4d",
              "name": "midtone"
            },
            {
              "hex": "#c3a893",
              "name": "accent"
            },
            {
              "hex": "#f8ece0",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 2,
          "tint": -3,
          "contrast": 58,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-high-key-porcelain",
    "name": "High Key Porcelain",
    "category": "Fashion",
    "tags": [
      "high-key",
      "bright",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#2a2b2d",
              "name": "shadow"
            },
            {
              "hex": "#7a7d80",
              "name": "midtone"
            },
            {
              "hex": "#c3c6c9",
              "name": "accent"
            },
            {
              "hex": "#ffffff",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -3,
          "contrast": 40,
          "saturation": 42,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 64,
          "fade": 16,
          "grain": 12,
          "sharpness": 78,
          "halation": 18,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-concrete-bleach",
    "name": "Concrete Bleach",
    "category": "Streetwear",
    "tags": [
      "concrete",
      "bleach",
      "raw"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#121314",
              "name": "shadow"
            },
            {
              "hex": "#4b4d4f",
              "name": "midtone"
            },
            {
              "hex": "#93969a",
              "name": "accent"
            },
            {
              "hex": "#e9eaeb",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sodium-street",
    "name": "Sodium Street",
    "category": "Streetwear",
    "tags": [
      "sodium",
      "night",
      "amber"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d0c0a",
              "name": "shadow"
            },
            {
              "hex": "#3a2d17",
              "name": "midtone"
            },
            {
              "hex": "#9d7a33",
              "name": "accent"
            },
            {
              "hex": "#f0dca6",
              "name": "highlight"
            }
          ],
          "shadowHue": "yellow",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-blacktop-blue",
    "name": "Blacktop Blue",
    "category": "Streetwear",
    "tags": [
      "blue",
      "asphalt",
      "cold"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b0f14",
              "name": "shadow"
            },
            {
              "hex": "#20303f",
              "name": "midtone"
            },
            {
              "hex": "#546e85",
              "name": "accent"
            },
            {
              "hex": "#d3e0ea",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-hype-red",
    "name": "Hype Red",
    "category": "Streetwear",
    "tags": [
      "red",
      "bold",
      "logo"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#160a0c",
              "name": "shadow"
            },
            {
              "hex": "#5e1519",
              "name": "midtone"
            },
            {
              "hex": "#c33a33",
              "name": "accent"
            },
            {
              "hex": "#f8d6cd",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "red",
          "highlightHue": "red",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-graffiti-wall",
    "name": "Graffiti Wall",
    "category": "Streetwear",
    "tags": [
      "graffiti",
      "clash",
      "vivid"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#12131a",
              "name": "shadow"
            },
            {
              "hex": "#2c3f6b",
              "name": "midtone"
            },
            {
              "hex": "#c2503f",
              "name": "accent"
            },
            {
              "hex": "#f2e4c6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "red",
          "highlightHue": "yellow",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 78,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "blue",
            "red",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cargo-olive",
    "name": "Cargo Olive",
    "category": "Streetwear",
    "tags": [
      "olive",
      "utility",
      "military"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#14160f",
              "name": "shadow"
            },
            {
              "hex": "#3f4529",
              "name": "midtone"
            },
            {
              "hex": "#838a5b",
              "name": "accent"
            },
            {
              "hex": "#e2e4c6",
              "name": "highlight"
            }
          ],
          "shadowHue": "chartreuse",
          "midtoneHue": "chartreuse",
          "highlightHue": "yellow",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "chartreuse",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-subway-tile",
    "name": "Subway Tile",
    "category": "Streetwear",
    "tags": [
      "subway",
      "cool",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#14181a",
              "name": "shadow"
            },
            {
              "hex": "#3f4b50",
              "name": "midtone"
            },
            {
              "hex": "#7f9096",
              "name": "accent"
            },
            {
              "hex": "#e6eef0",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-court-purple",
    "name": "Court Purple",
    "category": "Streetwear",
    "tags": [
      "purple",
      "court",
      "sport"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#120d1a",
              "name": "shadow"
            },
            {
              "hex": "#33205a",
              "name": "midtone"
            },
            {
              "hex": "#7355b0",
              "name": "accent"
            },
            {
              "hex": "#e5dcf7",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "indigo",
          "highlightHue": "indigo",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "indigo"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-chrome-ice",
    "name": "Chrome Ice",
    "category": "Streetwear",
    "tags": [
      "chrome",
      "ice",
      "silver"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#101315",
              "name": "shadow"
            },
            {
              "hex": "#454d52",
              "name": "midtone"
            },
            {
              "hex": "#909aa0",
              "name": "accent"
            },
            {
              "hex": "#f4f8fa",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -6,
          "tint": 2,
          "contrast": 72,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-flash-on-asphalt",
    "name": "Flash On Asphalt",
    "category": "Streetwear",
    "tags": [
      "flash",
      "direct",
      "hard"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0c0d0e",
              "name": "shadow"
            },
            {
              "hex": "#3b3e40",
              "name": "midtone"
            },
            {
              "hex": "#a4a9ac",
              "name": "accent"
            },
            {
              "hex": "#ffffff",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -6,
          "tint": 2,
          "contrast": 84,
          "saturation": 62,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 78,
          "fade": 10,
          "grain": 22,
          "sharpness": 70,
          "halation": 22,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-neon-wet-street",
    "name": "Neon Wet Street",
    "category": "Music Video",
    "tags": [
      "neon",
      "rain",
      "reflection"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0d16",
              "name": "shadow"
            },
            {
              "hex": "#1f3a63",
              "name": "midtone"
            },
            {
              "hex": "#c04486",
              "name": "accent"
            },
            {
              "hex": "#f5d8ef",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "rose",
          "highlightHue": "magenta",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "blue",
            "magenta",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-club-magenta",
    "name": "Club Magenta",
    "category": "Music Video",
    "tags": [
      "club",
      "magenta",
      "party"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#12060f",
              "name": "shadow"
            },
            {
              "hex": "#4c0f3c",
              "name": "midtone"
            },
            {
              "hex": "#c53c93",
              "name": "accent"
            },
            {
              "hex": "#ffd9f0",
              "name": "highlight"
            }
          ],
          "shadowHue": "magenta",
          "midtoneHue": "rose",
          "highlightHue": "rose",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "magenta",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cyan-strobe",
    "name": "Cyan Strobe",
    "category": "Music Video",
    "tags": [
      "strobe",
      "cyan",
      "hard"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#050f12",
              "name": "shadow"
            },
            {
              "hex": "#0f4451",
              "name": "midtone"
            },
            {
              "hex": "#33b0c4",
              "name": "accent"
            },
            {
              "hex": "#dcfaff",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "cyan",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-purple-haze",
    "name": "Purple Haze",
    "category": "Music Video",
    "tags": [
      "purple",
      "haze",
      "smoke"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#100a18",
              "name": "shadow"
            },
            {
              "hex": "#341f52",
              "name": "midtone"
            },
            {
              "hex": "#7c56ad",
              "name": "accent"
            },
            {
              "hex": "#e9dcf9",
              "name": "highlight"
            }
          ],
          "shadowHue": "violet",
          "midtoneHue": "violet",
          "highlightHue": "violet",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "indigo",
            "violet"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-red-room",
    "name": "Red Room",
    "category": "Music Video",
    "tags": [
      "red",
      "intense",
      "glow"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#150506",
              "name": "shadow"
            },
            {
              "hex": "#5c0d10",
              "name": "midtone"
            },
            {
              "hex": "#cc3730",
              "name": "accent"
            },
            {
              "hex": "#ffd4cb",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "red",
          "highlightHue": "red",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-gold-chain-flash",
    "name": "Gold Chain Flash",
    "category": "Music Video",
    "tags": [
      "gold",
      "flash",
      "luxe"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#141008",
              "name": "shadow"
            },
            {
              "hex": "#5f4a12",
              "name": "midtone"
            },
            {
              "hex": "#cfa632",
              "name": "accent"
            },
            {
              "hex": "#fff2c4",
              "name": "highlight"
            }
          ],
          "shadowHue": "yellow",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-split-complement",
    "name": "Split Complement",
    "category": "Music Video",
    "tags": [
      "split",
      "clash",
      "stylised"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b1018",
              "name": "shadow"
            },
            {
              "hex": "#1d4f6b",
              "name": "midtone"
            },
            {
              "hex": "#d4763a",
              "name": "accent"
            },
            {
              "hex": "#f7e5cd",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "amber",
            "blue",
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-trap-green",
    "name": "Trap Green",
    "category": "Music Video",
    "tags": [
      "green",
      "dark",
      "moody"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#080e0a",
              "name": "shadow"
            },
            {
              "hex": "#12401f",
              "name": "midtone"
            },
            {
              "hex": "#39a256",
              "name": "accent"
            },
            {
              "hex": "#d5f6dd",
              "name": "highlight"
            }
          ],
          "shadowHue": "green",
          "midtoneHue": "green",
          "highlightHue": "green",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "green"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-lo-fi-vhs",
    "name": "Lo-Fi VHS",
    "category": "Music Video",
    "tags": [
      "vhs",
      "lofi",
      "retro"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#131218",
              "name": "shadow"
            },
            {
              "hex": "#3d3a52",
              "name": "midtone"
            },
            {
              "hex": "#8e86a4",
              "name": "accent"
            },
            {
              "hex": "#e4dff0",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "indigo",
          "highlightHue": "neutral",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 64,
          "fade": 36,
          "grain": 52,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "indigo",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-blown-highlight-pop",
    "name": "Blown Highlight Pop",
    "category": "Music Video",
    "tags": [
      "pop",
      "blown",
      "bright"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0e0f11",
              "name": "shadow"
            },
            {
              "hex": "#494e55",
              "name": "midtone"
            },
            {
              "hex": "#b9c1c8",
              "name": "accent"
            },
            {
              "hex": "#ffffff",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -8,
          "tint": 4,
          "contrast": 78,
          "saturation": 74,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "cool",
          "highlights": 58,
          "shadows": 42,
          "blacks": 22,
          "whites": 78,
          "fade": 8,
          "grain": 18,
          "sharpness": 66,
          "halation": 34,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-black-gold",
    "name": "Black & Gold",
    "category": "Luxury",
    "tags": [
      "black",
      "gold",
      "premium"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0c0a07",
              "name": "shadow"
            },
            {
              "hex": "#3d3117",
              "name": "midtone"
            },
            {
              "hex": "#b2913f",
              "name": "accent"
            },
            {
              "hex": "#f6e7c1",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-champagne-silk",
    "name": "Champagne Silk",
    "category": "Luxury",
    "tags": [
      "champagne",
      "silk",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1e1a15",
              "name": "shadow"
            },
            {
              "hex": "#665a48",
              "name": "midtone"
            },
            {
              "hex": "#c2b294",
              "name": "accent"
            },
            {
              "hex": "#faf2e2",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "yellow",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-deep-emerald",
    "name": "Deep Emerald",
    "category": "Luxury",
    "tags": [
      "emerald",
      "green",
      "rich"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#07110c",
              "name": "shadow"
            },
            {
              "hex": "#12402b",
              "name": "midtone"
            },
            {
              "hex": "#3d8a63",
              "name": "accent"
            },
            {
              "hex": "#d5f0e0",
              "name": "highlight"
            }
          ],
          "shadowHue": "teal",
          "midtoneHue": "green",
          "highlightHue": "green",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "green",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-midnight-sapphire",
    "name": "Midnight Sapphire",
    "category": "Luxury",
    "tags": [
      "sapphire",
      "navy",
      "deep"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#070b17",
              "name": "shadow"
            },
            {
              "hex": "#152049",
              "name": "midtone"
            },
            {
              "hex": "#3d549b",
              "name": "accent"
            },
            {
              "hex": "#d7dff6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-oyster-grey",
    "name": "Oyster Grey",
    "category": "Luxury",
    "tags": [
      "oyster",
      "grey",
      "subtle"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1a1a19",
              "name": "shadow"
            },
            {
              "hex": "#5c5b57",
              "name": "midtone"
            },
            {
              "hex": "#a9a7a1",
              "name": "accent"
            },
            {
              "hex": "#f2f0ec",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 30,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-rose-gold",
    "name": "Rose Gold",
    "category": "Luxury",
    "tags": [
      "rose",
      "gold",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1d1412",
              "name": "shadow"
            },
            {
              "hex": "#6b423a",
              "name": "midtone"
            },
            {
              "hex": "#c98d78",
              "name": "accent"
            },
            {
              "hex": "#fae2d6",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "amber",
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-onyx-mono",
    "name": "Onyx Mono",
    "category": "Luxury",
    "tags": [
      "onyx",
      "mono",
      "dark"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0a0a",
              "name": "shadow"
            },
            {
              "hex": "#3a3a3a",
              "name": "midtone"
            },
            {
              "hex": "#8a8a8a",
              "name": "accent"
            },
            {
              "hex": "#ececec",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 6,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cream-marble",
    "name": "Cream Marble",
    "category": "Luxury",
    "tags": [
      "marble",
      "cream",
      "bright"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#211f1b",
              "name": "shadow"
            },
            {
              "hex": "#6d675c",
              "name": "midtone"
            },
            {
              "hex": "#c0b8a8",
              "name": "accent"
            },
            {
              "hex": "#fbf7ee",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "yellow",
          "highlightHue": "neutral",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "amber",
            "neutral",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cognac-leather",
    "name": "Cognac Leather",
    "category": "Luxury",
    "tags": [
      "leather",
      "cognac",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#170f0a",
              "name": "shadow"
            },
            {
              "hex": "#5a341c",
              "name": "midtone"
            },
            {
              "hex": "#a9682f",
              "name": "accent"
            },
            {
              "hex": "#f0dabb",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-platinum-cool",
    "name": "Platinum Cool",
    "category": "Luxury",
    "tags": [
      "platinum",
      "cool",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#15181a",
              "name": "shadow"
            },
            {
              "hex": "#4e565c",
              "name": "midtone"
            },
            {
              "hex": "#9aa4ab",
              "name": "accent"
            },
            {
              "hex": "#f6f9fb",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 5,
          "tint": -2,
          "contrast": 52,
          "saturation": 38,
          "blackBehavior": "filmic",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "golden",
          "highlights": 55,
          "shadows": 45,
          "blacks": 42,
          "whites": 46,
          "fade": 12,
          "grain": 8,
          "sharpness": 80,
          "halation": 20,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-diamond-white",
    "name": "Diamond White",
    "category": "Jewelry",
    "tags": [
      "diamond",
      "white",
      "sparkle"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#111315",
              "name": "shadow"
            },
            {
              "hex": "#4b5257",
              "name": "midtone"
            },
            {
              "hex": "#b6bfc4",
              "name": "accent"
            },
            {
              "hex": "#ffffff",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-icy-blue-brilliance",
    "name": "Icy Blue Brilliance",
    "category": "Jewelry",
    "tags": [
      "icy",
      "blue",
      "brilliant"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0c1418",
              "name": "shadow"
            },
            {
              "hex": "#1f4152",
              "name": "midtone"
            },
            {
              "hex": "#68a3bd",
              "name": "accent"
            },
            {
              "hex": "#f0fbff",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-warm-yellow-gold",
    "name": "Warm Yellow Gold",
    "category": "Jewelry",
    "tags": [
      "gold",
      "yellow",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#171105",
              "name": "shadow"
            },
            {
              "hex": "#5e4310",
              "name": "midtone"
            },
            {
              "hex": "#cfa22f",
              "name": "accent"
            },
            {
              "hex": "#fff4cc",
              "name": "highlight"
            }
          ],
          "shadowHue": "yellow",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-white-gold-neutral",
    "name": "White Gold Neutral",
    "category": "Jewelry",
    "tags": [
      "white gold",
      "neutral",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#131517",
              "name": "shadow"
            },
            {
              "hex": "#4d5257",
              "name": "midtone"
            },
            {
              "hex": "#a7adb2",
              "name": "accent"
            },
            {
              "hex": "#fafcfd",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-rose-setting",
    "name": "Rose Setting",
    "category": "Jewelry",
    "tags": [
      "rose gold",
      "pink",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1b1210",
              "name": "shadow"
            },
            {
              "hex": "#663d33",
              "name": "midtone"
            },
            {
              "hex": "#c78a75",
              "name": "accent"
            },
            {
              "hex": "#fbe3d9",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "amber",
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-onyx-contrast",
    "name": "Onyx Contrast",
    "category": "Jewelry",
    "tags": [
      "onyx",
      "black",
      "contrast"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#070707",
              "name": "shadow"
            },
            {
              "hex": "#333333",
              "name": "midtone"
            },
            {
              "hex": "#8e9296",
              "name": "accent"
            },
            {
              "hex": "#f7fafc",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 76,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 58,
          "shadows": 42,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-ruby-fire",
    "name": "Ruby Fire",
    "category": "Jewelry",
    "tags": [
      "ruby",
      "red",
      "fire"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#150406",
              "name": "shadow"
            },
            {
              "hex": "#5f0d16",
              "name": "midtone"
            },
            {
              "hex": "#c3303c",
              "name": "accent"
            },
            {
              "hex": "#ffd6d6",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "red",
          "highlightHue": "red",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sapphire-depth",
    "name": "Sapphire Depth",
    "category": "Jewelry",
    "tags": [
      "sapphire",
      "blue",
      "deep"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#060a16",
              "name": "shadow"
            },
            {
              "hex": "#111f4c",
              "name": "midtone"
            },
            {
              "hex": "#2f4f9e",
              "name": "accent"
            },
            {
              "hex": "#dbe3fb",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-emerald-table",
    "name": "Emerald Table",
    "category": "Jewelry",
    "tags": [
      "emerald",
      "green",
      "table"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#050f0a",
              "name": "shadow"
            },
            {
              "hex": "#0f3a26",
              "name": "midtone"
            },
            {
              "hex": "#2f8558",
              "name": "accent"
            },
            {
              "hex": "#d3f2e0",
              "name": "highlight"
            }
          ],
          "shadowHue": "teal",
          "midtoneHue": "green",
          "highlightHue": "green",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "green",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-pearl-bloom",
    "name": "Pearl Bloom",
    "category": "Jewelry",
    "tags": [
      "pearl",
      "bloom",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1d1e1f",
              "name": "shadow"
            },
            {
              "hex": "#666a6d",
              "name": "midtone"
            },
            {
              "hex": "#bcc2c6",
              "name": "accent"
            },
            {
              "hex": "#fdfdfd",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 44,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-rainbow-fire-dispersion",
    "name": "Rainbow Fire Dispersion",
    "category": "Jewelry",
    "tags": [
      "dispersion",
      "rainbow",
      "fire"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d1013",
              "name": "shadow"
            },
            {
              "hex": "#2b4a6a",
              "name": "midtone"
            },
            {
              "hex": "#c76a3f",
              "name": "accent"
            },
            {
              "hex": "#f6f0e6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "amber",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 62,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 90,
          "halation": 30,
          "dominantHues": [
            "amber",
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-macro-studio-neutral",
    "name": "Macro Studio Neutral",
    "category": "Jewelry",
    "tags": [
      "macro",
      "studio",
      "neutral"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#141517",
              "name": "shadow"
            },
            {
              "hex": "#4f5459",
              "name": "midtone"
            },
            {
              "hex": "#a5abb0",
              "name": "accent"
            },
            {
              "hex": "#f8fafb",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 2,
          "tint": -1,
          "contrast": 62,
          "saturation": 44,
          "blackBehavior": "neutral",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "porcelain",
          "highlights": 56,
          "shadows": 44,
          "blacks": 50,
          "whites": 64,
          "fade": 4,
          "grain": 4,
          "sharpness": 96,
          "halation": 30,
          "dominantHues": [
            "blue",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-morgue-green",
    "name": "Morgue Green",
    "category": "Horror",
    "tags": [
      "green",
      "sick",
      "cold"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0f0b",
              "name": "shadow"
            },
            {
              "hex": "#213022",
              "name": "midtone"
            },
            {
              "hex": "#4e6a4f",
              "name": "accent"
            },
            {
              "hex": "#c7d6c6",
              "name": "highlight"
            }
          ],
          "shadowHue": "green",
          "midtoneHue": "green",
          "highlightHue": "neutral",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "green",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-blood-shadow",
    "name": "Blood Shadow",
    "category": "Horror",
    "tags": [
      "blood",
      "red",
      "dark"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d0505",
              "name": "shadow"
            },
            {
              "hex": "#3c0f0f",
              "name": "midtone"
            },
            {
              "hex": "#7e2822",
              "name": "accent"
            },
            {
              "hex": "#dfb8b2",
              "name": "highlight"
            }
          ],
          "shadowHue": "red",
          "midtoneHue": "red",
          "highlightHue": "red",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sallow-tungsten",
    "name": "Sallow Tungsten",
    "category": "Horror",
    "tags": [
      "tungsten",
      "sickly",
      "amber"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0e0b07",
              "name": "shadow"
            },
            {
              "hex": "#332715",
              "name": "midtone"
            },
            {
              "hex": "#6d5730",
              "name": "accent"
            },
            {
              "hex": "#d6c6a4",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "yellow",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-moonlight-cold",
    "name": "Moonlight Cold",
    "category": "Horror",
    "tags": [
      "moon",
      "blue",
      "night"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#06090f",
              "name": "shadow"
            },
            {
              "hex": "#152034",
              "name": "midtone"
            },
            {
              "hex": "#3c5372",
              "name": "accent"
            },
            {
              "hex": "#c5d3e6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-bleached-asylum",
    "name": "Bleached Asylum",
    "category": "Horror",
    "tags": [
      "bleach",
      "white",
      "harsh"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0e0f0f",
              "name": "shadow"
            },
            {
              "hex": "#3f4241",
              "name": "midtone"
            },
            {
              "hex": "#8c8f8d",
              "name": "accent"
            },
            {
              "hex": "#f4f6f4",
              "name": "highlight"
            }
          ],
          "shadowHue": "neutral",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 12,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-rust-basement",
    "name": "Rust Basement",
    "category": "Horror",
    "tags": [
      "rust",
      "decay",
      "brown"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0f0a07",
              "name": "shadow"
            },
            {
              "hex": "#3a251a",
              "name": "midtone"
            },
            {
              "hex": "#77503a",
              "name": "accent"
            },
            {
              "hex": "#d9c2ae",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-static-grey",
    "name": "Static Grey",
    "category": "Horror",
    "tags": [
      "static",
      "grey",
      "void"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b0b0c",
              "name": "shadow"
            },
            {
              "hex": "#333436",
              "name": "midtone"
            },
            {
              "hex": "#767779",
              "name": "accent"
            },
            {
              "hex": "#dcdddf",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 66,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "indigo",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-ultraviolet-dread",
    "name": "Ultraviolet Dread",
    "category": "Horror",
    "tags": [
      "uv",
      "violet",
      "unease"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0714",
              "name": "shadow"
            },
            {
              "hex": "#241448",
              "name": "midtone"
            },
            {
              "hex": "#523392",
              "name": "accent"
            },
            {
              "hex": "#cfc3ee",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "indigo",
          "highlightHue": "indigo",
          "temperature": -10,
          "tint": -4,
          "contrast": 74,
          "saturation": 28,
          "blackBehavior": "crushed",
          "highlightBehavior": "clipped",
          "skinToneTreatment": "desaturated",
          "highlights": 57,
          "shadows": 43,
          "blacks": 22,
          "whites": 78,
          "fade": 14,
          "grain": 40,
          "sharpness": 54,
          "halation": 8,
          "dominantHues": [
            "indigo"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cold-chrome-future",
    "name": "Cold Chrome Future",
    "category": "Sci-Fi",
    "tags": [
      "chrome",
      "cold",
      "clean"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d1114",
              "name": "shadow"
            },
            {
              "hex": "#2c3c46",
              "name": "midtone"
            },
            {
              "hex": "#6f8b9a",
              "name": "accent"
            },
            {
              "hex": "#e4f1f6",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "blue",
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cyberpunk-bloom",
    "name": "Cyberpunk Bloom",
    "category": "Sci-Fi",
    "tags": [
      "cyberpunk",
      "neon",
      "bloom"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#080b16",
              "name": "shadow"
            },
            {
              "hex": "#1a2a5e",
              "name": "midtone"
            },
            {
              "hex": "#c53a7e",
              "name": "accent"
            },
            {
              "hex": "#f0d8f2",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "rose",
          "highlightHue": "magenta",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 58,
          "dominantHues": [
            "blue",
            "magenta",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-alien-bio-green",
    "name": "Alien Bio Green",
    "category": "Sci-Fi",
    "tags": [
      "alien",
      "bio",
      "green"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#050d09",
              "name": "shadow"
            },
            {
              "hex": "#0f3521",
              "name": "midtone"
            },
            {
              "hex": "#2f9b5d",
              "name": "accent"
            },
            {
              "hex": "#d3f7de",
              "name": "highlight"
            }
          ],
          "shadowHue": "teal",
          "midtoneHue": "green",
          "highlightHue": "green",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "green",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-mars-dust",
    "name": "Mars Dust",
    "category": "Sci-Fi",
    "tags": [
      "mars",
      "dust",
      "orange"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#150c08",
              "name": "shadow"
            },
            {
              "hex": "#4f2a17",
              "name": "midtone"
            },
            {
              "hex": "#a75f30",
              "name": "accent"
            },
            {
              "hex": "#f2dcc2",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-hologram-cyan",
    "name": "Hologram Cyan",
    "category": "Sci-Fi",
    "tags": [
      "hologram",
      "cyan",
      "glow"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#060f12",
              "name": "shadow"
            },
            {
              "hex": "#0d3d49",
              "name": "midtone"
            },
            {
              "hex": "#28a8bf",
              "name": "accent"
            },
            {
              "hex": "#dcfbff",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "cyan",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-deep-space-void",
    "name": "Deep Space Void",
    "category": "Sci-Fi",
    "tags": [
      "space",
      "void",
      "black"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#04050a",
              "name": "shadow"
            },
            {
              "hex": "#0e1428",
              "name": "midtone"
            },
            {
              "hex": "#2a3559",
              "name": "accent"
            },
            {
              "hex": "#c3cae0",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "blue",
          "highlightHue": "blue",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-retro-futur-amber",
    "name": "Retro Futur Amber",
    "category": "Sci-Fi",
    "tags": [
      "retro",
      "amber",
      "crt"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d0b06",
              "name": "shadow"
            },
            {
              "hex": "#3a2c10",
              "name": "midtone"
            },
            {
              "hex": "#9c7a24",
              "name": "accent"
            },
            {
              "hex": "#f3e2ae",
              "name": "highlight"
            }
          ],
          "shadowHue": "yellow",
          "midtoneHue": "yellow",
          "highlightHue": "yellow",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-clinical-lab-white",
    "name": "Clinical Lab White",
    "category": "Sci-Fi",
    "tags": [
      "lab",
      "white",
      "sterile"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#131618",
              "name": "shadow"
            },
            {
              "hex": "#454d52",
              "name": "midtone"
            },
            {
              "hex": "#9ba4a9",
              "name": "accent"
            },
            {
              "hex": "#fdfefe",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-ion-violet",
    "name": "Ion Violet",
    "category": "Sci-Fi",
    "tags": [
      "ion",
      "violet",
      "energy"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0713",
              "name": "shadow"
            },
            {
              "hex": "#251446",
              "name": "midtone"
            },
            {
              "hex": "#6339b4",
              "name": "accent"
            },
            {
              "hex": "#e2d6fb",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "indigo",
          "highlightHue": "indigo",
          "temperature": -12,
          "tint": 3,
          "contrast": 66,
          "saturation": 52,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "cool",
          "highlights": 57,
          "shadows": 43,
          "blacks": 68,
          "whites": 64,
          "fade": 10,
          "grain": 14,
          "sharpness": 76,
          "halation": 28,
          "dominantHues": [
            "indigo"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-70s-kodachrome",
    "name": "70s Kodachrome",
    "category": "Vintage",
    "tags": [
      "70s",
      "kodachrome",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1b1208",
              "name": "shadow"
            },
            {
              "hex": "#61411c",
              "name": "midtone"
            },
            {
              "hex": "#b98a3f",
              "name": "accent"
            },
            {
              "hex": "#f4e2bd",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "yellow",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "amber",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-60s-faded-print",
    "name": "60s Faded Print",
    "category": "Vintage",
    "tags": [
      "60s",
      "faded",
      "print"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#211b16",
              "name": "shadow"
            },
            {
              "hex": "#6a5b4c",
              "name": "midtone"
            },
            {
              "hex": "#b5a692",
              "name": "accent"
            },
            {
              "hex": "#f2e9dc",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-80s-vhs-warm",
    "name": "80s VHS Warm",
    "category": "Vintage",
    "tags": [
      "80s",
      "vhs",
      "warm"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#181017",
              "name": "shadow"
            },
            {
              "hex": "#4c2b3f",
              "name": "midtone"
            },
            {
              "hex": "#9c6a7c",
              "name": "accent"
            },
            {
              "hex": "#eed6dd",
              "name": "highlight"
            }
          ],
          "shadowHue": "magenta",
          "midtoneHue": "rose",
          "highlightHue": "rose",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 56,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "magenta",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-90s-camcorder",
    "name": "90s Camcorder",
    "category": "Vintage",
    "tags": [
      "90s",
      "camcorder",
      "soft"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#141719",
              "name": "shadow"
            },
            {
              "hex": "#454f52",
              "name": "midtone"
            },
            {
              "hex": "#87979a",
              "name": "accent"
            },
            {
              "hex": "#e2eaec",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "neutral",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 42,
          "sharpness": 30,
          "halation": 24,
          "dominantHues": [
            "cyan",
            "neutral"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-sepia-archive",
    "name": "Sepia Archive",
    "category": "Vintage",
    "tags": [
      "sepia",
      "archive",
      "old"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1c150e",
              "name": "shadow"
            },
            {
              "hex": "#5b4527",
              "name": "midtone"
            },
            {
              "hex": "#a98a5c",
              "name": "accent"
            },
            {
              "hex": "#eee0c6",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-faded-polaroid",
    "name": "Faded Polaroid",
    "category": "Vintage",
    "tags": [
      "polaroid",
      "fade",
      "pastel"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#232022",
              "name": "shadow"
            },
            {
              "hex": "#6a6265",
              "name": "midtone"
            },
            {
              "hex": "#b7aeae",
              "name": "accent"
            },
            {
              "hex": "#f6efe9",
              "name": "highlight"
            }
          ],
          "shadowHue": "rose",
          "midtoneHue": "neutral",
          "highlightHue": "neutral",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 54,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "neutral",
            "rose"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-cross-process",
    "name": "Cross Process",
    "category": "Vintage",
    "tags": [
      "cross",
      "shift",
      "cyan"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0f1618",
              "name": "shadow"
            },
            {
              "hex": "#254c4a",
              "name": "midtone"
            },
            {
              "hex": "#6fa08c",
              "name": "accent"
            },
            {
              "hex": "#eaf2d9",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "teal",
          "highlightHue": "chartreuse",
          "temperature": 10,
          "tint": 18,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 34,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "chartreuse",
            "cyan",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-nostalgia-warm-fade",
    "name": "Nostalgia Warm Fade",
    "category": "Vintage",
    "tags": [
      "nostalgia",
      "warm",
      "fade"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#1f180f",
              "name": "shadow"
            },
            {
              "hex": "#63513a",
              "name": "midtone"
            },
            {
              "hex": "#b39d7c",
              "name": "accent"
            },
            {
              "hex": "#f5ecdb",
              "name": "highlight"
            }
          ],
          "shadowHue": "amber",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 10,
          "tint": 5,
          "contrast": 42,
          "saturation": 44,
          "blackBehavior": "lifted",
          "highlightBehavior": "rolled-off",
          "skinToneTreatment": "warm",
          "highlights": 54,
          "shadows": 46,
          "blacks": 68,
          "whites": 46,
          "fade": 48,
          "grain": 42,
          "sharpness": 40,
          "halation": 24,
          "dominantHues": [
            "amber"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-duotone-blue-amber",
    "name": "Duotone Blue Amber",
    "category": "Experimental",
    "tags": [
      "duotone",
      "blue",
      "amber"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#08121e",
              "name": "shadow"
            },
            {
              "hex": "#153a63",
              "name": "midtone"
            },
            {
              "hex": "#d18e34",
              "name": "accent"
            },
            {
              "hex": "#f8e9cd",
              "name": "highlight"
            }
          ],
          "shadowHue": "blue",
          "midtoneHue": "amber",
          "highlightHue": "amber",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 88,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "amber",
            "blue"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-inverted-skin",
    "name": "Inverted Skin",
    "category": "Experimental",
    "tags": [
      "inverted",
      "strange",
      "clash"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d1410",
              "name": "shadow"
            },
            {
              "hex": "#2a5245",
              "name": "midtone"
            },
            {
              "hex": "#9fd0a8",
              "name": "accent"
            },
            {
              "hex": "#f0fbe8",
              "name": "highlight"
            }
          ],
          "shadowHue": "green",
          "midtoneHue": "green",
          "highlightHue": "neutral",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 88,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "green",
            "neutral",
            "teal"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-posterized-pop",
    "name": "Posterized Pop",
    "category": "Experimental",
    "tags": [
      "posterize",
      "pop",
      "flat"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#100d16",
              "name": "shadow"
            },
            {
              "hex": "#4020a0",
              "name": "midtone"
            },
            {
              "hex": "#f0407a",
              "name": "accent"
            },
            {
              "hex": "#ffe94a",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "rose",
          "highlightHue": "yellow",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 96,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "indigo",
            "rose",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-chromatic-split",
    "name": "Chromatic Split",
    "category": "Experimental",
    "tags": [
      "chromatic",
      "split",
      "rgb"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0b0b12",
              "name": "shadow"
            },
            {
              "hex": "#1f2f8a",
              "name": "midtone"
            },
            {
              "hex": "#c0284a",
              "name": "accent"
            },
            {
              "hex": "#e8f2ff",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "red",
          "highlightHue": "blue",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 88,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "blue",
            "indigo",
            "red"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-solarised-heat",
    "name": "Solarised Heat",
    "category": "Experimental",
    "tags": [
      "solarise",
      "heat",
      "glow"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#12070b",
              "name": "shadow"
            },
            {
              "hex": "#5d1230",
              "name": "midtone"
            },
            {
              "hex": "#e0663f",
              "name": "accent"
            },
            {
              "hex": "#fff0b0",
              "name": "highlight"
            }
          ],
          "shadowHue": "rose",
          "midtoneHue": "red",
          "highlightHue": "yellow",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 88,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "red",
            "rose",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-infrared-bloom",
    "name": "Infrared Bloom",
    "category": "Experimental",
    "tags": [
      "infrared",
      "bloom",
      "pink"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0d0710",
              "name": "shadow"
            },
            {
              "hex": "#4a1140",
              "name": "midtone"
            },
            {
              "hex": "#d4569b",
              "name": "accent"
            },
            {
              "hex": "#ffe1f2",
              "name": "highlight"
            }
          ],
          "shadowHue": "violet",
          "midtoneHue": "rose",
          "highlightHue": "rose",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 88,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 72,
          "dominantHues": [
            "magenta",
            "rose",
            "violet"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-monochrome-cyan",
    "name": "Monochrome Cyan",
    "category": "Experimental",
    "tags": [
      "mono",
      "cyan",
      "single"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#040e11",
              "name": "shadow"
            },
            {
              "hex": "#0f3b45",
              "name": "midtone"
            },
            {
              "hex": "#3d8b9b",
              "name": "accent"
            },
            {
              "hex": "#d8f3f8",
              "name": "highlight"
            }
          ],
          "shadowHue": "cyan",
          "midtoneHue": "cyan",
          "highlightHue": "cyan",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 22,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "cyan"
          ]
        },
        "source": "PRESET"
      }
    }
  },
  {
    "id": "color-glitch-clash",
    "name": "Glitch Clash",
    "category": "Experimental",
    "tags": [
      "glitch",
      "clash",
      "digital"
    ],
    "config": {
      "color": {
        "value": {
          "swatches": [
            {
              "hex": "#0a0a0f",
              "name": "shadow"
            },
            {
              "hex": "#2b1360",
              "name": "midtone"
            },
            {
              "hex": "#12b48f",
              "name": "accent"
            },
            {
              "hex": "#f4ec3c",
              "name": "highlight"
            }
          ],
          "shadowHue": "indigo",
          "midtoneHue": "teal",
          "highlightHue": "yellow",
          "temperature": 0,
          "tint": 8,
          "contrast": 82,
          "saturation": 92,
          "blackBehavior": "lifted",
          "highlightBehavior": "bloomed",
          "skinToneTreatment": "natural",
          "highlights": 58,
          "shadows": 42,
          "blacks": 68,
          "whites": 64,
          "fade": 18,
          "grain": 26,
          "sharpness": 62,
          "halation": 36,
          "dominantHues": [
            "indigo",
            "teal",
            "yellow"
          ]
        },
        "source": "PRESET"
      }
    }
  }
];

/** Swatch hex list for a preset card's swatch bar. */
export function presetSwatches(preset: CinemaColorPreset): string[] {
  return (preset.config.color?.value.swatches ?? []).map((s) => s.hex);
}

export function paletteOf(preset: CinemaColorPreset): ColorPalette | undefined {
  return preset.config.color?.value;
}
