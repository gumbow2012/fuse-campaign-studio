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
    <div className="flex items-center gap-1.5 font-mono">
      {[
        { val: pad(time.days), label: "D" },
        { val: pad(time.hours), label: "H" },
        { val: pad(time.mins), label: "M" },
        { val: pad(time.secs), label: "S" },
      ].map((unit, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-white/15 text-[10px] mx-0.5">:</span>}
          <span className="text-xs font-bold text-white/70 tabular-nums">{unit.val}</span>
          <span className="text-[8px] text-white/25 uppercase">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};

export default DropCountdownBar;
