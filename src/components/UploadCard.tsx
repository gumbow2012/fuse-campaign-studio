import { Upload, Minus, Plus, GripVertical, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

const FileNodeHeader = () => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <GripVertical className="w-4 h-4 text-white/30" />
      <span className="text-xs font-semibold tracking-wide bg-blue-600 text-white px-3 py-1 rounded-md">File</span>
      <div className="flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent ml-1 min-w-[80px]" />
    </div>
    <MoreVertical className="w-4 h-4 text-white/40" />
  </div>
);

const DropZone = ({ label }: { label: string }) => (
  <div>
    <FileNodeHeader />
    <label className="text-[11px] font-semibold uppercase tracking-widest text-white/70 mb-2 block">
      {label}
    </label>
    <div className="border border-dashed border-white/20 rounded-xl py-10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/40 hover:bg-white/[0.03] transition-all group">
      <svg className="w-10 h-10 text-white/25 group-hover:text-white/40 transition-colors" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="10" width="36" height="28" rx="4" />
        <rect x="10" y="14" width="12" height="9" rx="2" />
        <rect x="26" y="14" width="12" height="9" rx="2" />
        <rect x="10" y="27" width="12" height="7" rx="2" />
        <rect x="26" y="27" width="12" height="7" rx="2" />
        <line x1="18" y1="6" x2="18" y2="10" />
        <line x1="30" y1="6" x2="30" y2="10" />
      </svg>
      <p className="text-sm text-white/50 font-medium">Drag & drop or click to upload</p>
    </div>
  </div>
);

const UploadCard = () => {
  return (
    <div className="w-[320px] flex flex-col gap-4 relative z-10">
      {/* Upload zones card */}
      <div className="rounded-2xl p-5 flex flex-col gap-6 border border-white/10 bg-[#1a1a2e]/80 backdrop-blur-xl shadow-2xl">
        <DropZone label="CLOTHING" />
        <DropZone label="LOGO" />
      </div>

      {/* Runs & Run button card */}
      <div className="rounded-2xl p-5 flex flex-col gap-3 border border-white/10 bg-[#1a1a2e]/80 backdrop-blur-xl shadow-2xl">
        {/* Runs row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/80 font-medium">Runs</span>
          <div className="h-9 bg-white/[0.05] border border-white/10 rounded-lg flex items-center px-1">
            <button className="w-7 h-full flex items-center justify-center text-white/40 hover:text-white transition-colors">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-medium text-white">1</span>
            <button className="w-7 h-full flex items-center justify-center text-white/40 hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Cost row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/30 italic">Total cost</span>
          <span className="text-xs text-white/50 font-medium">✳ 572 credits</span>
        </div>

        {/* Run button - yellow/lime */}
        <Button className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-bold text-sm tracking-widest rounded-full h-11 shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 border-0 relative overflow-hidden group uppercase">
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full" />
          <span className="relative z-10">RUN</span>
        </Button>
      </div>
    </div>
  );
};

export default UploadCard;
