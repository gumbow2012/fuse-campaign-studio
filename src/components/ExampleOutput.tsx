import { Play } from "lucide-react";
import ravenOriginal from "@/assets/templates/raven-original.png";

const ExampleOutput = () => {
  return (
    <div className="relative w-full max-w-[300px] rounded-2xl overflow-hidden border border-border/30 group cursor-pointer">
      <img
        src={ravenOriginal}
        alt="Example output"
        className="w-full h-auto object-contain"
      />

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center">
          <Play className="w-6 h-6 text-foreground ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Label */}
      <div className="absolute bottom-3 right-3 z-10">
        <span className="text-[11px] text-foreground/80 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
          Example Output
        </span>
      </div>
    </div>
  );
};

export default ExampleOutput;
