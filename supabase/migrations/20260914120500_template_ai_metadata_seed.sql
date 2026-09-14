-- Hand-written, customer-language metadata for every runnable template.
-- Matched by slug; safe to re-run (upsert). Internal descriptions in fuse_templates are untouched.
with seed(slug, public_name, one_sentence_description, product_types, industries, use_cases, style_tags) as (values
  ('airport-tray-video', 'Airport Tray', 'Show your product pulled from an airport security tray, with images and short clips.', array['hoodie','tee','hat','sneakers','accessory','jewelry'], array['streetwear','fashion','product'], array['product reveal','social clips'], array['travel','cinematic','handheld']),
  ('amazon-guy', 'Delivery Reveal', 'Turn a tee or hoodie into a delivery-reveal scene with images and clips.', array['tee','hoodie'], array['streetwear'], array['product reveal','unboxing','social clips'], array['doorbell','viral-style','handheld']),
  ('armored-truck', 'Armored Truck', 'Put your outerwear into an armored-truck street scene with images and clips.', array['jacket','hoodie','outerwear'], array['streetwear'], array['lifestyle','ads'], array['gritty','cinematic','heist']),
  ('blue-lab', 'Blue Lab', 'Generate clean lab-lit product visuals for a clothing drop.', array['hoodie','tee','jacket','pants'], array['streetwear','fashion'], array['lookbook','ads'], array['blue-lit','editorial','moody']),
  ('broken-planet', 'Broken Planet', 'Create a multi-piece outfit campaign with images and short clips.', array['hoodie','pants','tee','shorts'], array['streetwear'], array['lookbook','social clips'], array['outfit','streetwear','clean']),
  ('changing-room', 'Changing Room', 'Turn one apparel product into a fitting-room campaign with images and short clips.', array['tee','hoodie','shorts','top','pants'], array['streetwear','fashion'], array['changing room','fit check','social clips'], array['ugc','mirror','try-on']),
  ('desert', 'Desert', 'Place your outfit in a desert shoot with images and clips.', array['hoodie','tee','pants','jacket'], array['streetwear','fashion'], array['lifestyle','lookbook','ads'], array['desert','dirt bike','cinematic']),
  ('duos', 'Duos', 'Show two garments on two models in one campaign.', array['tee','hoodie','pants','shorts'], array['streetwear'], array['lookbook','lifestyle'], array['duo','street','editorial']),
  ('elevator', 'Elevator', 'Create close-up elevator shots for face, grillz, top, car and bottoms.', array['grillz','chain','hoodie','tee','pants'], array['streetwear','jewelry'], array['jewelry close-up','lookbook','social clips'], array['elevator','close-up','transition']),
  ('garage', 'Garage', 'Generate garage-lit product visuals for a clothing drop.', array['hoodie','tee','jacket','pants'], array['streetwear'], array['lookbook','ads'], array['industrial','raw','gritty']),
  ('gas-station', 'Gas Station', 'Put your top and bottoms into a night gas-station scene.', array['hoodie','tee','pants','jacket'], array['streetwear'], array['lifestyle','social clips'], array['night','snow','cinematic']),
  ('grillzzzz', 'Grillz', 'Create close-up jewelry visuals and short video clips for grillz, chains, or accessories.', array['grillz','chain','ring','pendant','jewelry'], array['jewelry','streetwear'], array['jewelry close-up','product reveal','social clips'], array['iced-out','cinematic','macro']),
  ('group-meet', 'Group Meet', 'Put your product into a streetwear group-shot campaign built for social content.', array['tee','hoodie','pants','shorts'], array['streetwear'], array['lifestyle','lookbook','social clips'], array['group','street','landscape']),
  ('hat-stitching', 'Hat Stitching', 'Turn a hat into a stitching close-up clip.', array['hat','cap'], array['streetwear','fashion'], array['product reveal','social clips'], array['macro','craft','close-up']),
  ('ice-pick', 'Ice Pick', 'Generate cold-toned outfit visuals for a top and bottoms.', array['hoodie','jacket','pants'], array['streetwear'], array['lookbook','lifestyle'], array['winter','tactical','cold']),
  ('jeans', 'Jeans', 'Show your jeans in a simple fit campaign.', array['jeans','pants','denim'], array['streetwear','fashion'], array['lookbook','fit check'], array['denim','editorial','dark']),
  ('paparazzi', 'Paparazzi', 'Create a paparazzi-style reveal clip for one garment.', array['tee','hoodie','shorts','pants','hat'], array['streetwear'], array['product reveal','unboxing','social clips'], array['phone circle','hype','reveal']),
  ('papparazi', 'Paparazzi', 'Create a paparazzi-style reveal clip for one garment.', array['tee','hoodie','shorts','pants','hat'], array['streetwear'], array['product reveal','unboxing','social clips'], array['phone circle','hype','reveal']),
  ('raven', 'Raven', 'Generate a dark, moody clip for one garment.', array['hoodie','tee','jacket'], array['streetwear','fashion'], array['ads','social clips'], array['gothic','dark','luxury']),
  ('skatepark', 'Skatepark', 'Put your top, bottoms and accessory into a skatepark shoot.', array['tee','hoodie','pants','shorts','hat','accessory'], array['streetwear'], array['lifestyle','social clips'], array['skate','action','daylight']),
  ('spider-man', 'Web Action', 'Create a hoodie-led action campaign with images and clips.', array['hoodie','tee'], array['streetwear'], array['ads','social clips'], array['action','graphic','bold']),
  ('studio', 'Studio', 'Generate studio-lit lookbook images and clips for a top and bottoms.', array['hoodie','tee','pants','shorts','jacket'], array['streetwear','fashion','product'], array['lookbook','ads'], array['studio','clean','classic']),
  ('ugc-mirror', 'UGC Mirror', 'Create mirror-selfie style content for a front and back garment.', array['tee','hoodie','jacket'], array['streetwear'], array['fit check','social clips'], array['ugc','mirror','selfie']),
  ('ugc-walk-in', 'UGC Walk In', 'Create walk-in fit-check content for a top and bottoms.', array['hoodie','tee','pants','shorts'], array['streetwear'], array['fit check','social clips','lifestyle'], array['ugc','mirror','walk-in']),
  ('unboxing', 'Unboxing', 'Turn your product into an unboxing reveal with images and clips.', array['tee','hoodie','hat','accessory','jewelry'], array['streetwear','product'], array['unboxing','product reveal','social clips'], array['upper body','face','reveal']),
  ('warehouse', 'Warehouse', 'Generate gritty warehouse-style product visuals for clothing drops.', array['hoodie','tee','pants','jacket'], array['streetwear'], array['lookbook','ads','lifestyle'], array['warehouse','gritty','duo'])
)
insert into public.template_ai_metadata (template_id, public_name, one_sentence_description, product_types, industries, use_cases, style_tags, visibility)
select t.id, s.public_name, s.one_sentence_description, s.product_types, s.industries, s.use_cases, s.style_tags, 'public'
from seed s join public.fuse_templates t on t.slug = s.slug
on conflict (template_id) do update set
  public_name = excluded.public_name,
  one_sentence_description = excluded.one_sentence_description,
  product_types = excluded.product_types,
  industries = excluded.industries,
  use_cases = excluded.use_cases,
  style_tags = excluded.style_tags,
  updated_at = now();
