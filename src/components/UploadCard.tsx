import { Upload, Image, ChevronDown, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const UploadCard = () => {
  return (
    <div className="glass-strong rounded-2xl p-5 w-[280px] flex flex-col gap-4 border border-white/10 shadow-2xl bg-[#0f172a]/60 backdrop-blur-xl relative z-10">
      {/* Product upload zone */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-wider text-blue-200/60 mb-2 block pl-1">
          PRODUCT
        </label>
        <div className="border border-dashed border-blue-400/20 rounded-xl py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-400/50 hover:bg-blue-400/5 transition-all group bg-white/[0.02]">
          <Upload className="w-5 h-5 text-blue-300/40 group-hover:text-blue-400 transition-colors stroke-[1.5]" />
          <p className="text-sm text-blue-50/90 font-medium">dreg & drop</p>
          <p className="text-xs text-blue-200/40">or click to upload</p>
        </div>
      </div>

      {/* Logo upload zone */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-wider text-blue-200/60 mb-2 block pl-1">
          LOGO
        </label>
        <div className="border border-dashed border-blue-400/20 rounded-xl py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-400/50 hover:bg-blue-400/5 transition-all group bg-white/[0.02]">
          <Image className="w-5 h-5 text-blue-300/40 group-hover:text-blue-400 transition-colors stroke-[1.5]" />
          <p className="text-sm text-blue-50/90 font-medium">drag & drop</p>
          <p className="text-xs text-blue-200/40">or click to upload</p>
        </div>
      </div>

      {/* Runs & Credits Control */}
      <div className="flex items-center gap-3">
        {/* Runs Dropdown */}
        <div className="flex-1 h-10 bg-white/[0.03] border border-white/10 rounded-lg flex items-center justify-between px-3 cursor-pointer hover:bg-white/[0.08] transition-colors group">
          <span className="text-sm text-blue-50/80 font-medium">Runs</span>
          <ChevronDown className="w-4 h-4 text-blue-200/40 group-hover:text-blue-200/80 transition-colors" />
        </div>
        
        {/* Counter */}
        <div className="h-10 bg-white/[0.03] border border-white/10 rounded-lg flex items-center px-1">
          <button className="w-8 h-full flex items-center justify-center text-blue-200/40 hover:text-blue-50 transition-colors">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-medium text-blue-50">1</span>
          <button className="w-8 h-full flex items-center justify-center text-blue-200/40 hover:text-blue-50 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="text-center -mt-1 pb-1">
        <p className="text-xs text-blue-200/40 font-medium tracking-wide">Total cost: 572 credits</p>
      </div>

      {/* RUN button */}
      <Button className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-bold text-sm tracking-widest rounded-full h-11 shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 border-0 relative overflow-hidden group uppercase">
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full" />
        <span className="relative z-10">RUN</span>
      </Button>
    </div>
  );
};

export default UploadCard;
