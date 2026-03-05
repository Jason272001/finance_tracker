# KeeperBMA Web Frontend

Static web client for the Render backend API.

## Files
- `index.html`
- `styles.css`
- `web.js`

## API Base URL
Default:
- `https://keeperbma-backend.onrender.com`

You can change it from the `Config` card in the UI.

## Host on GitHub Pages
1. Push repo to GitHub.
2. In GitHub repo:
   - `Settings` -> `Pages`
   - `Source`: `Deploy from a branch`
   - Branch: `master` (or `main`), folder: `/frontends/web`
3. Save.
4. Open generated Pages URL.

## Notes
- Backend must be live on Render.
- CORS is enabled in backend (`allow_origins=["*"]`), so browser requests are allowed.
