import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  ENCRYPTION_KEY: z.string().default("dev-only-not-production-safe-key"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  WEATHERAI_BASE_URL: z.string().url().default("https://api.weather-ai.co"),
  WEATHERAI_PLATFORM_API_KEY: z.string().optional(),
  NOMINATIM_BASE_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: z
    .string()
    .default("FieldCastOpsWeatherIntelligence/0.1 (development; contact: noreply@visionindex.studio)"),
  PHOTON_BASE_URL: z.string().url().default("https://photon.komoot.io"),
  RESEND_API_URL: z.string().url().default("https://api.resend.com"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  RESEND_REPLY_TO: z.string().email().optional()
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
