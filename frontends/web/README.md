# KeeperBMA Web Frontend

Static web client for the KeeperBMA backend API.

## Files
- `index.html`
- `auth.html`
- `plans.html`
- `settings.html`
- `styles.css`
- `web.js`
- `auth.js`
- `plans.js`
- `settings.js`

## API Base URL
Default:
- `https://api.keeperbma.com`

## Host on Vercel
1. Import this repo into Vercel.
2. Framework preset: `Other`.
3. Root directory: repo root.
4. Build command: leave empty.
5. Output directory: leave empty.
6. Deploy.

## Domain
- Add `keeperbma.com` as the production domain in Vercel.
- Point DNS to Vercel instead of GitHub Pages.
- `vercel.json` already handles:
  - security headers
  - redirects from old `/frontends/web/...` URLs
  - clean routes for `/`, `/auth`, `/plans`, and `/settings`

## Notes
- Backend must remain live separately.
- Fix Stripe `STRIPE_PRICE_*` env vars on the backend before testing billing.
