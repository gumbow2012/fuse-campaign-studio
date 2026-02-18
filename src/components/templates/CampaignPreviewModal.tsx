import { X } from "lucide-react";
import type { Template } from "./DropTemplateCard";

interface CampaignPreviewModalProps {
  template: Template;
  volLabel: string;
  onClose: () => void;
}

const energyColors: Record<string, string> = {
  Aggressive: "text-red-400/70",
  Clean: "text-cyan-400/70",
  Romantic: "text-pink-400/70",
  Dark: "text-violet-400/70",
  Flashy: "text-amber-400/70",
  Cinematic: "text-blue-400/70",
  Gritty: "text-orange-400/70",
};

const shotTypes = [
  { label: "FRONT", aspect: "aspect-[3/4]", desc: "On-Model Front" },
  { label: "CLOSEUP", aspect: "aspect-square", desc: "Detail Closeup" },
  { label: "LIFESTYLE", aspect: "aspect-[4/3]", desc: "Lifestyle Context" },
  { label: "VERTICAL", aspect: "aspect-[9/16]", desc: "TikTok / Reels" },
  { label: "MACRO", aspect: "aspect-square", desc: "Texture Detail" },
];

const CampaignPreviewModal = ({ template, volLabel, onClose }: CampaignPreviewModalProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" />

      {/* Content */}
      <div
        className="relative z-10 w-full max-w-6xl max-h-[90vh] overflow-y-auto mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/[0.08] text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-8 pt-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[9px] font-mono text-white/20 tracking-[0.25em]">{template.id}</span>
            <div className="h-px flex-1 bg-white/[0.04]" />
            <span className="text-[8px] font-mono text-white/15 uppercase tracking-[0.2em]">{volLabel}</span>
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-black text-white tracking-[0.06em] uppercase mb-2">
            {template.name}
          </h2>
          <p className="text-[11px] text-white/30 uppercase tracking-[0.15em] font-medium max-w-xl">
            {template.description}
          </p>
        </div>

        {/* Metadata bar */}
        <div className="flex flex-wrap items-center gap-4 mb-8 pb-6 border-b border-white/[0.04]">
          <div className="flex flex-wrap gap-1.5">
            {template.tags.map((tag) => (
              <span key={tag} className="text-[7px] font-bold uppercase tracking-[0.15em] text-white/35 bg-white/[0.04] border border-white/[0.05] px-2 py-1 rounded">
                {tag}
              </span>
            ))}
          </div>
          <div className="h-4 w-px bg-white/[0.06]" />
          {template.energy && (
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${energyColors[template.energy] || "text-white/40"}`}>
              Energy: {template.energy}
            </span>
          )}
          {template.badge && (
            <>
              <div className="h-4 w-px bg-white/[0.06]" />
              <span className={`text-[7px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded ${
                template.badge === "HIGH DEMAND" ? "bg-red-900/30 text-red-300 border border-red-500/20" :
                template.badge === "NEW" ? "bg-emerald-900/30 text-emerald-300 border border-emerald-500/20" :
                "bg-amber-900/30 text-amber-300 border border-amber-500/20"
              }`}>
                {template.badge}
              </span>
            </>
          )}
        </div>

        {/* Shot grid */}
        <div className="mb-8">
          <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/15 mb-5">
            Campaign Shots — {shotTypes.length} Deliverables
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {shotTypes.map((shot) => (
              <div key={shot.label} className="group/shot">
                <div className={`${shot.aspect} rounded-xl overflow-hidden border border-white/[0.06] relative bg-white/[0.02] transition-all duration-300 group-hover/shot:border-white/15 group-hover/shot:shadow-[0_8px_30px_rgba(0,0,0,0.5)]`}>
                  <img
                    src={template.image}
                    alt={`${template.name} — ${shot.label}`}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover/shot:scale-[1.08]"
                  />
                  {/* Grain */}
                  <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.06%27/%3E%3C/svg%3E')] bg-repeat mix-blend-overlay" />
                  {/* Shot label overlay */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/70">{shot.label}</p>
                  </div>
                </div>
                <p className="text-[8px] text-white/20 uppercase tracking-wider mt-2 font-medium">{shot.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Includes + Creative DNA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 pt-6 border-t border-white/[0.04]">
          {/* Includes */}
          <div>
            <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/15 mb-3">Includes</p>
            <div className="space-y-1.5">
              {template.includes.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-white/15" />
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Creative DNA */}
          <div>
            <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/15 mb-3">Creative DNA</p>
            <div className="space-y-1.5">
              {Object.entries(template.filters).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[8px] text-white/20 uppercase tracking-[0.15em] font-bold">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="text-[9px] text-white/40 font-mono">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4 pt-6 border-t border-white/[0.04] pb-4">
          <button className="px-8 py-3 text-[9px] font-black uppercase tracking-[0.25em] bg-white/8 border border-white/10 text-white/80 rounded-lg hover:bg-white/12 hover:text-white transition-all duration-300">
            Run This Campaign →
          </button>
          <button onClick={onClose} className="px-6 py-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/25 hover:text-white/50 transition-all">
            Back to Drops
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignPreviewModal;
