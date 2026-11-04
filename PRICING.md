# BYOR plans (USD)

| Plan | Monthly | Yearly | AI messages/month | Nivoda inventory | Own diamonds shown |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | $0 | 20 | Sample only | 30% |
| Basic | $39 | $390 | 40 | 50% | 50% |
| Standard | $59 | $590 | 60 | 70% | 70% |
| Premium | $110 | $1,100 | 100 | 100% | 100% |

Annual billing charges the full yearly amount, equivalent to ten monthly payments (approximately 17% savings). Free has no Shopify charge or trial. Existing 14-day trial eligibility remains for paid plans.

All tiers list Ring, Earring & Pendant Builders, AI Diamond Score, Appearance/Language/Region Manager, 2MB own-diamond upload, and limited-time filters and engraving. Nivoda requires the merchant's account. Free retains the Keyideas logo and excludes suppliers, add-ons, and CSS. Basic logo removal and add-ons cost $330 each; Standard logo removal and add-ons cost $230 each. Premium includes logo removal; its add-ons cost $230 each. Advanced CSS is for paid yearly plans only.

Plan data and entitlement metadata do not implement these product capabilities. AI quotas, inventory percentages, add-on purchases, upload enforcement, and builder feature gates must be connected as those features are implemented. One-time add-on charges are not created by the subscription switch.

The Plan collection remains the billing source of truth. Defaults live in app/lib/plans.js. To deliberately update the deployed catalog after generating Prisma, run node --env-file=.env scripts/sync-byor-plans.mjs. This deactivates legacy Pro/Advanced offerings without altering existing subscription records or charging merchants.
