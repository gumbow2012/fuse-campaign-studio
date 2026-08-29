/**
 * Frontend mirror of the authoritative credit top-up pricing.
 *
 * This re-exports the SAME module the server uses so display prices can never
 * drift from the server quote. The client is display-only: it sends ONLY the
 * requested credits integer to `create-credit-checkout` and never a price.
 */
export {
  CREDIT_PRICING_VERSION,
  CREDIT_TOPUP_MAX,
  CREDIT_TOPUP_MIN,
  CREDIT_TOPUP_STEP,
  creditTopUpPurchaseType,
  normalizeCreditAmount,
  quoteCreditTopUp,
  validateCreditTopUpAmount,
  type CreditTopUpQuote,
} from "../../supabase/functions/_shared/credit-pricing";
