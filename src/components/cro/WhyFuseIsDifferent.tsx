const PROMPTING = [
  "You describe what you want",
  "Results can drift",
  "Logos and graphics can break",
  "You rebuild every scene manually",
];

const FUSE = [
  "You upload the real product",
  "You pick a proven campaign",
  "The system is built around repeatable outputs",
  "You get images and clips from one workflow",
];

export default function WhyFuseIsDifferent() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { title: "Prompting AI", items: PROMPTING, muted: true },
        { title: "FUSE", items: FUSE, muted: false },
      ].map((card) => (
        <div
          key={card.title}
          className={`rounded-[18px] border p-5 ${
            card.muted ? "border-border/70 bg-muted/30" : "border-primary/40 bg-card"
          }`}
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {card.title}
          </h3>
          <ul className="mt-3 space-y-2 text-base text-foreground">
            {card.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
