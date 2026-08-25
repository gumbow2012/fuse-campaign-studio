import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS } from "@/lib/stripe-config";

type Props = {
  loading: string | null;
  isAdmin: boolean;
  onCheckout: (packKey: keyof typeof CREDIT_PACKS) => void;
};

export default function CreditPackCards({ loading, isAdmin, onCheckout }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(Object.keys(CREDIT_PACKS) as Array<keyof typeof CREDIT_PACKS>).map((packKey) => {
        const pack = CREDIT_PACKS[packKey];
        const isPopular = packKey === "growth";
        return (
          <article
            key={packKey}
            className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm ${
              isPopular
                ? "border-cyan-300/30 bg-white/[0.04] shadow-[0_0_40px_-12px_rgba(34,211,238,0.18)]"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            {isPopular ? (
              <span className="absolute right-4 top-4 rounded-full bg-cyan-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-950">
                Most popular
              </span>
            ) : null}

            <p className="font-display text-xl font-semibold text-white">{pack.name}</p>

            <div className="mt-5">
              <p className="font-display text-4xl font-black tracking-[-0.04em] text-white">
                ${pack.price}
                <span className="ml-1 text-sm font-medium text-slate-400">one-time</span>
              </p>
              <p className="mt-1 text-sm text-cyan-100/90">{pack.credits.toLocaleString()} credits</p>
            </div>

            <ul className="mt-5 space-y-3 text-sm text-slate-200">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                <span>{pack.credits.toLocaleString()} credits</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                <span>One-time top-up</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                <span>Credits post after payment clears</span>
              </li>
            </ul>

            <Button
              onClick={() => onCheckout(packKey)}
              disabled={isAdmin || !!loading}
              className={`mt-6 w-full rounded-full font-semibold ${
                isAdmin ? "bg-white/10 text-white hover:bg-white/10" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              }`}
            >
              {isAdmin ? "Admin access" : loading === packKey ? "Loading..." : "Buy credits"}
              {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
