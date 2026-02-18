import { useState } from "react";
import { X } from "lucide-react";
import DropCountdownBar from "./templates/DropCountdownBar";
import TrendingBar from "./templates/TrendingBar";
import DropTemplateCard from "./templates/DropTemplateCard";
import FilterDropdown from "./templates/FilterDropdown";
import { drops, filterOptions } from "./templates/dropData";

const TemplateCategories = () => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeFilters, setActiveFilters] = useState<Record<string, string | null>>({});
  const [trendingFilter, setTrendingFilter] = useState("");

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const setFilter = (key: string, value: string | null) =>
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  const clearAllFilters = () => setActiveFilters({});

  const filteredDrops = (activeCategory === "all" ? drops : drops.filter((d) => d.slug === activeCategory))
    .map((drop) => ({
      ...drop,
      templates: drop.templates.filter((t) =>
        Object.entries(activeFilters).every(([key, val]) => {
          if (!val) return true;
          return t.filters[key as keyof typeof t.filters] === val;
        })
      ),
    }))
    .filter((drop) => drop.templates.length > 0);

  const totalVisible = filteredDrops.reduce((sum, d) => sum + d.templates.length, 0);

  return (
    <section className="py-24 relative">
      {/* Grain texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.04%27/%3E%3C/svg%3E')] bg-repeat" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <div className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-white/25 mb-2">
            Choose your creative direction
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">
            Current Drops
          </h2>
        </div>

        {/* LIVE DROP banner */}
        <div className="mb-8 flex items-center gap-4 px-5 py-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">Live Drop — Vol 03</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <p className="text-[10px] text-white/35 uppercase tracking-wider">
            Urban flash + wide lens distortion pack
          </p>
          <span className="ml-auto text-[9px] font-mono text-white/20 uppercase tracking-wider hidden sm:block">
            Released Feb 2026
          </span>
        </div>

        {/* Countdown */}
        <DropCountdownBar />

        {/* Trending bar */}
        <TrendingBar active={trendingFilter} onChange={setTrendingFilter} />

        {/* Filter bar */}
        <div className="mb-4 p-3 rounded-xl border border-white/[0.04] bg-white/[0.015]">
          <div className="flex flex-wrap items-center gap-2">
            {filterOptions.map((f) => (
              <FilterDropdown
                key={f.key}
                filter={f}
                value={activeFilters[f.key] || null}
                onChange={(val) => setFilter(f.key, val)}
              />
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[9px] uppercase tracking-wider text-white/25 hover:text-white/50 transition-colors ml-2 flex items-center gap-1"
              >
                <X className="w-2.5 h-2.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-[9px] font-mono text-white/15">
              {totalVisible} templates
            </span>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-14">
          <button
            onClick={() => setActiveCategory("all")}
            className={`text-[10px] font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-lg border transition-all duration-200 ${
              activeCategory === "all"
                ? "bg-white/10 border-white/15 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                : "bg-transparent border-white/[0.05] text-white/30 hover:text-white/55 hover:border-white/10"
            }`}
          >
            All Drops
          </button>
          {drops.map((drop) => (
            <button
              key={drop.slug}
              onClick={() => setActiveCategory(drop.slug)}
              className={`text-[10px] font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-lg border transition-all duration-200 ${
                activeCategory === drop.slug
                  ? "bg-white/10 border-white/15 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                  : "bg-transparent border-white/[0.05] text-white/30 hover:text-white/55 hover:border-white/10"
              }`}
            >
              {drop.icon} {drop.title}
            </button>
          ))}
        </div>

        {/* Drop collections */}
        <div className="space-y-20">
          {filteredDrops.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-white/25 text-xs uppercase tracking-wider">No templates match your filters.</p>
              <button onClick={clearAllFilters} className="text-[10px] text-white/35 hover:text-white/60 mt-3 underline underline-offset-4 uppercase tracking-wider">
                Clear filters
              </button>
            </div>
          ) : (
            filteredDrops.map((drop) => (
              <div key={drop.slug}>
                {/* Collection header */}
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono font-bold text-white/20 uppercase tracking-[0.2em]">
                      {drop.volume}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
                    <span className="text-[9px] font-mono text-white/15 uppercase tracking-wider">
                      {drop.releaseDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{drop.icon}</span>
                    <h3 className="font-display text-lg font-bold text-white/85 tracking-[0.08em] uppercase">
                      {drop.title}
                    </h3>
                  </div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1 ml-9">
                    {drop.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
                  {drop.templates.map((template) => (
                    <DropTemplateCard
                      key={template.id}
                      template={template}
                      volLabel={`${drop.volume} — ${drop.title}`}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default TemplateCategories;
