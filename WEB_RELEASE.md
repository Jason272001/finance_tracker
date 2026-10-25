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

## Customer relationships and sharing, 2026-10-24

Adds temporary customer profiles with contact preference and source, manual follow-up tasks, archive/restore, and completed POS sales linked by stable customer identity. Voids are excluded from customer totals. Adds a sharing kit with editable invitations and public demo links labeled by channel. No messages are sent, no signup leads are captured, and the demo does not measure clicks. New tools remain fictional and reset on refresh. The production account backend is unchanged.

## Register attribution and loyalty, 2026-10-24

Adds required demo register sign-in for sales, purchases and voids, with immutable operator snapshots and sign-out on branch change. Public sample PINs are explicitly simulations, not secure authentication. Adds optional phone-based fictional membership, configurable earning and whole-dollar point redemption, balances and purchase previews, frozen receipt rules, and safe void reversal. A starting sample member has 1,000 labeled opening points. Promotion conversation previews require opt-in and accept STOP to opt out; no SMS, verification, real account login or messaging provider is connected. Existing customer relationships, promotions and accounting totals remain linked. Refresh resets all new data. Production account backend is unchanged.

## Captioned demo videos, 2026-10-24

Adds a silent 74-second landscape walkthrough and 29-second vertical social clip, animated from fictional demo screenshots. Adds native HTML video players with on-screen captions, English VTT tracks, a readable transcript, posters, downloadable MP4s and explicit demo limitations. Adds Watch demo links on the home page and demo directory plus the new page in the sitemap. Videos do not autoplay and use preload=none. Nothing is posted to social networks. Production account backend is unchanged.

## Unified business homepage, 2026-10-24

Moves both existing videos directly into the main landing page with captions, downloads and a transcript. Adds six grouped business-demo explanations, three audience examples and a clearly labeled future-projects section. Personal finance and existing plan controls remain available, with explicit demo-versus-production availability. The previous watch-demo page redirects to the homepage video section, including the alternate static entry. Both themes and mobile layouts are supported. Public web.js changes are limited to four English landing-copy strings. Production account backend is unchanged.

## Narrated videos with music, 2026-10-25

Adds scene-aligned local English speech synthesis and an original synthesized instrumental score to both existing videos. AAC stereo narration-forward audio is normalized around -16 LUFS, with true peaks below 0 dBFS and music approximately 17 dB below active speech. Video durations remain 74 and 29 seconds. English caption tracks and the homepage transcript now match the spoken script. Homepage source/download links use a new media version, sound defaults on after user playback, and starting either player pauses the other. No autoplay or external speech/music service is introduced. Six browser checks passed, including Chromium AAC-to-PCM decoding, media playback and mutual-pause behavior; ffmpeg separately decoded and measured both audio streams. Production account backend is unchanged.

## Two neural narrator choices, 2026-10-25

Replaces the legacy desktop voice with warm male (Andrew) and conversational female (Emma) neural narrator variants for both videos. Homepage controls select either voice, restart the player, and update its download link. Walkthrough defaults to male; social defaults to female. Speech is generated during the local build from the existing public script; website visitors only load static MP4s. No digital speech time-stretching is applied. H.264 packet hashes match the prior visuals and approved instrumental WAV hashes are unchanged. Both variants retain the existing captions, durations, native playback controls and mutual pause behavior. Eight browser checks passed, including all four variants and Chromium AAC PCM decoding; ffmpeg separately decoded every soundtrack. These are synthetic narrators, not recordings of real people. Production account backend is unchanged.
