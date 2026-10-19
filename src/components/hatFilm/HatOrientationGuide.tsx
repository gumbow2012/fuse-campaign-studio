/** Wearer-perspective guide for the Hat Brand Film side uploads. */
export default function HatOrientationGuide() {
  return (
    <div className="mb-3 flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-3">
      <svg viewBox="0 0 120 64" className="h-14 w-28 shrink-0 text-muted-foreground" aria-hidden>
        <path d="M20 44 Q60 0 100 44 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M30 44 Q60 58 90 44" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="4" y="30" fontSize="9" fill="currentColor">R</text>
        <text x="110" y="30" fontSize="9" fill="currentColor">L</text>
      </svg>
      <p className="text-[12px] leading-5 text-muted-foreground">
        Left and right are from the <span className="font-medium text-foreground">wearer's</span> view. Facing the hat,
        the wearer's right side is on <span className="font-medium text-foreground">your left</span>. Upload each side
        separately. Don't flip or mirror a photo.
      </p>
    </div>
  );
}
