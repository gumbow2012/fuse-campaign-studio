import { useRef, useEffect } from "react";
import exampleVideo from "@/assets/example-output.mp4";

const ExampleOutput = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {});
  }, []);

  return (
    <div className="relative w-[260px] rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.5)] group">
      <video
        ref={videoRef}
        src={exampleVideo}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        className="w-full h-auto object-cover transition-transform duration-[3000ms] ease-out group-hover:scale-[1.04]"
      />

      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.06%27/%3E%3C/svg%3E')] bg-repeat mix-blend-overlay" />

      {/* Label */}
      <div className="absolute bottom-2.5 right-2.5 z-10">
        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/50 bg-black/60 backdrop-blur-sm px-2 py-1 rounded">
          Example Output
        </span>
      </div>
    </div>
  );
};

export default ExampleOutput;
