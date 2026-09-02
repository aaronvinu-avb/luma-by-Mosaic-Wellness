# Luma

Marketing analytics dashboard built with React, TypeScript, Vite, Tailwind, and Recharts.

## What this project includes

- Executive overview and KPI panels
- Channel performance, trend, funnel, and budget pacing views
- Scenario planner with modeled allocations
- CSV exports for key datasets

## Local setup

Prerequisites:

- Node.js 18+
- npm 9+

Install and run:

```bash
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Marketing data API

Luma loads daily marketing rows from JSON. By default it uses the bundled dataset:

- **Default:** `/data/marketing_daily.json` (served from `public/data/`)
- **Override:** copy `.env.example` to `.env` and set `VITE_MARKETING_API_URL` to a remote paginated API (`?page=1&limit=500`).

If the configured source is unreachable or returns HTML instead of JSON, the app falls back to **demo data** and shows a warning on the Overview page.

## Quality checks

```bash
npm run lint
npm run test
npm run build
```

## Tech stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS
- Recharts
- Vitest + Testing Library
