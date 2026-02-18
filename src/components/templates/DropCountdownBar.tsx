import { useState, useEffect } from "react";

const DropCountdownBar = () => {
  const [time, setTime] = useState({ days: 5, hours: 12, mins: 22, secs: 47 });

  useEffect(() => {
    const interval = setInterval(() => {
      setTime((prev) => {
        let { days, hours, mins, secs } = prev;
        secs--;
        if (secs < 0) { secs = 59; mins--; }
        if (mins < 0) { mins = 59; hours--; }
        if (hours < 0) { hours = 23; days--; }
        if (days < 0) { days = 0; hours = 0; mins = 0; secs = 0; }
        return { days, hours, mins, secs };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="mb-10 flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
          Next Drop In
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-mono">
        {[
          { val: pad(time.days), label: "D" },
          { val: pad(time.hours), label: "H" },
          { val: pad(time.mins), label: "M" },
          { val: pad(time.secs), label: "S" },
        ].map((unit, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/15 text-xs">:</span>}
            <span className="text-sm font-bold text-white/90 tabular-nums">{unit.val}</span>
            <span className="text-[9px] text-white/25 uppercase">{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DropCountdownBar;
