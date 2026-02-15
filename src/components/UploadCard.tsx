import { Upload, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

const UploadCard = () => {
  return (
    <div className="glass-strong rounded-2xl p-5 w-full max-w-[280px] flex flex-col gap-4">
      {/* Product upload zone */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2 block">
          Product
        </label>
        <div className="border border-dashed border-border/50 rounded-xl py-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition-colors group">
          <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-xs text-muted-foreground">dreg & drop</p>
          <p className="text-xs text-muted-foreground -mt-1">or click to upload</p>
        </div>
      </div>

      {/* Logo upload zone */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2 block">
          Logo
        </label>
        <div className="border border-dashed border-border/50 rounded-xl py-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition-colors group">
          <Image className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-xs text-muted-foreground">drag & drop</p>
          <p className="text-xs text-muted-foreground -mt-1">or click to upload</p>
        </div>
      </div>

      {/* RUN button */}
      <Button className="w-full gradient-primary text-primary-foreground font-semibold text-base rounded-full h-12 glow-blue hover:opacity-90 transition-opacity border-0 mt-1">
        RUN
      </Button>
    </div>
  );
};

export default UploadCard;
