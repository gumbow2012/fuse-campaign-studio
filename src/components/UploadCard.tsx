import { Minus, Plus, GripVertical, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

const FileNodeHeader = () => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <GripVertical className="w-3.5 h-3.5 text-white/20" />
      <span className="text-[9px] font-black tracking-[0.15em] uppercase bg-blue-600/80 text-white px-2.5 py-0.5 rounded">File</span>
      <div className="flex-1 h-px bg-gradient-to-r from-blue-500/30 to-transparent ml-1 min-w-[60px]" />
    </div>
    <MoreVertical className="w-3.5 h-3.5 text-white/25" />
  </div>
);

const DropZone = ({ label }: { label: string }) => (
  <div>
    <FileNodeHeader />
    <label className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50 mb-2 block">
      {label}
    </label>
    <div className="border border-dashed border-white/15 rounded-lg py-9 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/30 hover:bg-white/[0.02] transition-all group">
      <svg className="w-9 h-9 text-white/15 group-hover:text-white/30 transition-colors" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="10" width="36" height="28" rx="4" />
        <rect x="10" y="14" width="12" height="9" rx="2" />
        <rect x="26" y="14" width="12" height="9" rx="2" />
        <rect x="10" y="27" width="12" height="7" rx="2" />
        <rect x="26" y="27" width="12" height="7" rx="2" />
        <line x1="18" y1="6" x2="18" y2="10" />
        <line x1="30" y1="6" x2="30" y2="10" />
      </svg>
      <p className="text-xs text-white/35 font-medium">Drag & drop or click</p>
    </div>
  </div>
);

const UploadCard = () => {
  return (
    <div className="w-[320px] flex flex-col gap-3 relative z-10">
      {/* Upload zones */}
      <div className="rounded-xl p-5 flex flex-col gap-5 border border-white/[0.08] bg-[#0a0e18]/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
        <DropZone label="Garment File" />
        <DropZone label="Brand Asset" />
      </div>

      {/* Runs & Run button */}
      <div className="rounded-xl p-5 flex flex-col gap-3 border border-white/[0.08] bg-[#0a0e18]/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/60 font-bold uppercase tracking-wider">Runs</span>
          <div className="h-8 bg-white/[0.04] border border-white/[0.08] rounded-lg flex items-center px-1">
            <button className="w-6 h-full flex items-center justify-center text-white/30 hover:text-white transition-colors">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-5 text-center text-xs font-bold text-white/80">1</span>
            <button className="w-6 h-full flex items-center justify-center text-white/30 hover:text-white transition-colors">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/20 font-medium">Total cost</span>
          <span className="text-[10px] text-white/35 font-bold">✳ 572 credits</span>
        </div>

        <Button className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-black text-xs tracking-[0.25em] rounded-lg h-10 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 border-0 relative overflow-hidden group uppercase">
          <div className="absolute inset-0 bg-white/15 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="relative z-10">RUN</span>
        </Button>

        {/* Output estimate */}
        <div className="pt-2 border-t border-white/[0.04] space-y-1">
          <p className="text-[8px] text-white/15 uppercase tracking-[0.2em] font-bold">
            Est. Output: 6–12 Assets
          </p>
          <p className="text-[8px] text-white/12 uppercase tracking-[0.15em]">
            Includes: On-model / Closeup / Editorial
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadCard;
