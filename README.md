# FieldCast Ops Weather Intelligence

WeatherAI developer-platform assignment submission by Sabbas Ahmad.

FieldCast Ops is a multi-tenant weather operations platform that consumes WeatherAI APIs and turns raw forecast/provider data into operational decisions: 7-day forecast cards, hourly site weather, risk rules, working windows, incidents, provider quota, and plan-gated WeatherAI services.

## Submission Links

- Public GitHub repository: `TODO: paste public repository URL`
- Live deployment: `TODO: paste deployed app URL`
- WeatherAI documentation used: https://weather-ai.co/docs

## Assignment Scope

The assignment asked for a simple application integrating APIs from the WeatherAI developer platform. This implementation goes beyond a basic weather display and demonstrates a production-oriented integration pattern:

- Personal users get platform-managed Free-plan WeatherAI access with no API key prompt.
- Organisation users connect their own WeatherAI key, and the app gates functionality according to that key's active plan.
- The backend owns WeatherAI credentials, validation, rate-aware caching, plan checks, and error handling.
- The frontend presents WeatherAI data as useful operational UI instead of raw JSON.

The app supports two workspace modes:

- Personal workspaces use the platform-managed WeatherAI key from `WEATHERAI_PLATFORM_API_KEY` and expose Free-plan functionality to the user.
- Organisation workspaces use the organisation's own WeatherAI key, stored encrypted in PostgreSQL, and enable services according to the active WeatherAI plan.

## WeatherAI APIs Integrated

The app uses WeatherAI's documented base URL `https://api.weather-ai.co` and Bearer API key authentication.

Primary reviewer flow:

- `GET /v1/forecast`: powers the Forecast page, rendered as 7-day cards plus today's hourly cards.
- `GET /v1/usage`: resolves request/AI quota and active plan capabilities.

Plan-aware service tools:

- `GET /v1/weather`: current weather plus forecast utility.
- `GET /v1/weather-geo`: IP or coordinate-aware weather/geo lookup.
- `GET /v1/ip-lookup`: Pro+ IP geolocation utility.
- `POST /v1/webhooks`, `GET /v1/webhooks`, `DELETE /v1/webhooks/:id`: Pro+ webhook subscription management.
- `POST /v1/sms/send`, `POST /v1/sms/alert`, `POST /v1/sms/bomet/register`, `GET /v1/sms/stats`, `GET /v1/sms/health`: Scale + SMS-approved messaging tools.
- `POST /v1/trees/analyze`, `GET /v1/trees/history`, `GET /v1/trees/quota`, `POST /v1/forestry/count-trees`: tree/forestry analysis tools.

WeatherAI plan gates follow the docs:

- Free: 1,000 requests/month, 200 AI requests/month, 7 forecast days, 5 tree analyses/month.
- Pro: 50,000 requests/month, 10,000 AI requests/month, 14 forecast days, up to 10 webhooks, 100 tree analyses/month.
- Scale: 500,000 requests/month, 100,000 AI requests/month, 16 forecast days, up to 50 webhooks, SMS/USSD after approval, unlimited tree analyses.

## Reviewer Walkthrough

1. Register an individual account.
2. Search and select a real location during onboarding.
3. Open `Forecast` and load the next 7 days for the site.
4. Open `Sites`, add another searched global location, then run analysis.
5. Open `Rules`, adjust rain/wind/heat thresholds, then run analysis again.
6. Open `Incidents` to see generated high-risk weather incidents.
7. Register an organisation account and connect a WeatherAI key in Provider Centre.
8. Open `Services` to see WeatherAI utilities enabled or disabled according to the active plan.

## Current Features

- Universal sign-in for personal users and organisation members.
- Individual and organisation registration flows.
- PostgreSQL-backed users, workspaces, members, sessions, provider connections, sites, rules, incidents, invitations, usage events, and audit logs.
- JWT access tokens with `userId`, `memberId`, `workspaceId`, and `role`; refresh tokens are stored in HTTP-only cookies and checked against server-side sessions.
- Organisation provider connection with encrypted WeatherAI keys, masked display, usage sync, and plan capability resolution.
- Personal workspaces do not show Provider Centre because users do not manage a WeatherAI key.
- Forecast page with 7-day cards and today's hourly forecast cards.
- Services page for WeatherAI utilities such as IP lookup, Weather Geo, webhooks, SMS/USSD, and trees/forestry tools.
- Site management with global location search.
- Editable hazard rules, working-window analysis, incident generation, incident acknowledgement/resolution, usage analytics, member access toggles, invitations, and audit logs.
- Resend-backed invitation email delivery.
- Redis cache with in-memory fallback when Redis is unavailable.
- Dockerized API and GitHub Actions build/push workflow for Docker Hub.

## Tech Stack

- API: Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis/ioredis, Zod.
- Web: React, Vite, TypeScript, Tailwind CSS, Recharts, lucide-react.
- External services: WeatherAI, Resend, OpenStreetMap Nominatim, Photon.

## Local Development

Install dependencies:

```bash
npm install
```

Start both apps:

```bash
npm run dev
```

Windows PowerShell may block `npm.ps1`; use:

```powershell
npm.cmd run dev
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- API docs: `http://localhost:4000/docs`
- Health: `http://localhost:4000/health`

## Environment

Copy `.env.example` to `.env` and set real values.

Important API variables:

```env
NODE_ENV=development
PORT=4000
WEB_APP_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

JWT_ACCESS_SECRET=replace-with-a-long-random-access-secret
JWT_REFRESH_SECRET=replace-with-a-long-random-refresh-secret
ENCRYPTION_KEY=replace-with-32-byte-base64-key

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fieldcast_ops?schema=public
REDIS_URL=redis://localhost:6379

WEATHERAI_BASE_URL=https://api.weather-ai.co
WEATHERAI_PLATFORM_API_KEY=wai_your_platform_key

NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=FieldCastOpsWeatherIntelligence/0.1 (development; contact: you@example.com)
PHOTON_BASE_URL=https://photon.komoot.io

RESEND_API_URL=https://api.resend.com
RESEND_API_KEY=re_your_resend_key
RESEND_FROM=FieldCast Ops <noreply@your-domain.com>
RESEND_REPLY_TO=support@your-domain.com
```

Important web variable:

```env
VITE_API_URL=http://localhost:4000
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## PostgreSQL Setup

Create the database manually in pgAdmin while connected to the default `postgres` database:

```sql
CREATE DATABASE fieldcast_ops OWNER postgres;
```

Then run migrations:

```powershell
npm.cmd run prisma:migrate --workspace apps/api -- --name init
```

Generate Prisma Client:

```powershell
npm.cmd run prisma:generate --workspace apps/api
```

The API seeds demo data only when the user table is empty:

```text
Email: demo@fieldcast.local
Password: FieldCast123!
```

## Resend Email

Invitation email is sent server-side through Resend when an organisation owner or IT admin creates an invitation. The API uses Resend's `POST /emails` endpoint documented at https://resend.com/docs/api-reference/emails.

Required variables:

- `RESEND_API_KEY`
- `RESEND_FROM`
- optional `RESEND_REPLY_TO`

`RESEND_FROM` must use a domain verified in Resend for production delivery. If Resend rejects a send request, the API returns a clear error such as `Resend email failed: ...` instead of a generic internal server error.

The invitation response includes:

```json
{
  "inviteLink": "https://app.example.com/invite/...",
  "emailDelivery": {
    "id": "resend-message-id",
    "skipped": false
  }
}
```

If Resend is not configured, the invite link is still returned and `emailDelivery.skipped` is `true`.

## WeatherAI

Personal workspaces:

- Use `WEATHERAI_PLATFORM_API_KEY`.
- Expose Free-plan functionality.
- Do not show Provider Centre.

Organisation workspaces:

- Require an organisation WeatherAI key in Provider Centre before analysis.
- Store the key encrypted with `ENCRYPTION_KEY`.
- Sync `/v1/usage` to resolve Free, Pro, and Scale capabilities.
- Show plan-gated services in the Services view.

Main app features:

- Forecast page calls the backend forecast endpoint and renders the next 7 days plus today's hourly forecast.
- Working-window analysis evaluates forecasts against site rules and can generate incidents.
- Services page exposes plan-aware WeatherAI utilities: IP lookup, Weather Geo, webhooks, SMS/USSD, and trees/forestry.

## Country, Timezone, And Location Data

- Countries come from `i18n-iso-countries`.
- Timezones come from `Intl.supportedValuesOf("timeZone")` and are displayed with UTC offsets.
- Location search uses `/api/locations/search`, backed first by OpenStreetMap Nominatim and then Photon fallback.

For production-heavy geocoding, use a paid provider or a self-hosted geocoder. Public Nominatim has usage limits and requires a useful `User-Agent`.

## Input Validation

API inputs are validated with Zod at route boundaries.

- Invalid JSON/query/body input returns HTTP `400` with field details.
- Auth emails are trimmed and normalized to lowercase.
- Coordinates are bounded to valid latitude/longitude ranges.
- Forecast days are bounded by route and WeatherAI plan limits.
- Command-style JSON bodies reject unknown fields with strict schemas.
- Route handlers use `HttpError` for expected failures so clients do not see generic internal server errors.

## API Routes

Auth:

- `POST /api/auth/register/individual`
- `POST /api/auth/register/organisation`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Workspaces and members:

- `GET /api/workspaces/current`
- `GET /api/workspaces/:workspaceId/members`
- `POST /api/workspaces/:workspaceId/invitations`
- `POST /api/invitations/:token/accept`
- `PATCH /api/workspaces/:workspaceId/members/:memberId/usage-access`

Provider and WeatherAI:

- `GET /api/provider/status`
- `POST /api/provider/connect`
- `POST /api/provider/usage/sync`
- `GET /api/weatherai/capabilities`
- `GET /api/weatherai/forecast`
- `GET /api/weatherai/weather`
- `GET /api/weatherai/weather-geo`
- `GET /api/weatherai/ip-lookup`
- `GET /api/weatherai/webhooks`
- `POST /api/weatherai/webhooks`
- `DELETE /api/weatherai/webhooks/:webhookId`
- `POST /api/weatherai/sms/send`
- `POST /api/weatherai/sms/alert`
- `GET /api/weatherai/sms/stats`
- `GET /api/weatherai/sms/health`
- `GET /api/weatherai/trees/history`
- `GET /api/weatherai/trees/quota`
- `POST /api/weatherai/trees/analyze`

Sites, rules, incidents, and usage:

- `GET /api/sites`
- `POST /api/sites`
- `GET /api/sites/:siteId/forecast`
- `GET /api/sites/:siteId/current`
- `POST /api/sites/:siteId/analyse-working-windows`
- `GET /api/sites/:siteId/rules`
- `POST /api/sites/:siteId/rules`
- `PATCH /api/rules/:ruleId`
- `GET /api/incidents`
- `PATCH /api/incidents/:incidentId/acknowledge`
- `PATCH /api/incidents/:incidentId/resolve`
- `GET /api/usage/summary`
- `GET /api/audit-logs`
- `GET /api/locations/search`

## Docker

Build the API image locally:

```bash
docker build -f apps/api/Dockerfile -t fieldcast-api:local .
```

Run with a production env file:

```bash
docker run --rm \
  --env-file .env.production \
  -p 4000:4000 \
  fieldcast-api:local
```

Run migrations from the image:

```bash
docker run --rm \
  --env-file .env.production \
  fieldcast-api:local \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

The Docker image does not include production environment values. Provide them on the VPS with `--env-file`, Docker Compose `env_file`, or your orchestrator.

## Docker Hub Workflow

The GitHub Actions workflow `.github/workflows/deploy-api.yml` validates the API and pushes the backend Docker image to Docker Hub. It is separate from Vercel; Vercel deploys only the frontend from `apps/web`.

The Docker image publish job uses the GitHub Environment named:

```text
production
```

Add Docker Hub credentials/config in GitHub:

- `DOCKERHUB_USERNAME`: GitHub repository/environment variable, or secret. Use your Docker Hub username, not your email address.
- `DOCKERHUB_TOKEN`: GitHub repository/environment secret. Use the raw Docker Hub access token only.

Optional non-secret GitHub repository variables:

- `DOCKERHUB_REPOSITORY` defaults to `visionindex-frontend`
- `IMAGE_TAG_PREFIX` defaults to `fieldcastops-backend`

It builds from:

```text
apps/api/Dockerfile
```

It pushes to the Docker Hub repository:

```text
<DOCKERHUB_USERNAME>/visionindex-frontend:backend-latest
<DOCKERHUB_USERNAME>/visionindex-frontend:backend-<git-sha>
```

The Docker Hub repository can be private. Create it manually in Docker Hub as `visionindex-frontend`, set it to private, then add a Docker Hub access token with read/write permission. Do not prefix it with `Bearer`, do not paste JSON, and do not commit Docker Hub credentials or production `.env` values to the repository.

The workflow does not deploy or copy `.env` to the VPS. Production env stays on the VPS.

## Vercel Frontend Deployment

The frontend is configured for Vercel with the root-level `vercel.json`.

Recommended Vercel import settings:

- Framework Preset: `Vite`
- Root Directory: repository root, not `apps/web`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `apps/web/dist`

Set this Vercel environment variable for Production and Preview:

```env
VITE_API_URL=https://your-api-domain.example.com
```

If the API is not deployed yet, the Vercel frontend can still build, but login and WeatherAI calls will fail until `VITE_API_URL` points to a reachable backend.

After deployment, copy the Vercel production URL into the `Submission Links` section near the top of this README.

## VPS Runtime Example

On the VPS:

```bash
docker login
docker pull <dockerhub-username>/visionindex-frontend:backend-latest
docker run -d \
  --name fieldcast-api \
  --restart unless-stopped \
  --env-file /opt/fieldcast/.env.production \
  -p 4000:4000 \
  <dockerhub-username>/visionindex-frontend:backend-latest
```

Example `/opt/fieldcast/.env.production`:

```env
NODE_ENV=production
PORT=4000
WEB_APP_URL=https://your-frontend-domain.com
CORS_ORIGIN=https://your-frontend-domain.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ENCRYPTION_KEY=...
WEATHERAI_BASE_URL=https://api.weather-ai.co
WEATHERAI_PLATFORM_API_KEY=...
RESEND_API_URL=https://api.resend.com
RESEND_API_KEY=...
RESEND_FROM=FieldCast Ops <noreply@your-domain.com>
```

Place Nginx, Caddy, or another reverse proxy in front of port `4000` for HTTPS.

## Useful Commands

```bash
npm run typecheck
npm run build
npm run build:all
npm run prisma:generate --workspace apps/api
npm run prisma:migrate --workspace apps/api -- --name init
npm run db:seed
```

PowerShell equivalents:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run build:all
npm.cmd run prisma:generate --workspace apps/api
npm.cmd run prisma:migrate --workspace apps/api -- --name init
npm.cmd run db:seed
```

## Troubleshooting

Resend returns an error:

- Confirm `RESEND_API_KEY` is set.
- Confirm `RESEND_FROM` uses a verified domain.
- Confirm the sender has permission in Resend.
- In development, check the API response `details` field for the Resend provider payload.

Personal forecast says WeatherAI is not configured:

- Set `WEATHERAI_BASE_URL=https://api.weather-ai.co`.
- Set a real `WEATHERAI_PLATFORM_API_KEY`.

Organisation analysis is locked:

- Sign in as Organisation Owner or IT Admin.
- Connect a valid WeatherAI key in Provider Centre.
- Sync usage after connecting.

Location search returns no results:

- Check `NOMINATIM_USER_AGENT`.
- Try a corrected spelling or a country filter.
- Photon fallback is enabled automatically when Nominatim rejects or returns no useful result.
