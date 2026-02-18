import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import DropCountdownBar from "./templates/DropCountdownBar";
import DropTemplateCard from "./templates/DropTemplateCard";
import FilterDropdown from "./templates/FilterDropdown";
import { drops, filterOptions } from "./templates/dropData";

const TemplateCategories = () => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeFilters, setActiveFilters] = useState<Record<string, string | null>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  return (
    <section className="py-28 relative">
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.04%27/%3E%3C/svg%3E')] bg-repeat" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header — just title */}
        <h2 className="font-display text-3xl md:text-4xl font-black text-white tracking-tight mb-10">
          Current Drops
        </h2>

        {/* Category tabs + collapsible filters */}
        <div className="mb-14">
          {/* Category row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <button
              onClick={() => setActiveCategory("all")}
              className={`text-[9px] font-black uppercase tracking-[0.12em] px-3 py-1.5 rounded-md transition-all duration-200 ${
                activeCategory === "all" ? "bg-white/8 text-white" : "text-white/25 hover:text-white/45"
              }`}
            >
              All
            </button>
            {drops.map((drop) => (
              <button
                key={drop.slug}
                onClick={() => setActiveCategory(drop.slug)}
                className={`text-[9px] font-black uppercase tracking-[0.12em] px-3 py-1.5 rounded-md transition-all duration-200 ${
                  activeCategory === drop.slug ? "bg-white/8 text-white" : "text-white/25 hover:text-white/45"
                }`}
              >
                {drop.icon} {drop.title}
              </button>
            ))}

            {/* Filter toggle */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="ml-auto text-[8px] font-bold uppercase tracking-[0.15em] text-white/20 hover:text-white/40 transition-colors flex items-center gap-1"
            >
              Filters <ChevronDown className={`w-2.5 h-2.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Collapsible filters */}
          {filtersOpen && (
            <div className="p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] animate-fade-in">
              <div className="flex flex-wrap items-center gap-2">
                {filterOptions.map((f) => (
                  <FilterDropdown key={f.key} filter={f} value={activeFilters[f.key] || null} onChange={(val) => setFilter(f.key, val)} />
                ))}
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} className="text-[8px] uppercase tracking-wider text-white/20 hover:text-white/40 transition-colors ml-1 flex items-center gap-1">
                    <X className="w-2.5 h-2.5" /> Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Drop collections */}
        <div className="space-y-0">
          {filteredDrops.length === 0 ? (
            <div className="text-center py-28">
              <p className="text-white/20 text-[10px] uppercase tracking-[0.2em]">No templates match your filters.</p>
              <button onClick={clearAllFilters} className="text-[9px] text-white/30 hover:text-white/55 mt-3 underline underline-offset-4 uppercase tracking-wider">
                Clear filters
              </button>
            </div>
          ) : (
            filteredDrops.map((drop, idx) => (
              <div key={drop.slug} className={idx > 0 ? "pt-24" : ""}>
                {idx > 0 && (
                  <div className="mb-16 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                )}

                {/* VOL header — bold title first */}
                <div className="mb-10">
                  {/* Title row */}
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xl">{drop.icon}</span>
                    <h3 className="font-display text-xl font-black text-white tracking-[0.1em] uppercase">
                      {drop.title}
                    </h3>
                  </div>

                  {/* Descriptor */}
                  <p className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-bold ml-10 mb-2">
                    {drop.description}
                  </p>

                  {/* VOL + template count + countdown (for vol 03) */}
                  <div className="flex flex-wrap items-center gap-3 ml-10 text-[8px] font-mono uppercase tracking-[0.2em] text-white/15">
                    <span>{drop.volume}</span>
                    <span className="text-white/[0.06]">—</span>
                    <span>{drop.templates.length} Templates</span>
                    {drop.slug === "viral" && (
                      <>
                        <span className="text-white/[0.06]">—</span>
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                          </span>
                          <span className="text-white/25">Live</span>
                          <span className="text-white/[0.06]">·</span>
                          <span className="text-white/20">Next drop in</span>
                          <DropCountdownBar />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Run full pack */}
                  <div className="mt-5 ml-10">
                    <button className="text-[8px] font-black uppercase tracking-[0.25em] px-5 py-2.5 rounded-lg border border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/15 hover:bg-white/[0.03] transition-all duration-300">
                      Run Full Pack →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
                  {drop.templates.map((template) => (
                    <DropTemplateCard key={template.id} template={template} volLabel={`${drop.volume} — ${drop.title}`} />
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
