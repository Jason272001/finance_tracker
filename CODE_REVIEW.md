# Launch readiness review

Reviewed and improved on 2026-10-20, starting from origin/master at 5f25fcd4. Changes are on codex/creator-launch-readiness. This document describes the resulting implementation, not a claim that production has been upgraded.

## Main findings and changes

| Finding | Change | Remaining check |
|---|---|---|
| Whole-table SQL saves could lose concurrent updates and replace constraints | Row-level INSERT/UPDATE/DELETE with a database transaction around complete domain operations. PostgreSQL writers use a shared advisory lock; nested balance changes use the same connection. | Production backup and staging rollout. The legacy DataFrame model still reads whole tables and serializes writes, so this is a reliability bridge for a small service, not a large-scale storage design. |
| Transactions could reference another user's account or leave a row without its balance update | Ownership validation in the domain layer, rollback on failed postings, cent validation, atomic transfers, and protected transfer history | Real-account smoke test using disposable sample entries |
| Stripe retries and delayed events could overwrite access incorrectly | Durable processed-event ledger and canonical subscription reconciliation; events for an old subscription cannot revoke a newer subscription | Stripe Sandbox end-to-end test with the configured account/API version |
| Repeated checkout and plan-change requests could create multiple subscriptions | Durable checkout attempts, provider idempotency keys, reuse of open sessions, and existing subscriptions directed to Billing Portal | Portal product/price configuration and expired-session behavior in Sandbox |
| Cancellation could succeed externally while a failed refund became impossible to retry | Durable cancellation/refund intents, safe retries, provider refund reconciliation, and clear pending/manual-review states | Sandbox cancellation/refund tests and operator handling of manual-review cases |
| Bank sync used mismatched storage signatures and returned access tokens to the client | Aligned API/storage contracts; public connection fields are explicitly selected | Plaid Sandbox and production entitlement verification |
| Bank history could be double-posted against a current balance; pagination/changes were missed | Bank snapshots and imported history commit together; imports do not post balances again; pagination, modified/removed records, cursor races, and pending records are handled | Actual bank data validation. USD is enforced because the dashboard has no currency conversion. |
| Bank-linked balances could be mixed with manual entries | Bank-linked accounts are marked and excluded from manual entry/transfers; imported records follow bank sync | Real-device experience and any legacy balances requiring reconciliation |
| First administrator could be created publicly; missing Stripe configuration allowed direct plan changes | Operator-authorized bootstrap, private initial-owner CLI, direct plan changes off by default, unused anonymous precheckout off by default | Verify the existing production owner and environment configuration |
| Recovery codes and login lockouts lived only in worker memory | Expiring SQL security state shared across workers; failed recovery attempts commit before returning errors; administrator login is throttled too | Actual email delivery and operational monitoring |
| Locked Capacitor Android runtime had a critical published vulnerability | Capacitor Android/core/CLI pinned to patched 7.6.9; lockfiles updated | Rebuild and redistribute the actual Android app. A web deployment alone cannot patch an installed runtime. |
| API framework dependency audit reported vulnerable Starlette versions | FastAPI 0.143.5 and Starlette 1.9.0; API dependency audit now reports no known issues | CI/staging checks on the production Python runtime |
| Marketing promised unimplemented POS, inventory, website publishing and AI workflows | Landing page focuses on working creator tracking; unfinished business modules are labeled planned | Do not promote business tiers as complete; review actual Stripe offers before launch |
| Hosting entry pages differed, and static publishing omitted root pages | Canonical root entry pages, synchronization check, public-files-only build, static aliases and CI | Confirm the chosen production host and its deployment settings |
| Backups omitted business, bank and financial event tables | Consistent PostgreSQL export including financial ledgers, checksums and nonzero failure status | Encrypted off-host storage and a real restore drill |

## Product additions

- Monthly income, expenses, net income, income by source/category, onboarding checklist, creator category shortcuts and CSV export on the website.
- Matching monthly report, category shortcuts and report-text sharing in the separate native mobile app.
- Interactive fictional-data demo and a free local-only profit calculator.
- Clear workspace links, a mobile public Menu button, useful landing-page copy and an actual sample report preview.
- Bank disconnection from web and native Settings, including after subscription expiry. Existing history is retained.
- A native Android document-picker CSV export plugin, with an actionable fallback for older installed companions.
- Organic launch drafts in CONTENT_PACK.md and GROWTH_PLAN.md.

## Scope and limits

All API payment/provider behavior was tested with simulated responses; no real charge, refund, email, bank connection or customer data mutation was performed. PostgreSQL tests use a separate local test server and random schemas. SQL atomicity does not extend to the development CSV fallback. MySQL compatibility is implemented but untested.

The native mobile audit improved from 55 advisories (including two critical) to 38 (13 moderate, 25 high, no critical) after compatible dependency fixes. Remaining findings are in the Expo/React Native tooling dependency chain and require review; do not treat the entire dependency tree as clean. A forced framework migration was not applied. Expo's compatibility check and TypeScript checks pass.

See RELEASE_CHECKLIST.md for release gates and TESTING.md for reproducible verification. Production services were reachable by unauthenticated HTTP checks, but no authenticated hosting or Play Console session was available for configuration inspection.
