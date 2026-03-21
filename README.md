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
