import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CampaignPreviewModal from "./CampaignPreviewModal";

interface Template {
  id: string;
  name: string;
  image: string;
  tags: string[];
  includes: string[];
  description: string;
  badge?: string;
  energy?: string;
  dbTemplateId?: string;
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

const energyColors: Record<string, string> = {
  Aggressive: "text-red-400/70",
  Clean: "text-cyan-400/70",
  Romantic: "text-pink-400/70",
  Dark: "text-violet-400/70",
  Flashy: "text-amber-400/70",
  Cinematic: "text-blue-400/70",
  Gritty: "text-orange-400/70",
};

const DropTemplateCard = ({ template, volLabel }: { template: Template; volLabel: string }) => {
  const [showPreview, setShowPreview] = useState(false);
  const navigate = useNavigate();

  const handleRunClick = () => {
    if (template.dbTemplateId) {
      navigate(`/app/templates/run?templateId=${template.dbTemplateId}`);
    } else {
      navigate("/app/templates/run");
    }
  };
  return (
    <>
      <div className="group cursor-pointer relative">
        <div className="w-full aspect-[9/16] rounded-xl overflow-hidden border border-white/[0.05] relative transition-all duration-500 group-hover:border-white/15 group-hover:-translate-y-2 group-hover:shadow-[0_16px_50px_rgba(0,0,0,0.7)]">
          <img
            src={template.image}
            alt={template.name}
            className="w-full h-full object-cover transition-transform ease-out group-hover:scale-[1.12]"
            style={{ transitionDuration: "1200ms" }}
            loading="lazy"
          />

          {/* Grain overlay on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.08%27/%3E%3C/svg%3E')] bg-repeat mix-blend-overlay" />

          {/* Flash flicker on hover */}
          <div className="absolute inset-0 bg-white/[0.03] opacity-0 group-hover:animate-[pulse_0.8s_ease-in-out_1] pointer-events-none" />

          {/* Badge */}
          {template.badge && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <span className={`text-[7px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded backdrop-blur-md ${
                template.badge === "HIGH DEMAND"
                  ? "bg-red-900/40 text-red-300 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-[pulse_3s_ease-in-out_infinite]"
                  : template.badge === "NEW"
                  ? "bg-emerald-900/40 text-emerald-300 border border-emerald-500/25"
                  : template.badge === "LIMITED"
                  ? "bg-amber-900/40 text-amber-300 border border-amber-500/25"
                  : "bg-white/5 text-white/50 border border-white/10"
              }`}>
                {template.badge}
              </span>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/5 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4">
            <p className="text-[8px] text-white/25 font-mono tracking-[0.2em] mb-0.5">{template.id}</p>
            <h4 className="text-[11px] font-black text-white tracking-[0.06em] uppercase leading-tight mb-0.5">
              {template.name}
            </h4>
            <p className="text-[8px] text-white/25 font-mono uppercase tracking-[0.15em] mb-3">{volLabel}</p>

            <div className="flex flex-wrap gap-1 mb-3">
              {template.tags.map((tag) => (
                <span key={tag} className="text-[7px] font-bold uppercase tracking-[0.12em] text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.05] hover:bg-white/[0.08] hover:text-white/60 transition-all">
                  {tag}
                </span>
              ))}
            </div>

            <div className="border-t border-white/[0.05] pt-2 mb-2">
              <p className="text-[7px] text-white/20 uppercase tracking-[0.2em] mb-1">Includes</p>
              <p className="text-[8px] text-white/35 font-mono">{template.includes.join(" · ")}</p>
            </div>

            {template.energy && (
              <div className="mb-3">
                <span className={`text-[7px] font-bold uppercase tracking-[0.2em] ${energyColors[template.energy] || "text-white/40"}`}>
                  Energy: {template.energy}
                </span>
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); handleRunClick(); }}
              className="w-full py-2 text-[8px] font-black uppercase tracking-[0.2em] text-black bg-white/90 rounded-lg hover:bg-white transition-all duration-200 backdrop-blur-sm"
            >
              Run This Template →
            </button>
          </div>
        </div>

        {/* Static label */}
        <div className="mt-3 px-0.5">
          <p className="text-[8px] text-white/15 font-mono tracking-[0.2em]">{template.id}</p>
          <p className="text-[10px] font-black text-white/60 tracking-[0.06em] uppercase mt-0.5">{template.name}</p>
          {template.energy && (
            <p className={`text-[7px] font-bold uppercase tracking-[0.2em] mt-1 ${energyColors[template.energy] || "text-white/30"}`}>
              {template.energy}
            </p>
          )}
        </div>
      </div>

      {showPreview && (
        <CampaignPreviewModal
          template={template}
          volLabel={volLabel}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

export { type Template };
export default DropTemplateCard;
