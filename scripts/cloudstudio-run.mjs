#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = resolve(projectRoot, 'node_modules/vite/bin/vite.js');
const controlEntry = resolve(projectRoot, 'server/control-plane/index.mjs');
const controlHost = '127.0.0.1';
const controlPort = 8788;
const controlHealthUrl = `http://${controlHost}:${controlPort}/api/control/v1/health`;
const memberPort = 3000;
const adminPort = 3001;
const shutdownGraceMs = 5_000;
const startupTimeoutMs = 30_000;

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  console.error(`[cloudstudio] Node.js 20 or newer is required; current version is ${process.version}.`);
  process.exit(1);
}

if (!existsSync(viteBin)) {
  console.error('[cloudstudio] Vite is not installed. Run npm install before starting the services.');
  process.exit(1);
}

if (!existsSync(controlEntry)) {
  console.error(`[cloudstudio] Control-plane entry is missing: ${controlEntry}`);
  process.exit(1);
}

const adminEntryFiles = [
  resolve(projectRoot, 'admin.html'),
  resolve(projectRoot, 'src/admin/main.tsx'),
];
const missingAdminEntries = adminEntryFiles.filter((entry) => !existsSync(entry));

if (missingAdminEntries.length > 0) {
  console.warn('[cloudstudio] Admin UI entry is incomplete. Port 3001 will expose control health only until these files exist:');
  for (const entry of missingAdminEntries) {
    console.warn(`[cloudstudio]   - ${entry}`);
  }
}

const children = new Map();
let shuttingDown = false;

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once('exit', resolveExit));
}

async function shutdown(exitCode, reason, signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  const log = exitCode === 0 ? console.log : console.error;
  log(`[cloudstudio] ${reason}`);

  const runningChildren = [...children.values()].filter(
    ({ child }) => child.exitCode === null && child.signalCode === null,
  );

  for (const { child } of runningChildren) {
    child.kill(signal);
  }

  const gracefulExit = Promise.all(runningChildren.map(({ child }) => waitForExit(child)));
  const graceExpired = new Promise((resolveGrace) => {
    const timer = setTimeout(resolveGrace, shutdownGraceMs);
    timer.unref();
  });

  await Promise.race([gracefulExit, graceExpired]);

  for (const { child } of runningChildren) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }

}

function startChild(name, args, extraEnv = {}) {
  const child = spawn(
    process.execPath,
    args,
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    },
  );

  children.set(name, { child });

  child.once('error', (error) => {
    void shutdown(1, `${name} failed to start: ${error.message}`);
  });

  child.once('exit', (code, childSignal) => {
    if (shuttingDown) return;
    const detail = childSignal ? `signal ${childSignal}` : `exit code ${code ?? 'unknown'}`;
    const failureCode = typeof code === 'number' && code > 0 ? code : 1;
    void shutdown(failureCode, `${name} stopped unexpectedly (${detail}); stopping the service group.`);
  });

  console.log(`[cloudstudio] Started ${name} (pid ${child.pid ?? 'unknown'}).`);
  return child;
}

function startVite(name, configFile, port, surface) {
  const child = startChild(
    name,
    [
      viteBin,
      '--force',
      '--config',
      configFile,
      '--host',
      '0.0.0.0',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      STELLAR_SURFACE: surface,
      VITE_APP_SURFACE: surface,
    },
  );
  console.log(`[cloudstudio] ${name} is assigned to 0.0.0.0:${port}.`);
  return child;
}

const delay = (durationMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));

async function waitForService(name, url, timeoutMs = startupTimeoutMs) {
  const startedAt = Date.now();
  let lastError = 'service has not responded yet';

  while (!shuttingDown && Date.now() - startedAt < timeoutMs) {
    const controller = new AbortController();
    const requestTimer = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
      });
      await response.body?.cancel();
      if (response.ok) {
        console.log(`[cloudstudio] ${name} is healthy at ${url}.`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(requestTimer);
    }

    await delay(500);
  }

  if (shuttingDown) return;
  throw new Error(`${name} did not become healthy within ${timeoutMs}ms: ${lastError}`);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    const exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129;
    void shutdown(exitCode, `Received ${signal}; stopping the service group.`, signal);
  });
}

process.once('uncaughtException', (error) => {
  void shutdown(1, `Uncaught exception: ${error.stack ?? error.message}`);
});

process.once('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  void shutdown(1, `Unhandled rejection: ${message}`);
});

async function main() {
  startChild('control plane', [controlEntry], {
    CONTROL_PLANE_HOST: controlHost,
    CONTROL_PLANE_PORT: String(controlPort),
  });
  await waitForService('control plane', controlHealthUrl);
  if (shuttingDown) return;
  startVite('member Vite', 'vite.config.ts', memberPort, 'member');
  startVite('admin Vite', 'vite.admin.config.ts', adminPort, 'admin');
  await Promise.all([
    waitForService('member Vite proxy', `http://127.0.0.1:${memberPort}/control/health`),
    waitForService('admin Vite proxy', `http://127.0.0.1:${adminPort}/control/health`),
  ]);
  if (!shuttingDown) console.log('[cloudstudio] Service group is ready.');
}

main().catch((error) => {
  void shutdown(1, `Startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
