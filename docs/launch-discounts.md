# Launch Discounts

Fuse uses Stripe Promotion Codes. Checkout already exposes the promo-code field for memberships and one-time credit packs.

## Current Launch Codes

- `ACCESS19`: 100% off the first payment, limited to 5 total redemptions.
- `LAUNCH30`: 30% off the first payment.

Both use Stripe coupon `duration=once`, so a subscription discount applies to the first invoice only. Credit-pack discounts apply to that one checkout.

## Create Or Verify Codes

Dry run:

```sh
npm run stripe:launch-discounts
```

Create in live Stripe:

```sh
npm run stripe:launch-discounts -- --apply
```

Create in test Stripe:

```sh
npm run stripe:launch-discounts -- --test --apply
```

The script is idempotent. If a promotion code already exists in Stripe, it reports it and does not create a duplicate.

## Future Codes

For one-off future campaigns, create a Stripe coupon and promotion code in the Stripe Dashboard:

1. Stripe Dashboard -> Product catalog -> Coupons -> New coupon.
2. Set percent off, duration, redemption limit, and expiration.
3. Add a promotion code such as `DROP30`.
4. Customers enter the code inside Stripe Checkout.

No app deploy is required as long as `allow_promotion_codes` remains enabled in both checkout functions.
