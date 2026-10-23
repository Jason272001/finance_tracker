# KeeperBMA

KeeperBMA is split into a small backend API plus separate frontend entry pages so the project stays easier to maintain.

## Project structure

- `backend/`
  - API routes and integration modules
  - `main.py` is the FastAPI entrypoint
  - `plan_features.py` contains plan gating logic
  - `plaid_service.py` and `plaid_store.py` contain bank-sync integration logic
  - `scripts/` contains one-off maintenance tasks such as CSV migration and backups
- `frontends/web/`
  - shared web HTML, JS, and CSS files
  - page-specific scripts stay here instead of growing one giant file
- root `*.html`
  - deployment entry pages used by Vercel routes (`/`, `/auth`, `/plans`, `/payment`, `/settings`, admin pages)
- `frontends/desktop/`
  - desktop launchers and packaging assets
- `assets/`
  - app branding assets such as icon and logo

## Local runtime data

CSV files under `data/` are **local runtime fallback/migration files**. They are not part of the deployed app when PostgreSQL is configured, but they are still referenced by:

- `backend/scripts/migrate_csv_to_postgres.py`
- `backend/scripts/backup_data.py`
- CSV fallback paths in `core.py`

Because of that, they should not be deleted until the project intentionally removes CSV fallback and backup support.

When restoring PostgreSQL from local CSVs, use the migration script carefully:

- Fresh/empty database: `python backend/scripts/migrate_csv_to_postgres.py`
- Replace existing PostgreSQL rows from a verified CSV backup: `python backend/scripts/migrate_csv_to_postgres.py --replace --source-dir <path>`

The `--replace` mode truncates destination tables before import, so it should only be used when the source CSV directory has been verified.
The script accepts either `DATABASE_URL` or the `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` variables.

## Local-only files

These are intentionally ignored from git:

- `data/*.csv`
- `backups/`
- generated desktop installers
- virtual environment files
- `__pycache__`

## Recommended workflow

1. Put product code in `backend/` or `frontends/web/`.
2. Keep root HTML files as thin route entry pages.
3. Keep local data and generated artifacts out of git.
4. If a file becomes deployment-only or local-only, document that here before removing it.

## Creator launch update

The website and Android clients now include a monthly creator income/expense report, category shortcuts and onboarding guidance. The website also has a public fictional-data demo and a free profit calculator. SQL persistence, authentication, bank sync and billing have additional safeguards.

- [Review and limitations](CODE_REVIEW.md)
- [Release checklist](RELEASE_CHECKLIST.md)
- [Reproducible tests](TESTING.md)
- [Organic acquisition plan](GROWTH_PLAN.md)
- [Video and caption drafts](CONTENT_PACK.md)

Use `requirements-api.txt` for the backend host and `requirements-test.txt` for verification. The original `requirements.txt` still includes optional legacy desktop/Streamlit dependencies. Node dependencies at the repository root provide browser tests and pinned sources for the demo chart/PDF assets. The website remains static.

Root `index.html` and `profit-calculator.html` are canonical entry pages. Demo workspace/Settings pages are generated from the actual app screens by `scripts/demo_pages.py`. Run `python scripts/sync_web_entries.py --write` after editing them. CI checks their alternate copies. `python scripts/build_static.py` generates a public-files-only `_site/` folder.

The checked-in Render free blueprint is for development. Confirm a non-expiring database, backups, provider configuration and Android release checks before taking payments. Existing production settings have not been inspected or changed.

## Full temporary demo

Open `/demo.html` to try accounts, transactions, transfers, categories, reports, CSV/PDF exports, charts, daily summaries, business profiles, employee permissions, and Settings. Profile edits, bank connections/sync/disconnection, billing and support are local simulations. All paid tools are unlocked; unfinished modules stay marked as planned. Nothing is saved to a database, cookie, localStorage or sessionStorage. Refresh/restart restores fictional data and independent tabs have separate sample workspaces.

The demo reuses `web.js` and `settings.js` with an explicit in-memory adapter and a connect-src none policy; unrecognized actions fail rather than contacting the real API. Settings shares the same sample state inside a srcdoc frame, preserving hosting frame protections. Run `python scripts/sync_web_entries.py --write` after changing a source screen. Charts and PDF use locally vendored, licensed libraries under `assets/vendor`.

## POS demo prototype

The Business demo now includes a memory-only sample POS: products/SKUs, cost/selling prices, descriptions, local raster photos, brands, categories, suppliers, CSV product import/template, supplier purchase carts/history, sales carts, example discount/tax, simulated cash/card checkout, receipt CSVs, sales history and void/restock. Receiving purchases updates stock and weighted-average cost; sales/voids retain historical line prices. This is a separate sample shop, not a live POS or personal-finance accounting integration. All data resets on refresh; no orders, payments, product files or images are uploaded to an external service.

## Business operations hub (2026-10-22)

The demo includes temporary staff cost planning, meetings, task ownership, category budgets, expense documentation, marketing campaign results and an accountant review CSV. The overview reads completed POS sales and historical sold inventory cost, excludes voids and separates collected example sales tax. Actual labor/campaign expenses must be entered once in the expense register. The analyst is explicitly rule-based, with no AI service connected. No payroll, tax filing, invitations, social publishing or external data writes occur.

## Time clock demo (2026-10-22)

Business demo adds staff clock-in/out, unpaid break start/end, manual entries, overlap checks, manager-style review/reopen, and CSV timesheets with gross-pay estimates. Only approved closed time is included; period boundaries clip elapsed work/break intervals. Rates are captured per entry; overtime threshold/multiplier are sample inputs applied per employee over the selected seven-day period. No payroll processing, withholding, daily overtime rules or payroll filing is implemented. Active staff cannot be deleted until clocked out. All entries reset on refresh.
