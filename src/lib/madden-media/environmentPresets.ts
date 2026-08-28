import type { MaddenPreset } from "@/lib/madden-media/presetTypes";

/** Curated environment / scene presets. Code-owned, not DB rows. */
export const MADDEN_ENVIRONMENT_PRESETS: MaddenPreset[] = [
  {
    id: "concrete-garage",
    name: "Concrete garage",
    description: "Raw parking structure, painted lines, pillars.",
    promptFragment:
      "raw concrete parking garage, painted floor lines, thick support pillars, fluorescent overhead strips",
    tags: ["urban", "interior", "concrete"],
  },
  {
    id: "rooftop-city",
    name: "Rooftop city",
    description: "Skyline behind, HVAC units and gravel.",
    promptFragment:
      "city rooftop with skyline behind, HVAC units, gravel and duct detail, open sky",
    tags: ["urban", "exterior", "skyline"],
  },
  {
    id: "industrial-warehouse",
    name: "Industrial warehouse",
    description: "Empty span, steel trusses, dusty light.",
    promptFragment:
      "empty industrial warehouse, steel roof trusses, scuffed concrete floor, dusty shafts of light",
    tags: ["industrial", "interior", "empty"],
  },
  {
    id: "back-alley",
    name: "Back alley",
    description: "Brick, dumpsters, fire escape.",
    promptFragment:
      "narrow back alley, brick walls, dumpsters and fire escape ladders, damp asphalt",
    tags: ["urban", "gritty", "exterior"],
  },
  {
    id: "studio-seamless",
    name: "Studio seamless",
    description: "Infinite paper backdrop, no environment.",
    promptFragment:
      "studio seamless paper backdrop, no environmental detail, subject isolated on clean sweep",
    tags: ["studio", "clean", "isolated"],
  },
  {
    id: "studio-cyc-grey",
    name: "Grey cyc wall",
    description: "Neutral cyclorama with soft corner falloff.",
    promptFragment:
      "neutral grey cyclorama wall studio, soft corner falloff, polished floor edge visible",
    tags: ["studio", "neutral", "grey"],
  },
  {
    id: "desert-flats",
    name: "Desert flats",
    description: "Cracked earth to the horizon.",
    promptFragment:
      "open desert flats, cracked dry earth, distant low ridgeline, huge empty sky",
    tags: ["exterior", "desert", "vast"],
  },
  {
    id: "service-elevator",
    name: "Service elevator",
    description: "Brushed steel box, quilted pads.",
    promptFragment:
      "cramped service elevator interior, brushed steel walls, quilted moving pads, harsh ceiling light",
    tags: ["interior", "tight", "steel"],
  },
  {
    id: "subway-platform",
    name: "Subway platform",
    description: "Tiled columns, tracks, transit signage.",
    promptFragment:
      "underground subway platform, tiled columns, yellow safety edge, tracks and transit signage",
    tags: ["urban", "transit", "interior"],
  },
  {
    id: "corner-bodega",
    name: "Corner bodega",
    description: "Packed shelves, coolers, hand-painted signs.",
    promptFragment:
      "corner bodega interior, densely packed shelves, glowing drink coolers, hand-painted signage",
    tags: ["urban", "retail", "interior"],
  },
  {
    id: "gas-station-night",
    name: "Gas station at night",
    description: "Canopy fluorescents over wet forecourt.",
    promptFragment:
      "gas station forecourt at night, bright canopy fluorescents, pumps and wet reflective pavement",
    tags: ["night", "exterior", "roadside"],
  },
  {
    id: "car-interior",
    name: "Car interior",
    description: "Driver seat, dashboard glow.",
    promptFragment:
      "car interior from the passenger side, leather seats, dashboard glow, windows framing blurred street",
    tags: ["interior", "vehicle", "tight"],
  },
  {
    id: "basketball-court",
    name: "Basketball court",
    description: "Chain nets, painted asphalt, fencing.",
    promptFragment:
      "outdoor basketball court, chain nets, faded painted asphalt lines, chain-link fencing",
    tags: ["exterior", "sport", "urban"],
  },
  {
    id: "skate-park",
    name: "Skate park",
    description: "Concrete bowls, coping, graffiti.",
    promptFragment:
      "concrete skate park, bowls and ledges with steel coping, graffiti tags, scattered boards",
    tags: ["exterior", "sport", "concrete"],
  },
  {
    id: "loading-dock",
    name: "Loading dock",
    description: "Roller doors, pallets, dock levellers.",
    promptFragment:
      "loading dock exterior, roller shutter doors, stacked pallets, painted bay numbers",
    tags: ["industrial", "exterior", "utility"],
  },
  {
    id: "hotel-hallway",
    name: "Hotel hallway",
    description: "Patterned carpet, repeating doors.",
    promptFragment:
      "long hotel hallway, patterned carpet, repeating numbered doors, warm wall sconces",
    tags: ["interior", "corridor", "warm"],
  },
  {
    id: "penthouse-window",
    name: "Penthouse window",
    description: "Floor-to-ceiling glass over the city.",
    promptFragment:
      "penthouse interior with floor-to-ceiling glass, city view beyond, minimal luxury furnishing",
    tags: ["interior", "luxury", "view"],
  },
  {
    id: "laundromat",
    name: "Laundromat",
    description: "Row machines, plastic chairs, hard light.",
    promptFragment:
      "laundromat interior, row of front-load machines, plastic chairs, flat fluorescent light",
    tags: ["interior", "retail", "candid"],
  },
  {
    id: "barbershop",
    name: "Barbershop",
    description: "Mirrors, chairs, poster wall.",
    promptFragment:
      "barbershop interior, mirrored wall and chairs, poster collage, warm ceiling light",
    tags: ["interior", "culture", "mirror"],
  },
  {
    id: "record-store",
    name: "Record store",
    description: "Crates, wall art, dense shelving.",
    promptFragment:
      "record store interior, vinyl crates, wall-mounted sleeves, dense shelving and low light",
    tags: ["interior", "culture", "retail"],
  },
  {
    id: "rain-street-night",
    name: "Rain street at night",
    description: "Wet reflections and signage bleed.",
    promptFragment:
      "rain-soaked city street at night, mirrored pavement reflections, signage bleeding into the wet ground",
    tags: ["night", "rain", "urban"],
  },
  {
    id: "snow-street",
    name: "Snow street",
    description: "Fresh snow, muted city sound.",
    promptFragment:
      "snow-covered city street, fresh powder on parked cars, muted flat winter light, visible breath",
    tags: ["exterior", "winter", "cold"],
  },
  {
    id: "tunnel-underpass",
    name: "Tunnel underpass",
    description: "Repeating lights, tiled walls.",
    promptFragment:
      "road tunnel underpass, repeating overhead lights receding, tiled stained walls",
    tags: ["urban", "tunnel", "leading lines"],
  },
  {
    id: "rooftop-stairwell",
    name: "Stairwell",
    description: "Painted metal rails, harsh top light.",
    promptFragment:
      "utilitarian concrete stairwell, painted metal handrails, harsh top-down light, graffitied landing",
    tags: ["interior", "utility", "tight"],
  },
  {
    id: "warehouse-party",
    name: "Warehouse party",
    description: "Haze, moving lights, crowd silhouettes.",
    promptFragment:
      "warehouse party, thick haze, moving colored lights, crowd silhouettes behind the subject",
    tags: ["night", "crowd", "party"],
  },
  {
    id: "boxing-gym",
    name: "Boxing gym",
    description: "Ring ropes, hanging bags, chalk dust.",
    promptFragment:
      "old boxing gym, ring ropes, hanging heavy bags, chalk dust in shafts of window light",
    tags: ["interior", "sport", "gritty"],
  },
  {
    id: "beach-dusk",
    name: "Beach at dusk",
    description: "Wet sand, low sun, sea haze.",
    promptFragment:
      "beach at dusk, wet reflective sand, low sun over water, salt haze in the air",
    tags: ["exterior", "water", "dusk"],
  },
  {
    id: "forest-fog",
    name: "Foggy forest",
    description: "Dense trunks, low visibility.",
    promptFragment:
      "dense forest in fog, dark tree trunks fading into grey, damp ground cover",
    tags: ["exterior", "nature", "moody"],
  },
  {
    id: "airport-gate",
    name: "Airport gate",
    description: "Glass wall, seating rows, tarmac beyond.",
    promptFragment:
      "airport departure gate, glass wall onto the tarmac, rows of seating, flat terminal lighting",
    tags: ["interior", "travel", "public"],
  },
  {
    id: "private-jet-cabin",
    name: "Jet cabin",
    description: "Leather seats, small oval windows.",
    promptFragment:
      "private jet cabin interior, cream leather seats, small oval windows, warm recessed lighting",
    tags: ["interior", "luxury", "tight"],
  },
  {
    id: "corner-store-exterior",
    name: "Storefront curb",
    description: "Roll gate, curb sit, street traffic.",
    promptFragment:
      "storefront curb at street level, roll gate and signage behind, passing traffic blurred",
    tags: ["urban", "exterior", "candid"],
  },
  {
    id: "white-cube-gallery",
    name: "Gallery white cube",
    description: "Bare white room, track lighting.",
    promptFragment:
      "white cube gallery room, bare walls, polished concrete floor, track lighting overhead",
    tags: ["interior", "minimal", "art"],
  },
];
