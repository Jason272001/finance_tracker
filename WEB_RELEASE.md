# Website publication — 2026-10-21

This release publishes the landing page, full temporary demo, free calculator, creator reports, navigation, and website presentation changes from 38d5f2ec.

Backend code, database behavior, Render configuration, API dependencies and the signed Android app remain at their previous production revision. Backend changes stay on codex/creator-launch-readiness pending a production backup and provider verification. Bank disconnection on an older server directs the user to support; the full demo simulates every supported action locally.

The production commit uses [skip render] to publish Vercel/static website changes without triggering the Render service. Existing server/database code was preserved.

Run npm ci, npm test, npm run test:e2e and python scripts/sync_web_entries.py to verify the website. The mobile report utility included here is used by the web/native parity test; no native application release is included.

Previous production Git revision: 5f25fcd4ed8a26d9db7b7e29e7b37d610a399bc8. Full implementation source: 38d5f2eca7e1dd552b828cebd7ec3465e01f3ffc.
