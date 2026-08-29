/**
 * "What your membership unlocks" — curated existing campaign media only.
 * Files live in /public/template-previews. Nothing is generated here.
 */
const PREVIEWS = [
  { src: "/template-previews/armored-truck.gif", label: "Armored Truck" },
  { src: "/template-previews/paparazzi.gif", label: "Paparazzi" },
  { src: "/template-previews/raven.gif", label: "Raven" },
  { src: "/template-previews/garage.gif", label: "Garage" },
  { src: "/template-previews/skatepark.gif", label: "Skatepark" },
  { src: "/template-previews/unboxing.gif", label: "Unboxing" },
  { src: "/template-previews/ugc-mirror.gif", label: "UGC Mirror" },
  { src: "/template-previews/jeans.gif", label: "Denim Studio" },
  { src: "/template-previews/blue-lab.gif", label: "Blue Lab" },
  { src: "/template-previews/doctor.gif", label: "Clinic" },
  { src: "/template-previews/amazon-guy.gif", label: "Delivery" },
];

export default function TemplatePreviewCarousel() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 md:p-7">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">What your membership unlocks</p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
        Pick a campaign. Upload your brand. Generate.
      </h2>

      <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-2 md:-mx-7 md:px-7">
        <div className="flex w-max gap-4">
          {PREVIEWS.map((preview) => (
            <figure
              key={preview.src}
              className="w-[150px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:w-[180px]"
            >
              <img
                src={preview.src}
                alt={`${preview.label} campaign template preview`}
                loading="lazy"
                className="aspect-[9/16] w-full object-cover"
              />
              <figcaption className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-300">
                {preview.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <p className="mt-2 text-sm text-cyan-100/90">New campaigns added daily.</p>
    </section>
  );
}
