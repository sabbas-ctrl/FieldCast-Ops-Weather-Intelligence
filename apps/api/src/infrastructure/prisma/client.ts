import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var fieldcastPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.fieldcastPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.fieldcastPrisma = prisma;
}
