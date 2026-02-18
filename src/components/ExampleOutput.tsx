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
    <div className="relative w-[260px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <video
        ref={videoRef}
        src={exampleVideo}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        className="w-full h-auto object-cover"
      />

      {/* Label */}
      <div className="absolute bottom-3 right-3 z-10">
        <span className="text-[10px] text-white/70 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded">
          Example Output
        </span>
      </div>
    </div>
  );
};

export default ExampleOutput;
