export default function RiskReversalCopy({
  variant,
  internalLabels = false,
}: {
  variant: "soft" | "refund";
  internalLabels?: boolean;
}) {
  const line =
    variant === "soft"
      ? "Not happy with your first campaign? Email us and we'll make it right."
      : "Don't love your first campaign? Reply to your receipt within 7 days for a full refund.";

  return (
    <div className="rounded-[18px] border border-border/70 bg-card p-4">
      {internalLabels && variant === "refund" ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Requires owner approval
        </p>
      ) : null}
      <p className="text-base text-foreground">{line}</p>
    </div>
  );
}
