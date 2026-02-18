import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface FilterOption {
  key: string;
  label: string;
  icon: string;
  options: string[];
}

const FilterDropdown = ({
  filter,
  value,
  onChange,
}: {
  filter: FilterOption;
  value: string | null;
  onChange: (val: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap ${
          value
            ? "bg-white/10 border-white/15 text-white"
            : "bg-white/[0.02] border-white/[0.06] text-white/35 hover:text-white/55 hover:border-white/12"
        }`}
      >
        <span className="text-xs">{filter.icon}</span>
        <span>{value || filter.label}</span>
        {value ? (
          <X
            className="w-2.5 h-2.5 ml-0.5 text-white/30 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          />
        ) : (
          <ChevronDown className="w-2.5 h-2.5 ml-0.5 text-white/20" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] bg-[#0a0e18] border border-white/[0.08] rounded-lg shadow-2xl py-1 backdrop-blur-xl">
          {filter.options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt === value ? null : opt); setOpen(false); }}
              className={`w-full text-left text-[10px] font-medium uppercase tracking-wider px-3.5 py-2 transition-colors ${
                opt === value
                  ? "text-white bg-white/8"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export { type FilterOption };
export default FilterDropdown;
