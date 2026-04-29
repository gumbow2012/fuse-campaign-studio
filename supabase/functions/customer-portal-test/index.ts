import { createCustomerPortalHandler } from "../_shared/stripe-billing.ts";

Deno.serve(createCustomerPortalHandler("test"));
