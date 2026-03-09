# keeperbma Backend

Single backend for all frontends (web, desktop, android, ios).

## Stack
- PostgreSQL (port `5432`)
- Python scripts for migration and backup
- FastAPI service (`backend/main.py`)

## Setup
1. Configure environment variables (see `.env.example`).
2. Run CSV -> PostgreSQL migration:
   - `python backend/scripts/migrate_csv_to_postgres.py`
3. Run backup:
   - `python backend/scripts/backup_data.py`
4. Run API locally:
   - `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

## Render Deploy (Blueprint)
1. Push repo to GitHub.
2. In Render, choose `New +` -> `Blueprint`.
3. Select the repo. Render will read [`render.yaml`](../render.yaml).
4. Deploy service `keeperbma-backend` and database `keeperbma-db`.
5. Use your API base URL from Render for all platforms.

## API
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/session`
- `GET /accounts?user_id=...`
- `POST /accounts`
- `GET /transactions?user_id=...`
- `POST /transactions`
- `GET /categories?user_id=...`
- `POST /categories`
- `GET /billing/plans`
- `GET /billing/config?user_id=...`
- `POST /billing/checkout`
- `POST /billing/checkout/embedded`
- `POST /billing/portal`
- `POST /billing/cancel`
- `POST /billing/webhook`

## Stripe billing env vars
Set these in Render to enable Stripe subscription checkout:
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` (required for Embedded Components checkout)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_REGULAR`
- `STRIPE_PRICE_BUSINESS`
- `STRIPE_PRICE_PREMIUM_PLUS`
- `STRIPE_PRICE_PREMIUM_PLUS_WEBSITE` (optional $70 tier)
- `STRIPE_PRICE_BASIC_ANNUAL`
- `STRIPE_PRICE_REGULAR_ANNUAL`
- `STRIPE_PRICE_BUSINESS_ANNUAL`
- `STRIPE_PRICE_PREMIUM_PLUS_ANNUAL`
- `STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL` (optional $700 tier)
- `BILLING_SUCCESS_URL` (optional)
- `BILLING_CANCEL_URL` (optional)
- `BILLING_RETURN_URL` (optional)
- `REFUND_FULL_WINDOW_DAYS` (default `7`)

## Notes
- This backend is shared by all client frontends.
- Migration script creates database and tables, then imports current CSV data.
