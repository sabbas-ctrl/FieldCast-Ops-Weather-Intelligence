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

The API is backed by Prisma/PostgreSQL. On startup, it seeds the demo login and demonstration sites only when the database has no users.

## Demo Login

```text
Email: demo@fieldcast.local
Password: FieldCast123!
```

Login is universal: the same sign-in form is used for personal users and organisation members. The backend resolves the active workspace membership at login, stores `userId`, `memberId`, `workspaceId`, and `role` in the short-lived JWT, and re-checks the member role/status from PostgreSQL on every authenticated request.

Personal workspaces use the platform-managed WeatherAI mode and do not require the user to enter a provider key. Organisation workspaces require an active WeatherAI provider connection before weather analysis endpoints run. If the key is missing, Owners and IT Admins are told to connect it in Provider Centre; other members are told to contact IT.

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

- `DATABASE_URL`: PostgreSQL connection string. For local pgAdmin with the `postgres` owner, use `postgresql://postgres:<your-password>@localhost:5432/fieldcast_ops?schema=public`.
- `REDIS_URL`: Redis or Upstash Redis URL.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: long random strings.
- `ENCRYPTION_KEY`: 32-byte base64 key for provider API key encryption.
- `WEATHERAI_BASE_URL`: real WeatherAI API base URL.
- `WEATHERAI_PLATFORM_API_KEY`: platform-managed key for individual demo workspaces.
- `NOMINATIM_USER_AGENT`: identifying User-Agent for the OpenStreetMap Nominatim location-search proxy.
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

## PostgreSQL Setup

Create the database manually in pgAdmin or Query Tool while connected to the default `postgres` database:

```sql
CREATE DATABASE fieldcast_ops OWNER postgres;
```

Then set `.env` to match your local `postgres` password:

```env
DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/fieldcast_ops?schema=public
```

Run the first migration:

```bash
npm.cmd run prisma:migrate --workspace apps/api -- --name init
```

The API seeds the demo login/sites automatically on startup if the database has no users. You can also seed manually:

```bash
npm.cmd run db:seed
```

## WeatherAI Integration Note

## Country, Timezone, And Location Data

- Countries come from the `i18n-iso-countries` package, not a handwritten list.
- Timezones come from the runtime `Intl.supportedValuesOf("timeZone")` IANA timezone data and are displayed with current UTC offset labels.
- Global location search is proxied through OpenStreetMap Nominatim at `/api/locations/search`.

The public Nominatim service is rate-limited and requires an identifying User-Agent and suitable attribution. For production-heavy usage, use a paid geocoding provider or self-host Nominatim.

The WeatherAI adapter is intentionally defensive. The brief says `/v1/usage` returns plan limits, but the exact response structure is not guaranteed. Capability resolution is based on returned limits and guarded entitlements, not a hardcoded `plan` field.

Before switching the forecast adapter from deterministic demo data to live provider data, capture real JSON from:

```text
GET /v1/weather?lat=33.6844&lon=73.0479&days=2&ai=false&units=metric
GET /v1/hourly?lat=33.6844&lon=73.0479&days=2&ai=false&units=metric
GET /v1/usage
```

Then map the exact hourly payload into `HourlyForecast` in `apps/api/src/modules/forecasts/forecasts.service.ts`.
