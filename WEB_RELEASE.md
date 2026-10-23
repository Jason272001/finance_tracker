# Website publication — 2026-10-21

This release publishes the landing page, full temporary demo, free calculator, creator reports, navigation, and website presentation changes from 38d5f2ec.

Backend code, database behavior, Render configuration, API dependencies and the signed Android app remain at their previous production revision. Backend changes stay on codex/creator-launch-readiness pending a production backup and provider verification. Bank disconnection on an older server directs the user to support; the full demo simulates every supported action locally.

The production commit uses [skip render] to publish Vercel/static website changes without triggering the Render service. Existing server/database code was preserved.

Run npm ci, npm test, npm run test:e2e and python scripts/sync_web_entries.py to verify the website. The mobile report utility included here is used by the web/native parity test; no native application release is included.

Previous production Git revision: 5f25fcd4ed8a26d9db7b7e29e7b37d610a399bc8. Full implementation source: 38d5f2eca7e1dd552b828cebd7ec3465e01f3ffc.

## Business POS demo, 2026-10-22

Adds in-memory catalog, brands, categories, suppliers, purchase receiving, checkout, receipts, voids and CSV/photo import. Refresh resets all sample data. No real payments, orders or accounting entries. Verified 12 unit tests, 36 full browser checks and 2 direct-link regression checks.

## Business operations demo, 2026-10-22

Adds in-memory staffing, meetings, tasks, budget/expense tracking, tax preparation checklist and review CSV, campaign planning/results and rule-based analysis. Linked to sample POS totals; no real AI, payroll, filing or social publishing. Browser workflows verified in Chromium and WebKit, including mobile layout and refresh reset.

## Time clock demo, 2026-10-22

Adds staff clock-in/out, unpaid breaks, manual timesheets, overlap prevention, review/reopen, period-clipped gross-pay estimates and CSV export. Rates are captured per shift. Configurable threshold/multiplier are sample assumptions; no withholding, payroll processing or filing. Refresh clears all data. Verified 17 unit tests and 42 Chromium/WebKit checks.
