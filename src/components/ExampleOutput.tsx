import { Play } from "lucide-react";
import ravenOriginal from "@/assets/templates/raven-original.png";

const ExampleOutput = () => {
  return (
    <div className="relative w-[260px] rounded-2xl overflow-hidden border border-border/20 group cursor-pointer">
      <img
        src={ravenOriginal}
        alt="Example output"
        className="w-full h-auto object-contain"
      />

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-background/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
          <Play className="w-5 h-5 text-foreground/80 ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Label */}
      <div className="absolute bottom-3 right-3 z-10">
        <span className="text-[10px] text-foreground/70 bg-background/50 backdrop-blur-sm px-2.5 py-1 rounded">
          Example Output
        </span>
      </div>
    </div>
  );
};

export default ExampleOutput;
