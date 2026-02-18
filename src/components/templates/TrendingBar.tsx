import { useState } from "react";

const tabs = [
  { icon: "🔥", label: "Trending", slug: "trending" },
  { icon: "⚡", label: "Most Run", slug: "most-run" },
  { icon: "🩸", label: "Underground", slug: "underground" },
  { icon: "🧊", label: "Editorial", slug: "editorial" },
] as const;

interface TrendingBarProps {
  active: string;
  onChange: (slug: string) => void;
}

const TrendingBar = ({ active, onChange }: TrendingBarProps) => (
  <div className="flex items-center gap-1.5 mb-8 overflow-x-auto scrollbar-hide">
    {tabs.map((tab) => (
      <button
        key={tab.slug}
        onClick={() => onChange(active === tab.slug ? "" : tab.slug)}
        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] px-3.5 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap ${
          active === tab.slug
            ? "bg-white/10 border-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.05)]"
            : "bg-transparent border-white/[0.05] text-white/30 hover:text-white/50 hover:border-white/10"
        }`}
      >
        <span>{tab.icon}</span>
        <span>{tab.label}</span>
      </button>
    ))}
  </div>
);

export default TrendingBar;
