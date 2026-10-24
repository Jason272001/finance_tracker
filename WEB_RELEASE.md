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

## Weekly staff schedule, 2026-10-22

Adds weekly shift planning, multiple staff per shift, overnight/break planning, atomic overlap prevention, cancellation and CSV export. Sample Monday 9 AM–2 PM assigned to Jason and Kay. Planned hours never create actual timesheets/payroll entries. All changes reset. Verified 20 unit tests and 46 Chromium/WebKit checks; schedule checks rerun after checkbox layout adjustment.

## Store branches, 2026-10-22

Adds branch creation/editing, working-branch selector, separate staff/schedule/clock stores and branch-labeled schedule/time exports. Main Street and Riverside seed different teams. Three quick actions guide staff setup, scheduling and clock review. Shared POS/finance scope is clearly labeled. All data is temporary; no real tenancy or access control. Verified 22 unit tests and 48 Chromium/WebKit checks; branch checks rerun after draft-reset adjustment.

## Clear business navigation, 2026-10-22

Reorganizes the public demo into Overview, POS, Team, Finance, Marketing and Settings. Shows one category/task at a time, remembers task selection per category in memory, collapses directory shortcuts and groups profile/access/module forms under Settings. Team branch controls remain scoped to team tools. Responsive category grid and secondary navigation. Full 50 browser checks passed; final navigation/shortcut checks passed after direct-link scroll adjustment. No production backend changes.

## Business visual redesign, 2026-10-22

Introduces a cohesive green/neutral demo design system, desktop sidebar with SVG icons, compact mobile navigation, dynamic workspace headings, consistent controls/tables and a dashboard with live sample metrics, attention items and working checkout/schedule/budget quick actions. Existing models and demo isolation remain unchanged. Desktop and phone screenshots inspected. Full 50 browser checks passed; 4 navigation/quick-action checks passed after final typography/content refinements.

## Themes and product assistant, 2026-10-23

Restores visible Light/Dark controls with semantic neutral/blue surfaces throughout the demo. Adds maintained product guidance for features, task navigation, billing and published pricing. Adds a separate same-origin Vercel product-assistant function using OpenAI Responses only when key/model/enable settings exist; otherwise answers are explicitly guide-only. No real OpenAI key was configured; live-model execution remains pending operator setup. The demo CSP permits same-origin product-help requests but financial workflows remain in-memory. Verified 27 unit tests and 56 browser checks, plus a final four theme/assistant checks after surface refinements. Existing production account backend is unchanged.

## POS promotions and accounting, 2026-10-23

Adds percentage/fixed offers, date and minimum-spend checks, enable/disable controls, frozen receipt offer details, and a connected accounting overview with profit/loss, an activity ledger and CSV exports. Accounting separates tax collected and inventory purchases from operating expenses. All new workflows remain temporary sample data and reset on refresh. This is not a full bookkeeping or tax-filing system. Production account backend is unchanged.

## Cleaner demo navigation, 2026-10-24

Replaces expanding tool lists with keyboard-accessible Start here, Business tools and POS tabs. Adds concise workspace cards, visible task links and tighter workspace spacing. Keeps one directory panel visible at a time, both themes and existing demo functionality. No production account backend changes.
