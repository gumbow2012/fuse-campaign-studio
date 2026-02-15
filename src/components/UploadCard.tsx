import { Upload, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

const UploadCard = () => {
  return (
    <div className="glass-strong rounded-2xl p-6 w-[240px] flex flex-col gap-3">
      {/* Product upload zone */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90 mb-2 block">
          Product
        </label>
        <div className="border border-dashed border-border/40 rounded-lg py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/40 transition-colors group">
          <Upload className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-[11px] text-muted-foreground">dreg & drop</p>
          <p className="text-[11px] text-muted-foreground -mt-0.5">or click to upload</p>
        </div>
      </div>

      {/* Logo upload zone */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90 mb-2 block">
          Logo
        </label>
        <div className="border border-dashed border-border/40 rounded-lg py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/40 transition-colors group">
          <Image className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-[11px] text-muted-foreground">drag & drop</p>
          <p className="text-[11px] text-muted-foreground -mt-0.5">or click to upload</p>
        </div>
      </div>

      {/* RUN button */}
      <Button className="w-full gradient-primary text-primary-foreground font-semibold text-sm rounded-full h-10 glow-blue hover:opacity-90 transition-opacity border-0 mt-1">
        RUN
      </Button>
    </div>
  );
};

export default UploadCard;
