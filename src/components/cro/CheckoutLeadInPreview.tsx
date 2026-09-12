import RiskReversalCopy from "@/components/cro/RiskReversalCopy";

export default function CheckoutLeadInPreview({
  internalLabels = false,
}: {
  internalLabels?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-[18px] border border-border/70 bg-card p-5">
        <p className="text-lg font-semibold text-foreground">Starter</p>
        <ul className="mt-2 space-y-1 text-base text-muted-foreground">
          <li>$20 first month, then $25/mo</li>
          <li>Includes about 3 campaigns/month</li>
          <li>Secure checkout powered by Stripe</li>
        </ul>
      </div>
      <RiskReversalCopy variant="soft" />
      {internalLabels ? (
        <div className="rounded-[18px] border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Owner task</p>
          <p className="mt-1">
            Stripe public details must show FUSE before paid traffic.
          </p>
        </div>
      ) : null}
    </div>
  );
}
