import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/http.js";
import { searchLocations } from "./locations.service.js";

const router = Router();

router.get(
  "/search",
  asyncHandler(async (request, response) => {
    const query = z
      .object({
        q: z.string().trim().default(""),
        countryCode: z.string().trim().length(2).optional()
      })
      .strict()
      .parse(request.query);

    response.json(await searchLocations(query.q, query.countryCode));
  })
);

export const locationsRouter = router;
