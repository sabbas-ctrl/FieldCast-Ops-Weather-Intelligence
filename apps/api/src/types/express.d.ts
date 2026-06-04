import type { MemberRole } from "../modules/demo/store.js";

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
