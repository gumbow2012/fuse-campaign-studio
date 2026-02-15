import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const UploadCard = () => {
  return (
    <div className="glass-strong rounded-2xl p-6 w-full max-w-sm">
      {/* Product upload zone */}
      <div className="mb-4">
        <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2 block">
          Product
        </label>
        <div className="border border-dashed border-border/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition-colors group">
          <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-xs text-muted-foreground">Drag & drop or click to upload</p>
        </div>
      </div>

      {/* Logo upload zone */}
      <div className="mb-6">
        <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2 block">
          Logo
        </label>
        <div className="border border-dashed border-border/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition-colors group">
          <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          <p className="text-xs text-muted-foreground">Drag & drop or click to upload</p>
        </div>
      </div>

      {/* RUN button */}
      <Button className="w-full gradient-primary text-primary-foreground font-semibold text-base rounded-xl h-12 glow-blue hover:opacity-90 transition-opacity border-0">
        RUN
      </Button>
    </div>
  );
};

export default UploadCard;
