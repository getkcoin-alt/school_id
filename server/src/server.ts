import { buildApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { closeQueues } from "./lib/queue.js";

const app = await buildApp();
await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await closeQueues();
    await prisma.$disconnect();
    process.exit(0);
  });
}
