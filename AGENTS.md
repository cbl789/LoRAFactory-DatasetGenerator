# Repository Guidelines

## Project Structure & Module Organization

This is a client-side, static web app (no backend).

- App entry points: `index.html` (dataset generator), `chat.html` (chat UI)
- Core modules:
  - `app.js` — main generator flow and UI wiring
  - `chat.js` — chat page behavior + API stream logging
  - `api_providers.js` — provider abstraction + implementations (FAL/Kie/Generic)
  - `schema_manager.js` — fetch/cache model schemas (dynamic parameters)
  - `ui_generator.js` — renders schema-driven parameter controls
  - `parameter_mapper.js` — maps UI values → provider request params
- Styling/assets: `style.css`, `screenshot.png`
- Docs/notes: `README.md`, `CHANGELOG.md`, `docs/` (security + prompt docs)

## Build, Test, and Development Commands

There is no build step; serve the repo over HTTP for best browser compatibility.

- `./start.sh` — starts `python3 -m http.server` on port `3100` and opens the browser
- `./stop.sh` — stops the server running on port `3100`
- `python3 -m http.server 3000` — manual server (then open `http://localhost:3000`)
- `npx serve .` — alternative static server if you have Node.js

## Coding Style & Naming Conventions

- JavaScript: ES modules (keep relative imports like `./api_providers.js`)
- Indentation: 4 spaces; match surrounding formatting
- Naming: `camelCase` (functions/vars), `PascalCase` (classes), `SCREAMING_SNAKE_CASE` (constants)
- Prefer browser APIs; avoid new dependencies unless necessary (existing pattern uses ESM CDN imports)

## Testing Guidelines

No automated test suite is currently tracked. Validate changes manually:

- Run locally and exercise both `index.html` and `chat.html`
- Generate a small dataset, download the ZIP, and verify filenames/captions
- Check DevTools console/network for errors; ensure no secrets are logged

## Commit & Pull Request Guidelines

Git history mixes plain subjects and Conventional Commit-style prefixes. Prefer:

- `feat:`, `fix:`, `docs:`, `chore:` + short imperative summary (e.g., `feat: Add Replicate provider`)
- PRs: include a brief description, steps to verify, and screenshots/GIFs for UI changes

## Security & Configuration Tips

- Never commit real API keys (or encrypted key blobs); use placeholders
- Provider work should keep key handling consistent with existing local/session storage options
