import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/http.js";
import {
  login,
  logout,
  me,
  refresh,
  refreshCookieName,
  refreshCookieOptions,
  registerIndividual,
  registerOrganisation
} from "./auth.service.js";

const router = Router();

const passwordSchema = z.string().min(8);
const optionalText = z.string().trim().min(1).optional();

router.post(
  "/register/individual",
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2),
        email: z.string().trim().toLowerCase().email(),
        password: passwordSchema,
        preferredUnits: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
        country: optionalText,
        timezone: optionalText,
        defaultLocation: z
          .object({
            name: z.string().trim().min(2),
            country: z.string().trim().min(2),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            timezone: z.string().trim().min(1).default("UTC")
          })
          .strict()
          .optional()
      })
      .strict()
      .parse(request.body);

    const result = await registerIndividual(body);
    response.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions);
    response.status(201).json({ ...result, refreshToken: undefined });
  })
);

router.post(
  "/register/organisation",
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        organisationName: z.string().trim().min(2),
        industry: optionalText,
        adminFullName: z.string().trim().min(2),
        adminEmail: z.string().trim().toLowerCase().email(),
        password: passwordSchema,
        country: z.string().trim().min(2),
        timezone: z.string().trim().min(1).default("UTC")
      })
      .strict()
      .parse(request.body);

    const result = await registerOrganisation(body);
    response.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions);
    response.status(201).json({ ...result, refreshToken: undefined });
  })
);

router.post(
  "/login",
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        password: passwordSchema,
        workspaceId: z.string().optional()
      })
      .strict()
      .parse(request.body);

    const result = await login(body);
    response.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions);
    response.json({ ...result, refreshToken: undefined });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (request, response) => {
    response.json(await refresh(request.cookies[refreshCookieName]));
  })
);

router.post(
  "/logout",
  asyncHandler(async (request, response) => {
    await logout(request.cookies[refreshCookieName]);
    response.clearCookie(refreshCookieName, refreshCookieOptions);
    response.status(204).send();
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    const auth = request.auth!;
    response.json(await me(auth.userId, auth.memberId));
  })
);

export const authRouter = router;
