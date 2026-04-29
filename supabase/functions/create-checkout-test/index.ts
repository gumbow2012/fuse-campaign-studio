import { createCheckoutHandler } from "../_shared/stripe-billing.ts";

Deno.serve(createCheckoutHandler("test"));
