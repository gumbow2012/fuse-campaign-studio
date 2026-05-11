import { createCreditCheckoutHandler } from "../_shared/stripe-billing.ts";

Deno.serve(createCreditCheckoutHandler("test"));
