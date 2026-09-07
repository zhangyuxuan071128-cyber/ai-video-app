#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { startControlPlaneServer } from "./http.mjs";

export { createControlPlaneHttpServer, startControlPlaneServer } from "./http.mjs";
export { createControlPlane, ControlPlane, ControlPlaneError } from "./control-plane.mjs";
export { AtomicJsonStore, SCHEMA_VERSION } from "./store.mjs";

async function main() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(`Node.js 20 or newer is required; current version is ${process.version}`);
  }
  const running = await startControlPlaneServer();
  console.log(`[control-plane] listening on ${running.url}`);
  console.log(`[control-plane] data file: ${running.controlPlane.store.filePath}`);
  if (!process.env.CONTROL_PLANE_MASTER_KEY) {
    console.warn("[control-plane] CONTROL_PLANE_MASTER_KEY is not configured; provider and partner secrets are rejected.");
  }

  let closing = false;
  const close = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[control-plane] received ${signal}; shutting down`);
    await running.close();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      void close(signal).then(() => process.exit(0), (error) => {
        console.error(error);
        process.exit(1);
      });
    });
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[control-plane] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
