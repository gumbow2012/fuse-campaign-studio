import { Play } from "lucide-react";
import gasStationVideo from "@/assets/templates/gas-station-snow.mp4";

const ExampleOutput = () => {
  return (
    <div className="relative w-full max-w-[220px] aspect-[9/16] rounded-2xl overflow-hidden glass-strong group cursor-pointer">
      <video
        src={gasStationVideo}
        className="w-full h-full object-contain bg-background"
        muted
        loop
        playsInline
        preload="metadata"
      />

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/20 group-hover:bg-background/10 transition-colors">
        <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center glow-blue-sm group-hover:scale-110 transition-transform">
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Label */}
      <div className="absolute bottom-3 right-3 z-10">
        <span className="text-[10px] text-muted-foreground/80 bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
          Example Output
        </span>
      </div>
    </div>
  );
};

export default ExampleOutput;
