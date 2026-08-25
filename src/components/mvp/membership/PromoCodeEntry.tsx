import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/**
 * Single promo-code entry point for the Membership Center.
 *
 * There is no promo/coupon handling in the existing checkout functions
 * (create-checkout / create-credit-checkout do not accept a code and do not set
 * allow_promotion_codes), so this entry is intentionally NOT wired: applying a
 * code here would fake a discount that does not exist.
 *
 * To make it real (billing change, out of scope): enable promotion codes on the
 * Stripe Checkout Session (allow_promotion_codes) or accept a `discounts` payload
 * in those edge functions, then pass the code through from here.
 */
export default function PromoCodeEntry() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      {open ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Promo code"
            className="h-10 flex-1 border-white/10 bg-white/5"
            aria-label="Promo code"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  disabled
                  className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto"
                >
                  Apply
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Promo codes apply at checkout.</TooltipContent>
          </Tooltip>
          <p className="text-xs text-slate-400 sm:max-w-[16rem]">Promo codes apply at checkout.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors duration-200 hover:text-white motion-reduce:transition-none"
        >
          Have a promo code?
          <Info className="h-3.5 w-3.5 text-slate-500" />
        </button>
      )}
    </div>
  );
}
