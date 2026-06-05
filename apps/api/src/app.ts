import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env, isProduction } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { providerRouter } from "./modules/provider/provider.routes.js";
import { siteRouter } from "./modules/sites/sites.routes.js";
import { ruleRouter } from "./modules/rules/rules.routes.js";
import { forecastRouter } from "./modules/forecasts/forecasts.routes.js";
import { incidentRouter } from "./modules/incidents/incidents.routes.js";
import { usageRouter } from "./modules/usage/usage.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { workspaceRouter } from "./modules/workspaces/workspaces.routes.js";
import { invitationRouter } from "./modules/invitations/invitations.routes.js";
import { locationsRouter } from "./modules/locations/locations.routes.js";
import { weatherAiRouter } from "./modules/weatherai/weatherai.routes.js";
import { errorHandler, notFoundHandler } from "./utils/http.js";

const openApiDocument = {
  openapi: "3.0.0",
  info: {
    title: "FieldCast Ops API",
    version: "0.1.0",
    description: "Multi-tenant WeatherAI operations API for workspaces, provider usage, sites, rules, incidents, and working windows."
  },
  paths: {
    "/api/auth/register/individual": { post: { summary: "Register an individual workspace" } },
    "/api/auth/register/organisation": { post: { summary: "Register an organisation workspace" } },
    "/api/provider/connect": { post: { summary: "Verify and connect a WeatherAI key" } },
    "/api/weatherai/capabilities": { get: { summary: "List active WeatherAI plan services for the workspace" } },
    "/api/sites/{siteId}/analyse-working-windows": { post: { summary: "Evaluate hourly forecasts against risk rules" } }
  }
};

export function createApp() {
  const app = express();

  app.use(helmet());
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // Allow dynamic Vercel preview/deployment URLs for this project
        if (/^https:\/\/fieldcast-ops-weather-intelligence-.*\.vercel\.app$/.test(origin)) {
          return callback(null, true);
        }
        // Allow localhost origins in development
        if (!isProduction && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "fieldcast-ops-api",
      environment: env.NODE_ENV
    });
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use("/api/auth", authRouter);
  app.use("/api/locations", locationsRouter);
  app.use("/api/workspaces", workspaceRouter);
  app.use("/api", invitationRouter);
  app.use("/api/provider", providerRouter);
  app.use("/api/weatherai", weatherAiRouter);
  app.use("/api/sites", siteRouter);
  app.use("/api", ruleRouter);
  app.use("/api/sites", forecastRouter);
  app.use("/api/incidents", incidentRouter);
  app.use("/api/usage", usageRouter);
  app.use("/api/audit-logs", auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!isProduction) {
    app.locals.pretty = true;
  }

  return app;
}
