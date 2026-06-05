import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./infrastructure/prisma/client.js";
import { seedDemoDataIfEmpty } from "./modules/db/seed.js";

async function main() {
  await prisma.$connect();
  await seedDemoDataIfEmpty();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`FieldCast Ops API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("FieldCast Ops API failed to start");
  console.error(error);
  process.exit(1);
});
