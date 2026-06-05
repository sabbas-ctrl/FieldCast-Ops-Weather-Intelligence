import type { MemberRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        memberId: string;
        workspaceId: string;
        role: MemberRole;
      };
    }
  }
}

export {};
