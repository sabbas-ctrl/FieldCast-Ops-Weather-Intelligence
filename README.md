# FieldCast Ops Weather Intelligence

FieldCast Ops is a multi-tenant weather operations platform. It treats WeatherAI as an operational data provider rather than a simple weather display API: workspaces own sites, rules, incidents, provider usage, members, and audit records.

## What Is Built

- React + TypeScript + Vite frontend with a light operations dashboard.
- Node.js + Express + TypeScript API.
- PostgreSQL-ready Prisma schema for the full tenant model.
- Workspace onboarding for individual and organisation accounts.
- WeatherAI provider connection with encrypted key storage boundary, masked display, usage sync, and capability resolution.
- Site management, editable hazard rules, working-window analysis, persistent incidents, deduplication, usage analytics, member weather-access control, invitations, and audit logs.
- Redis-compatible cache abstraction with an in-memory fallback for local/demo runs.
- Docker Compose for API, PostgreSQL, and Redis.

The current API uses a seeded in-memory store so the product can run immediately without waiting for real WeatherAI sample payloads. The Prisma schema in `apps/api/prisma/schema.prisma` is the production database target.

## Demo Login

```text
Email: demo@fieldcast.local
Password: FieldCast123!
```

Demo WeatherAI keys:

```text
wai_demo_free_34bf
wai_demo_pro_34bf
wai_demo_scale_sms_34bf
```

## Local Development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`
API: `http://localhost:4000`
API docs: `http://localhost:4000/docs`

PowerShell on Windows may block `npm.ps1`; use `npm.cmd install` and `npm.cmd run dev` if needed.

## Environment

Copy `.env.example` to `.env` and replace secrets before deployment.

Important variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis or Upstash Redis URL.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: long random strings.
- `ENCRYPTION_KEY`: 32-byte base64 key for provider API key encryption.
- `WEATHERAI_BASE_URL`: real WeatherAI API base URL.
- `WEATHERAI_PLATFORM_API_KEY`: platform-managed key for individual demo workspaces.
- `CORS_ORIGIN`: deployed frontend origin.

Generate a suitable encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## API Surface

Core routes include:

- `POST /api/auth/register/individual`
- `POST /api/auth/register/organisation`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/provider/connect`
- `GET /api/provider/status`
- `POST /api/provider/usage/sync`
- `GET /api/sites`
- `POST /api/sites/:siteId/analyse-working-windows`
- `GET /api/sites/:siteId/rules`
- `PATCH /api/rules/:ruleId`
- `GET /api/incidents`
- `PATCH /api/incidents/:incidentId/acknowledge`
- `PATCH /api/incidents/:incidentId/resolve`
- `GET /api/usage/summary`
- `GET /api/audit-logs`

## Deployment Shape

Recommended production shape:

```text
Vercel frontend
  -> HTTPS API subdomain
  -> VPS reverse proxy
  -> Dockerized Node API
  -> Neon PostgreSQL
  -> Upstash Redis
  -> WeatherAI API
```

Frontend:

- Deploy `apps/web` on Vercel.
- Set `VITE_API_URL=https://your-api-subdomain.example.com`.

Backend:

- Build with `docker compose build api`.
- Run with `docker compose up -d api`.
- Set `CORS_ORIGIN` to the Vercel URL.

## WeatherAI Integration Note

The WeatherAI adapter is intentionally defensive. The brief says `/v1/usage` returns plan limits, but the exact response structure is not guaranteed. Capability resolution is based on returned limits and guarded entitlements, not a hardcoded `plan` field.

Before switching the forecast adapter from deterministic demo data to live provider data, capture real JSON from:

```text
GET /v1/weather?lat=33.6844&lon=73.0479&days=2&ai=false&units=metric
GET /v1/hourly?lat=33.6844&lon=73.0479&days=2&ai=false&units=metric
GET /v1/usage
```

Then map the exact hourly payload into `HourlyForecast` in `apps/api/src/modules/forecasts/forecasts.service.ts`.
