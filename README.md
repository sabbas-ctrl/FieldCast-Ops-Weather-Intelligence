# FieldCast Ops — Weather Intelligence Platform

**Multi-tenant weather operations platform** that transforms raw forecast data into operational decisions — working windows, site risk assessment, automated incident generation, and provider quota intelligence.

🔗 **Live** → [fieldcast-ops-weather-intelligence-five.vercel.app](https://fieldcast-ops-weather-intelligence-five.vercel.app/)
📦 **Source** → [github.com/sabbas-ctrl/FieldCast-Ops-Weather-Intelligence](https://github.com/sabbas-ctrl/FieldCast-Ops-Weather-Intelligence)

---

## Why This Exists

Field operations — construction, agriculture, logistics, outdoor events — lose time and money when weather catches teams off guard. FieldCast Ops sits between a weather data provider ([WeatherAI](https://weather-ai.co/docs)) and operational teams, turning forecasts into **actionable site-level risk assessments** with configurable thresholds, automated incident workflows, and role-based access for teams of any size.

## Platform Overview

```
┌──────────────────────────────────────────────────────────┐
│                      React Frontend                      │
│   Dashboard · Forecasts · Sites · Rules · Incidents      │
│   Services · Provider Centre · Members · Audit Logs      │
└──────────────────────┬───────────────────────────────────┘
                       │ REST API
┌──────────────────────▼───────────────────────────────────┐
│                   Express API Server                     │
│   JWT Auth · RBAC Middleware · Zod Validation             │
│   Encrypted Key Storage · Rate-Aware Caching             │
├──────────────┬────────────────┬───────────────────────────┤
│  PostgreSQL  │     Redis      │      WeatherAI API       │
│  (Prisma)    │  (Cache/Fallback)│  (Forecast/Usage/AI)   │
└──────────────┴────────────────┴───────────────────────────┘
```

## Core Capabilities

### Multi-Tenant Architecture
Two workspace models serve different use cases:

| Mode | Provider Key | Use Case |
|------|-------------|----------|
| **Personal** | Platform-managed (Free tier) | Individual users, quick start, no API key needed |
| **Organisation** | Bring-your-own key (encrypted at rest) | Teams with their own WeatherAI plan, plan-gated features |

### Role-Based Access Control (RBAC)
Six roles with granular permission mapping across 25+ distinct permissions:

| Role | Scope | Key Permissions |
|------|-------|-----------------|
| `PERSONAL_OWNER` | Individual workspace | Full site/rule/incident control |
| `ORG_OWNER` | Organisation | Everything — members, provider, audit, session management |
| `IT_ADMIN` | Organisation | Provider keys, member management, audit visibility |
| `OPS_ADMIN` | Organisation | Sites, rules, incidents, monitoring configuration |
| `TEAM_MEMBER` | Organisation | View sites/rules, acknowledge incidents, run monitoring |
| `VIEWER` | Organisation | Read-only access to sites, rules, incidents, usage |

Permissions are enforced at the middleware layer — every route checks the JWT-embedded role against a permission matrix before the handler executes.

### Weather Intelligence
- **7-day forecast** with hourly breakdown per site
- **Working window analysis** — evaluates hourly conditions against configurable risk rules (rain, wind, temperature, frost thresholds)
- **Automated incident generation** — breached thresholds create severity-tagged incidents with deduplication
- **Incident lifecycle** — Open → Acknowledged → Resolved/Dismissed with full audit trail

### Provider Integration
- Organisation keys are AES-encrypted in PostgreSQL, never logged or exposed in API responses
- Usage sync resolves active plan tier (Free / Pro / Scale) and gates features accordingly
- Redis caching with TTL and in-memory fallback when Redis is unavailable
- Plan-aware service tools: IP Lookup, Weather Geo, Webhooks, SMS/USSD, Tree Analysis

### User Management
- Email/password auth with bcrypt hashing
- JWT access tokens (20m) + HTTP-only refresh cookies (14d) with server-side session tracking
- Token-based invitation system with optional Resend email delivery
- Member suspension and per-member weather API access toggles
- Complete audit log of workspace-level actions

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, Recharts, Lucide |
| **Backend** | Node.js, Express, TypeScript, Zod |
| **Database** | PostgreSQL 16, Prisma ORM |
| **Cache** | Redis 7 (graceful in-memory fallback) |
| **Infra** | Docker, GitHub Actions, Vercel (frontend), VPS (backend) |
| **External** | WeatherAI, Resend, OpenStreetMap Nominatim, Photon |

## Monorepo Structure

```
├── apps/
│   ├── api/          # Express backend — Prisma, auth, business logic
│   │   ├── src/
│   │   │   ├── middleware/     # JWT auth, RBAC permission guards
│   │   │   ├── modules/       # auth, sites, rules, forecasts, incidents,
│   │   │   │                   # usage, audit, provider, weatherai, workspaces,
│   │   │   │                   # invitations, locations
│   │   │   ├── infrastructure/ # cache, email, encryption, prisma client
│   │   │   └── utils/          # http errors, helpers
│   │   ├── prisma/             # schema + migrations
│   │   └── Dockerfile
│   └── web/          # React frontend — feature-based architecture
│       └── src/
│           ├── features/       # auth, dashboard, sites, rules, incidents,
│           │                   # provider
│           ├── components/     # shared UI components
│           ├── services/       # API client layer
│           └── layouts/        # app shell
├── vercel.json               # Frontend deployment config
├── docker-compose.yml        # Local dev stack (Postgres + Redis + API)
└── .github/workflows/
    └── deploy-api.yml        # Build + push API Docker image to Docker Hub
```

## Local Development

### Prerequisites
- Node.js ≥ 20.11
- PostgreSQL 16
- Redis 7 (optional — falls back to in-memory)

### Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your values

# Generate Prisma client
npm run prisma:generate --workspace apps/api

# Run migrations
npm run prisma:migrate --workspace apps/api -- --name init

# Start both apps
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:5173` |
| API | `http://localhost:4000` |
| API Docs | `http://localhost:4000/docs` |
| Health | `http://localhost:4000/health` |

> **Windows PowerShell note**: If `npm.ps1` is blocked by execution policy, use `npm.cmd` instead.

### Docker Compose (full local stack)

```bash
docker compose up -d    # Starts Postgres, Redis, and API
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

```env
# Core
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fieldcast_ops?schema=public
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>
ENCRYPTION_KEY=<32-byte-base64-key>

# WeatherAI
WEATHERAI_BASE_URL=https://api.weather-ai.co
WEATHERAI_PLATFORM_API_KEY=wai_your_key

# Geocoding
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
PHOTON_BASE_URL=https://photon.komoot.io

# Email (optional)
RESEND_API_KEY=re_your_key
RESEND_FROM=FieldCast Ops <noreply@your-domain.com>

# Frontend
VITE_API_URL=http://localhost:4000
```

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Deployment

### Frontend → Vercel
Configured via `vercel.json`. Builds only `apps/web`:

```
Framework: Vite
Install: npm ci
Build:   npm run build:web
Output:  apps/web/dist
```

Set `VITE_API_URL` in Vercel environment variables to point to your backend.

### Backend → Docker / VPS

```bash
# Build image
docker build -f apps/api/Dockerfile -t fieldcast-api .

# Run with env file
docker run -d --env-file .env.production -p 4000:4000 fieldcast-api

# Run migrations against production DB
docker run --rm --env-file .env.production fieldcast-api \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

GitHub Actions (`deploy-api.yml`) automatically builds and pushes the image to Docker Hub on pushes to `main` that touch `apps/api/`.

## API Surface

<details>
<summary><strong>Authentication</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/individual` | Create personal workspace |
| POST | `/api/auth/register/organisation` | Create organisation workspace |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/auth/me` | Current user context |

</details>

<details>
<summary><strong>Workspaces & Members</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces/current` | Active workspace |
| GET | `/api/workspaces/:id/members` | List members |
| POST | `/api/workspaces/:id/invitations` | Create invitation |
| POST | `/api/invitations/:token/accept` | Accept invite |
| PATCH | `/api/workspaces/:id/members/:mid/usage-access` | Toggle API access |

</details>

<details>
<summary><strong>Provider & WeatherAI Services</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/provider/status` | Connection status & plan |
| POST | `/api/provider/connect` | Connect WeatherAI key |
| POST | `/api/provider/usage/sync` | Sync quota from provider |
| GET | `/api/weatherai/capabilities` | Plan-gated feature list |
| GET | `/api/weatherai/forecast` | Forecast data |
| GET | `/api/weatherai/weather` | Current weather |
| GET | `/api/weatherai/weather-geo` | Geo-aware weather |
| GET | `/api/weatherai/ip-lookup` | IP geolocation (Pro+) |
| POST | `/api/weatherai/webhooks` | Create webhook (Pro+) |
| POST | `/api/weatherai/sms/send` | Send SMS (Scale) |
| POST | `/api/weatherai/trees/analyze` | Tree analysis |

</details>

<details>
<summary><strong>Sites, Rules & Incidents</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/sites` | List / create sites |
| GET | `/api/sites/:id/forecast` | Site forecast |
| POST | `/api/sites/:id/analyse-working-windows` | Run risk analysis |
| GET/POST | `/api/sites/:id/rules` | List / create rules |
| PATCH | `/api/rules/:id` | Update rule thresholds |
| GET | `/api/incidents` | List incidents |
| PATCH | `/api/incidents/:id/acknowledge` | Acknowledge incident |
| PATCH | `/api/incidents/:id/resolve` | Resolve incident |

</details>

<details>
<summary><strong>Analytics & Audit</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/usage/summary` | Usage analytics |
| GET | `/api/audit-logs` | Workspace audit trail |
| GET | `/api/locations/search` | Geocoding search |

</details>

## Demo Credentials

The API auto-seeds when the database is empty:

```
Email:    demo@fieldcast.local
Password: FieldCast123!
```

## License

Private — All rights reserved.
