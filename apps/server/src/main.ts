/** pnpm hub — start the dashboard API (see server.ts). */
import { loadConfig } from "@agenthub/core/config";
import { createHubServer, Hub } from "./server.ts";

try {
  process.loadEnvFile();
} catch {} // .env is optional

const hub = new Hub(await loadConfig());
const port = Number(process.env.AGENTHUB_PORT ?? 4317);
createHubServer(hub).listen(port, "127.0.0.1", () =>
  console.log(`Agent Hub API: http://127.0.0.1:${port} (runtime=${hub.cfg.runtime})`),
);
process.on("SIGINT", () => void hub.stop().then(() => process.exit(130)));
