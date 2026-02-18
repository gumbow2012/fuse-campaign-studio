interface Template {
  id: string;
  name: string;
  image: string;
  tags: string[];
  includes: string[];
  description: string;
  badge?: string;
  filters: {
    environment: string;
    cameraAngle: string;
    lighting: string;
    mood: string;
    gender: string;
    timeOfDay: string;
    style: string;
  };
}

const DropTemplateCard = ({ template, volLabel }: { template: Template; volLabel: string }) => (
  <div className="group cursor-pointer relative">
    <div className="w-full aspect-[9/16] rounded-xl overflow-hidden border border-white/[0.06] relative transition-all duration-300 group-hover:border-white/20 group-hover:-translate-y-1.5 group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
      <img
        src={template.image}
        alt={template.name}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        loading="lazy"
      />

      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.05%27/%3E%3C/svg%3E')] bg-repeat mix-blend-overlay" />

      {/* Badge */}
      {template.badge && (
        <div className="absolute top-2.5 left-2.5 z-10">
          <span className={`text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-md backdrop-blur-md ${
            template.badge === "NEW" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20" :
            template.badge === "HIGH DEMAND" ? "bg-red-500/20 text-red-300 border border-red-500/20" :
            template.badge === "LIMITED" ? "bg-amber-500/20 text-amber-300 border border-amber-500/20" :
            "bg-white/10 text-white/60 border border-white/10"
          }`}>
            {template.badge}
          </span>
        </div>
      )}

      {/* Hover overlay - cinematic metadata */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10 opacity-0 group-hover:opacity-100 transition-all duration-400 flex flex-col justify-end p-4">
        <p className="text-[9px] text-white/30 font-mono mb-0.5 tracking-wider">{template.id}</p>
        <h4 className="text-xs font-bold text-white tracking-[0.05em] uppercase leading-tight mb-0.5">
          {template.name}
        </h4>
        <p className="text-[9px] text-white/35 font-mono uppercase tracking-wider mb-2.5">{volLabel}</p>

        <p className="text-[10px] text-white/50 mb-2.5 leading-relaxed uppercase tracking-wide font-medium">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-1 mb-2.5">
          {template.tags.map((tag) => (
            <span key={tag} className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/50 bg-white/[0.06] backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/[0.04]">
              {tag}
            </span>
          ))}
        </div>

        <div className="border-t border-white/[0.06] pt-2 mb-3">
          <p className="text-[8px] text-white/25 uppercase tracking-[0.15em] mb-1">Includes</p>
          <p className="text-[9px] text-white/40 font-mono">
            {template.includes.join(" · ")}
          </p>
        </div>

        <button className="w-full py-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-all duration-200 backdrop-blur-sm">
          View Full Campaign
        </button>
      </div>
    </div>

    {/* Static label */}
    <div className="mt-2.5 px-0.5">
      <p className="text-[9px] text-white/20 font-mono tracking-wider">{template.id}</p>
      <p className="text-[11px] font-bold text-white/70 tracking-[0.05em] uppercase">{template.name}</p>
    </div>
  </div>
);

export { type Template };
export default DropTemplateCard;
