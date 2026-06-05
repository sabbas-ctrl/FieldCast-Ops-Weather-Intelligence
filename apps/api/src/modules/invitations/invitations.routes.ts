import { Router } from "express";
import { z } from "zod";
import { asyncHandler, routeParam } from "../../utils/http.js";
import { acceptInvitation } from "../workspaces/workspaces.service.js";

const router = Router();

router.post(
  "/invitations/:token/accept",
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2),
        password: z.string().min(8)
      })
      .strict()
      .parse(request.body);
    response.status(201).json(await acceptInvitation({ token: routeParam(request.params.token, "token"), ...body }));
  })
);

export const invitationRouter = router;
